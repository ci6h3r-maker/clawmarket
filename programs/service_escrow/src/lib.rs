use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("HrtWJH6o9xpvVebvi5NmjdX2NPRPWrayXVSsjsRc4Phb");

// Platform fee: 5% (500 basis points), 4% for verified workers (400 basis points)
pub const PLATFORM_FEE_BPS: u64 = 500;
pub const VERIFIED_FEE_BPS: u64 = 400;
pub const BPS_DENOMINATOR: u64 = 10_000;

// Auto-release timeout: 7 days after submission (buyer dispute window)
pub const AUTO_RELEASE_TIMEOUT: i64 = 7 * 24 * 60 * 60;

// Admin pubkey — replace with actual admin wallet in production
pub const ADMIN_PUBKEY: Pubkey = pubkey!("BnRFhDAdrSVyo3xGxtY65FmgYcMguc4kBR4CGjogvY4");

#[program]
pub mod service_escrow {
    use super::*;

    /// Post a new job. Locks USDC payment in an escrow PDA.
    pub fn post_job(
        ctx: Context<PostJob>,
        payment: u64,
        description_hash: [u8; 32],
        deadline: i64,
    ) -> Result<()> {
        require!(payment > 0, ErrorCode::InvalidPayment);

        let now = Clock::get()?.unix_timestamp;
        require!(deadline > now, ErrorCode::InvalidDeadline);

        // Transfer USDC from client to escrow vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.client_token_account.to_account_info(),
                    to: ctx.accounts.escrow_vault.to_account_info(),
                    authority: ctx.accounts.client.to_account_info(),
                },
            ),
            payment,
        )?;

        let job = &mut ctx.accounts.job;
        job.client = ctx.accounts.client.key();
        job.worker = None;
        job.payment = payment;
        job.description_hash = description_hash;
        job.deliverable_hash = None;
        job.status = JobStatus::Open;
        job.created_at = now;
        job.claimed_at = None;
        job.submitted_at = None;
        job.deadline = deadline;
        job.bump = ctx.bumps.job;

        emit!(JobPosted {
            job: job.key(),
            client: job.client,
            payment,
            description_hash,
            deadline,
        });

        msg!("Job posted: {}", job.key());
        Ok(())
    }

    /// Claim an open job as a worker.
    pub fn claim_job(ctx: Context<ClaimJob>) -> Result<()> {
        let job = &mut ctx.accounts.job;
        require!(job.status == JobStatus::Open, ErrorCode::JobNotOpen);

        let now = Clock::get()?.unix_timestamp;
        require!(now < job.deadline, ErrorCode::DeadlinePassed);

        job.worker = Some(ctx.accounts.worker.key());
        job.status = JobStatus::Claimed;
        job.claimed_at = Some(now);

        emit!(JobClaimed {
            job: job.key(),
            worker: ctx.accounts.worker.key(),
            claimed_at: now,
        });

        msg!("Job claimed by: {}", ctx.accounts.worker.key());
        Ok(())
    }

    /// Submit completed work for a claimed job.
    pub fn submit_work(
        ctx: Context<SubmitWork>,
        deliverable_hash: [u8; 32],
    ) -> Result<()> {
        let job = &mut ctx.accounts.job;
        require!(job.status == JobStatus::Claimed, ErrorCode::JobNotClaimed);
        require!(
            job.worker == Some(ctx.accounts.worker.key()),
            ErrorCode::NotAssignedWorker
        );

        let now = Clock::get()?.unix_timestamp;
        job.deliverable_hash = Some(deliverable_hash);
        job.status = JobStatus::Submitted;
        job.submitted_at = Some(now);

        emit!(WorkSubmitted {
            job: job.key(),
            worker: ctx.accounts.worker.key(),
            deliverable_hash,
            submitted_at: now,
        });

        msg!("Work submitted for job: {}", job.key());
        Ok(())
    }

    /// Client accepts submitted work. Releases escrow to worker (minus fee).
    pub fn accept_work(ctx: Context<AcceptWork>) -> Result<()> {
        let job = &mut ctx.accounts.job;
        require!(job.status == JobStatus::Submitted, ErrorCode::JobNotSubmitted);

        let fee_bps = if ctx.accounts.worker_record.is_verified {
            VERIFIED_FEE_BPS
        } else {
            PLATFORM_FEE_BPS
        };

        let fee_amount = job
            .payment
            .checked_mul(fee_bps)
            .unwrap()
            .checked_div(BPS_DENOMINATOR)
            .unwrap();
        let worker_amount = job.payment.checked_sub(fee_amount).unwrap();

        let job_key = job.key();
        let seeds = &[b"escrow_vault".as_ref(), job_key.as_ref(), &[ctx.bumps.escrow_vault_authority]];
        let signer_seeds = &[&seeds[..]];

        // Transfer fee to platform vault
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_vault.to_account_info(),
                    to: ctx.accounts.fee_vault.to_account_info(),
                    authority: ctx.accounts.escrow_vault_authority.to_account_info(),
                },
                signer_seeds,
            ),
            fee_amount,
        )?;

        // Transfer payment to worker
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_vault.to_account_info(),
                    to: ctx.accounts.worker_token_account.to_account_info(),
                    authority: ctx.accounts.escrow_vault_authority.to_account_info(),
                },
                signer_seeds,
            ),
            worker_amount,
        )?;

        job.status = JobStatus::Completed;

        emit!(JobCompleted {
            job: job.key(),
            client: job.client,
            worker: job.worker.unwrap(),
            payment: job.payment,
            fee: fee_amount,
        });

        msg!("Job completed: {}", job.key());
        Ok(())
    }

    /// Client disputes submitted work. Flags for arbiter review.
    pub fn dispute_work(ctx: Context<DisputeWork>) -> Result<()> {
        let job = &mut ctx.accounts.job;
        require!(job.status == JobStatus::Submitted, ErrorCode::JobNotSubmitted);

        job.status = JobStatus::Disputed;

        emit!(JobDisputed {
            job: job.key(),
            client: job.client,
            worker: job.worker.unwrap(),
        });

        msg!("Job disputed: {}", job.key());
        Ok(())
    }

    /// Arbiter resolves a dispute. Sends funds to the winner.
    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        release_to_worker: bool,
    ) -> Result<()> {
        let job = &mut ctx.accounts.job;
        require!(job.status == JobStatus::Disputed, ErrorCode::JobNotDisputed);

        let job_key = job.key();
        let seeds = &[b"escrow_vault".as_ref(), job_key.as_ref(), &[ctx.bumps.escrow_vault_authority]];
        let signer_seeds = &[&seeds[..]];

        if release_to_worker {
            let fee_bps = PLATFORM_FEE_BPS;
            let fee_amount = job
                .payment
                .checked_mul(fee_bps)
                .unwrap()
                .checked_div(BPS_DENOMINATOR)
                .unwrap();
            let worker_amount = job.payment.checked_sub(fee_amount).unwrap();

            // Transfer fee
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.escrow_vault.to_account_info(),
                        to: ctx.accounts.fee_vault.to_account_info(),
                        authority: ctx.accounts.escrow_vault_authority.to_account_info(),
                    },
                    signer_seeds,
                ),
                fee_amount,
            )?;

            // Transfer to worker
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.escrow_vault.to_account_info(),
                        to: ctx.accounts.recipient_token_account.to_account_info(),
                        authority: ctx.accounts.escrow_vault_authority.to_account_info(),
                    },
                    signer_seeds,
                ),
                worker_amount,
            )?;
        } else {
            // Refund client in full
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.escrow_vault.to_account_info(),
                        to: ctx.accounts.recipient_token_account.to_account_info(),
                        authority: ctx.accounts.escrow_vault_authority.to_account_info(),
                    },
                    signer_seeds,
                ),
                job.payment,
            )?;
        }

        job.status = JobStatus::Completed;

        emit!(DisputeResolved {
            job: job.key(),
            release_to_worker,
        });

        msg!("Dispute resolved for job: {}", job.key());
        Ok(())
    }

    /// Cancel an unclaimed job. Refunds the client.
    pub fn cancel_job(ctx: Context<CancelJob>) -> Result<()> {
        let job = &mut ctx.accounts.job;
        require!(job.status == JobStatus::Open, ErrorCode::JobNotOpen);

        let job_key = job.key();
        let seeds = &[b"escrow_vault".as_ref(), job_key.as_ref(), &[ctx.bumps.escrow_vault_authority]];
        let signer_seeds = &[&seeds[..]];

        // Refund client
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_vault.to_account_info(),
                    to: ctx.accounts.client_token_account.to_account_info(),
                    authority: ctx.accounts.escrow_vault_authority.to_account_info(),
                },
                signer_seeds,
            ),
            job.payment,
        )?;

        job.status = JobStatus::Cancelled;

        emit!(JobCancelled {
            job: job.key(),
            client: job.client,
            refund: job.payment,
        });

        msg!("Job cancelled: {}", job.key());
        Ok(())
    }

    /// Admin force-refund: ClawMarket can refund buyer at any time for any reason.
    /// Use for: scam reports, mislabeled products, seller violations.
    /// Works on Open, Claimed, Submitted, or Disputed jobs (not Completed/Cancelled).
    pub fn admin_force_refund(ctx: Context<AdminForceRefund>) -> Result<()> {
        let job = &mut ctx.accounts.job;
        require!(
            job.status != JobStatus::Completed && job.status != JobStatus::Cancelled,
            ErrorCode::JobAlreadyFinalized
        );

        let job_key = job.key();
        let seeds = &[b"escrow_vault".as_ref(), job_key.as_ref(), &[ctx.bumps.escrow_vault_authority]];
        let signer_seeds = &[&seeds[..]];

        // Full refund to client — no fees taken on admin refunds
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_vault.to_account_info(),
                    to: ctx.accounts.client_token_account.to_account_info(),
                    authority: ctx.accounts.escrow_vault_authority.to_account_info(),
                },
                signer_seeds,
            ),
            job.payment,
        )?;

        job.status = JobStatus::Cancelled;

        emit!(AdminForceRefunded {
            job: job.key(),
            client: job.client,
            refund: job.payment,
            admin: ctx.accounts.admin.key(),
        });

        msg!("Admin force-refunded job: {}", job.key());
        Ok(())
    }

    /// Auto-release escrowed funds to worker 7 days after submission if client hasn't acted.
    /// Anyone can call this permissionlessly.
    pub fn auto_release(ctx: Context<AutoRelease>) -> Result<()> {
        let job = &mut ctx.accounts.job;
        require!(job.status == JobStatus::Submitted, ErrorCode::JobNotSubmitted);

        let now = Clock::get()?.unix_timestamp;
        let submitted_at = job.submitted_at.unwrap();
        require!(
            now >= submitted_at + AUTO_RELEASE_TIMEOUT,
            ErrorCode::AutoReleaseNotReady
        );

        let fee_bps = if ctx.accounts.worker_record.is_verified {
            VERIFIED_FEE_BPS
        } else {
            PLATFORM_FEE_BPS
        };

        let fee_amount = job
            .payment
            .checked_mul(fee_bps)
            .unwrap()
            .checked_div(BPS_DENOMINATOR)
            .unwrap();
        let worker_amount = job.payment.checked_sub(fee_amount).unwrap();

        let job_key = job.key();
        let seeds = &[b"escrow_vault".as_ref(), job_key.as_ref(), &[ctx.bumps.escrow_vault_authority]];
        let signer_seeds = &[&seeds[..]];

        // Transfer fee
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_vault.to_account_info(),
                    to: ctx.accounts.fee_vault.to_account_info(),
                    authority: ctx.accounts.escrow_vault_authority.to_account_info(),
                },
                signer_seeds,
            ),
            fee_amount,
        )?;

        // Transfer to worker
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_vault.to_account_info(),
                    to: ctx.accounts.worker_token_account.to_account_info(),
                    authority: ctx.accounts.escrow_vault_authority.to_account_info(),
                },
                signer_seeds,
            ),
            worker_amount,
        )?;

        job.status = JobStatus::Completed;

        emit!(JobAutoReleased {
            job: job.key(),
            worker: job.worker.unwrap(),
            payment: job.payment,
            fee: fee_amount,
        });

        msg!("Auto-released job: {}", job.key());
        Ok(())
    }
}

// ─── Accounts ───────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(payment: u64, description_hash: [u8; 32])]
pub struct PostJob<'info> {
    #[account(
        init,
        payer = client,
        space = 8 + Job::INIT_SPACE,
        seeds = [b"job", client.key().as_ref(), description_hash.as_ref()],
        bump,
    )]
    pub job: Box<Account<'info, Job>>,

    #[account(
        init,
        payer = client,
        token::mint = usdc_mint,
        token::authority = escrow_vault_authority,
        seeds = [b"escrow_token", job.key().as_ref()],
        bump,
    )]
    pub escrow_vault: Box<Account<'info, TokenAccount>>,

    /// CHECK: PDA used as token authority for the escrow vault
    #[account(seeds = [b"escrow_vault", job.key().as_ref()], bump)]
    pub escrow_vault_authority: UncheckedAccount<'info>,

    pub usdc_mint: Box<Account<'info, anchor_spl::token::Mint>>,

    #[account(mut)]
    pub client: Signer<'info>,

    #[account(
        mut,
        constraint = client_token_account.owner == client.key() @ ErrorCode::InvalidTokenAccount,
        constraint = client_token_account.amount >= payment @ ErrorCode::InsufficientFunds,
    )]
    pub client_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ClaimJob<'info> {
    #[account(mut)]
    pub job: Account<'info, Job>,

    pub worker: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(deliverable_hash: [u8; 32])]
pub struct SubmitWork<'info> {
    #[account(mut)]
    pub job: Account<'info, Job>,

    pub worker: Signer<'info>,
}

#[derive(Accounts)]
pub struct AcceptWork<'info> {
    #[account(mut, has_one = client @ ErrorCode::NotClient)]
    pub job: Account<'info, Job>,

    /// Worker's AgentRecord to check verification status
    #[account(constraint = worker_record.wallet == job.worker.unwrap() @ ErrorCode::InvalidWorker)]
    pub worker_record: Account<'info, AgentRecord>,

    #[account(
        mut,
        seeds = [b"escrow_token", job.key().as_ref()],
        bump,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA authority for escrow vault
    #[account(seeds = [b"escrow_vault", job.key().as_ref()], bump)]
    pub escrow_vault_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub worker_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"fee_vault_token"],
        bump,
    )]
    pub fee_vault: Account<'info, TokenAccount>,

    pub client: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct DisputeWork<'info> {
    #[account(mut, has_one = client @ ErrorCode::NotClient)]
    pub job: Account<'info, Job>,

    pub client: Signer<'info>,
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(mut)]
    pub job: Account<'info, Job>,

    #[account(
        mut,
        seeds = [b"escrow_token", job.key().as_ref()],
        bump,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA authority for escrow vault
    #[account(seeds = [b"escrow_vault", job.key().as_ref()], bump)]
    pub escrow_vault_authority: UncheckedAccount<'info>,

    /// Token account of the winner (worker or client)
    #[account(mut)]
    pub recipient_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"fee_vault_token"],
        bump,
    )]
    pub fee_vault: Account<'info, TokenAccount>,

    #[account(constraint = arbiter.key() == ADMIN_PUBKEY @ ErrorCode::Unauthorized)]
    pub arbiter: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelJob<'info> {
    #[account(mut, has_one = client @ ErrorCode::NotClient)]
    pub job: Account<'info, Job>,

    #[account(
        mut,
        seeds = [b"escrow_token", job.key().as_ref()],
        bump,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA authority for escrow vault
    #[account(seeds = [b"escrow_vault", job.key().as_ref()], bump)]
    pub escrow_vault_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub client_token_account: Account<'info, TokenAccount>,

    pub client: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AdminForceRefund<'info> {
    #[account(mut)]
    pub job: Account<'info, Job>,

    #[account(
        mut,
        seeds = [b"escrow_token", job.key().as_ref()],
        bump,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA authority for escrow vault
    #[account(seeds = [b"escrow_vault", job.key().as_ref()], bump)]
    pub escrow_vault_authority: UncheckedAccount<'info>,

    /// Client's token account to receive refund
    #[account(mut, constraint = client_token_account.owner == job.client @ ErrorCode::InvalidTokenAccount)]
    pub client_token_account: Account<'info, TokenAccount>,

    /// Admin must be the platform admin
    #[account(constraint = admin.key() == ADMIN_PUBKEY @ ErrorCode::Unauthorized)]
    pub admin: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AutoRelease<'info> {
    #[account(mut)]
    pub job: Account<'info, Job>,

    /// Worker's AgentRecord to check verification status
    #[account(constraint = worker_record.wallet == job.worker.unwrap() @ ErrorCode::InvalidWorker)]
    pub worker_record: Account<'info, AgentRecord>,

    #[account(
        mut,
        seeds = [b"escrow_token", job.key().as_ref()],
        bump,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA authority for escrow vault
    #[account(seeds = [b"escrow_vault", job.key().as_ref()], bump)]
    pub escrow_vault_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub worker_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"fee_vault_token"],
        bump,
    )]
    pub fee_vault: Account<'info, TokenAccount>,

    /// Anyone can call auto_release
    pub caller: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

// ─── State ──────────────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct Job {
    pub client: Pubkey,
    pub worker: Option<Pubkey>,
    pub payment: u64,
    pub description_hash: [u8; 32],
    pub deliverable_hash: Option<[u8; 32]>,
    pub status: JobStatus,
    pub created_at: i64,
    pub claimed_at: Option<i64>,
    pub submitted_at: Option<i64>,
    pub deadline: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum JobStatus {
    Open,
    Claimed,
    Submitted,
    Completed,
    Disputed,
    Cancelled,
}

/// Imported from agent_registry for cross-program reads
#[account]
#[derive(InitSpace)]
pub struct AgentRecord {
    pub agent_pubkey: Pubkey,
    pub wallet: Pubkey,
    pub registered_at: i64,
    pub total_sales: u64,
    pub total_purchases: u64,
    pub positive_ratings: u64,
    pub negative_ratings: u64,
    pub is_verified: bool,
    pub bump: u8,
}

// ─── Events ─────────────────────────────────────────────────────────────────

#[event]
pub struct JobPosted {
    pub job: Pubkey,
    pub client: Pubkey,
    pub payment: u64,
    pub description_hash: [u8; 32],
    pub deadline: i64,
}

#[event]
pub struct JobClaimed {
    pub job: Pubkey,
    pub worker: Pubkey,
    pub claimed_at: i64,
}

#[event]
pub struct WorkSubmitted {
    pub job: Pubkey,
    pub worker: Pubkey,
    pub deliverable_hash: [u8; 32],
    pub submitted_at: i64,
}

#[event]
pub struct JobCompleted {
    pub job: Pubkey,
    pub client: Pubkey,
    pub worker: Pubkey,
    pub payment: u64,
    pub fee: u64,
}

#[event]
pub struct JobDisputed {
    pub job: Pubkey,
    pub client: Pubkey,
    pub worker: Pubkey,
}

#[event]
pub struct DisputeResolved {
    pub job: Pubkey,
    pub release_to_worker: bool,
}

#[event]
pub struct JobCancelled {
    pub job: Pubkey,
    pub client: Pubkey,
    pub refund: u64,
}

#[event]
pub struct JobAutoReleased {
    pub job: Pubkey,
    pub worker: Pubkey,
    pub payment: u64,
    pub fee: u64,
}

#[event]
pub struct AdminForceRefunded {
    pub job: Pubkey,
    pub client: Pubkey,
    pub refund: u64,
    pub admin: Pubkey,
}

// ─── Errors ─────────────────────────────────────────────────────────────────

#[error_code]
pub enum ErrorCode {
    #[msg("Payment must be greater than zero")]
    InvalidPayment,
    #[msg("Deadline must be in the future")]
    InvalidDeadline,
    #[msg("Job is not open")]
    JobNotOpen,
    #[msg("Job is not claimed")]
    JobNotClaimed,
    #[msg("Job is not submitted")]
    JobNotSubmitted,
    #[msg("Job is not disputed")]
    JobNotDisputed,
    #[msg("Deadline has passed")]
    DeadlinePassed,
    #[msg("Not the assigned worker")]
    NotAssignedWorker,
    #[msg("Not the client")]
    NotClient,
    #[msg("Invalid token account")]
    InvalidTokenAccount,
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Invalid worker record")]
    InvalidWorker,
    #[msg("Auto-release not ready: 7 days have not passed since submission")]
    AutoReleaseNotReady,
    #[msg("Unauthorized: only admin/arbiter can perform this action")]
    Unauthorized,
    #[msg("Job already finalized (completed or cancelled)")]
    JobAlreadyFinalized,
}
