use anchor_lang::prelude::*;

declare_id!("FWoyTYv4QLKjebwWgiVivNcfsDowP2CdrtARrY4qVVvH");

#[program]
pub mod agent_registry {
    use super::*;

    /// Register a new agent by linking their Ed25519 public key to a Solana wallet.
    /// The agent_pubkey is stored as a 32-byte array (raw Ed25519 public key).
    /// A PDA is derived from ["agent", agent_pubkey] to ensure uniqueness.
    pub fn register_agent(
        ctx: Context<RegisterAgent>,
        agent_pubkey: [u8; 32],
    ) -> Result<()> {
        let record = &mut ctx.accounts.agent_record;
        record.agent_pubkey = Pubkey::new_from_array(agent_pubkey);
        record.wallet = ctx.accounts.wallet.key();
        record.registered_at = Clock::get()?.unix_timestamp;
        record.total_sales = 0;
        record.total_purchases = 0;
        record.positive_ratings = 0;
        record.negative_ratings = 0;
        record.is_verified = false;
        record.bump = ctx.bumps.agent_record;

        emit!(AgentRegistered {
            agent_pubkey: record.agent_pubkey,
            wallet: record.wallet,
            registered_at: record.registered_at,
        });

        msg!("Agent registered: {}", record.agent_pubkey);
        Ok(())
    }

    /// Update the Solana wallet associated with an agent.
    /// Only the current wallet owner can update it.
    pub fn update_wallet(ctx: Context<UpdateWallet>, new_wallet: Pubkey) -> Result<()> {
        let record = &mut ctx.accounts.agent_record;
        let old_wallet = record.wallet;
        record.wallet = new_wallet;

        emit!(WalletUpdated {
            agent_pubkey: record.agent_pubkey,
            old_wallet,
            new_wallet,
        });

        msg!("Wallet updated for agent: {}", record.agent_pubkey);
        Ok(())
    }

    /// Mark an agent as verified. Admin only.
    pub fn verify_agent(ctx: Context<VerifyAgent>) -> Result<()> {
        let record = &mut ctx.accounts.agent_record;
        record.is_verified = true;

        emit!(AgentVerified {
            agent_pubkey: record.agent_pubkey,
        });

        msg!("Agent verified: {}", record.agent_pubkey);
        Ok(())
    }

    /// Increment sales counter for an agent. Called by marketplace/escrow via CPI.
    pub fn increment_sales(ctx: Context<UpdateStats>) -> Result<()> {
        let record = &mut ctx.accounts.agent_record;
        record.total_sales = record.total_sales.checked_add(1).unwrap();
        Ok(())
    }

    /// Increment purchases counter for an agent. Called by marketplace/escrow via CPI.
    pub fn increment_purchases(ctx: Context<UpdateStats>) -> Result<()> {
        let record = &mut ctx.accounts.agent_record;
        record.total_purchases = record.total_purchases.checked_add(1).unwrap();
        Ok(())
    }

    /// Record a positive or negative rating for an agent.
    pub fn rate_agent(ctx: Context<UpdateStats>, positive: bool) -> Result<()> {
        let record = &mut ctx.accounts.agent_record;
        if positive {
            record.positive_ratings = record.positive_ratings.checked_add(1).unwrap();
        } else {
            record.negative_ratings = record.negative_ratings.checked_add(1).unwrap();
        }
        Ok(())
    }
}

// ─── Accounts ───────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(agent_pubkey: [u8; 32])]
pub struct RegisterAgent<'info> {
    #[account(
        init,
        payer = wallet,
        space = 8 + AgentRecord::INIT_SPACE,
        seeds = [b"agent", agent_pubkey.as_ref()],
        bump,
    )]
    pub agent_record: Account<'info, AgentRecord>,

    #[account(mut)]
    pub wallet: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateWallet<'info> {
    #[account(
        mut,
        has_one = wallet,
    )]
    pub agent_record: Account<'info, AgentRecord>,

    pub wallet: Signer<'info>,
}

#[derive(Accounts)]
pub struct VerifyAgent<'info> {
    #[account(mut)]
    pub agent_record: Account<'info, AgentRecord>,

    #[account(
        constraint = admin.key() == ADMIN_PUBKEY @ ErrorCode::Unauthorized
    )]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateStats<'info> {
    #[account(mut)]
    pub agent_record: Account<'info, AgentRecord>,

    pub authority: Signer<'info>,
}

// ─── State ──────────────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct AgentRecord {
    pub agent_pubkey: Pubkey,      // Ed25519 public key (agent identity)
    pub wallet: Pubkey,            // Solana wallet for payments
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
pub struct AgentRegistered {
    pub agent_pubkey: Pubkey,
    pub wallet: Pubkey,
    pub registered_at: i64,
}

#[event]
pub struct WalletUpdated {
    pub agent_pubkey: Pubkey,
    pub old_wallet: Pubkey,
    pub new_wallet: Pubkey,
}

#[event]
pub struct AgentVerified {
    pub agent_pubkey: Pubkey,
}

// ─── Errors ─────────────────────────────────────────────────────────────────

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized: only admin can perform this action")]
    Unauthorized,
}

// ─── Constants ──────────────────────────────────────────────────────────────

// Admin pubkey — replace with actual admin wallet in production
pub const ADMIN_PUBKEY: Pubkey = pubkey!("BnRFhDAdrSVyo3xGxtY65FmgYcMguc4kBR4CGjogvY4");
