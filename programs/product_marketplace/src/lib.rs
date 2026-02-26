use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("37XggunG3YEJqaf77AFYU4ceMAt4A5ptJK96WLEnHL46");

// Platform fee: 5% (500 basis points), 4% for verified sellers (400 basis points)
pub const PLATFORM_FEE_BPS: u64 = 500;
pub const VERIFIED_FEE_BPS: u64 = 400;
pub const BPS_DENOMINATOR: u64 = 10_000;

// Admin pubkey — replace with actual admin wallet in production
pub const ADMIN_PUBKEY: Pubkey = pubkey!("BnRFhDAdrSVyo3xGxtY65FmgYcMguc4kBR4CGjogvY4");

#[program]
pub mod product_marketplace {
    use super::*;

    /// Create a new product listing.
    pub fn create_listing(
        ctx: Context<CreateListing>,
        price: u64,
        content_hash: [u8; 32],
    ) -> Result<()> {
        require!(price > 0, ErrorCode::InvalidPrice);

        let listing = &mut ctx.accounts.listing;
        listing.seller = ctx.accounts.seller.key();
        listing.price = price;
        listing.content_hash = content_hash;
        listing.created_at = Clock::get()?.unix_timestamp;
        listing.active = true;
        listing.sales_count = 0;
        listing.positive_ratings = 0;
        listing.negative_ratings = 0;
        listing.bump = ctx.bumps.listing;

        emit!(ListingCreated {
            listing: listing.key(),
            seller: listing.seller,
            price,
            content_hash,
            created_at: listing.created_at,
        });

        msg!("Listing created: {}", listing.key());
        Ok(())
    }

    /// Purchase a listing. Transfers USDC from buyer to seller (minus platform fee).
    /// Fee goes to the fee vault PDA.
    pub fn purchase(ctx: Context<Purchase>) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        require!(listing.active, ErrorCode::ListingInactive);

        let price = listing.price;

        // Determine fee rate based on seller verification status
        let fee_bps = if ctx.accounts.seller_record.is_verified {
            VERIFIED_FEE_BPS
        } else {
            PLATFORM_FEE_BPS
        };

        let fee_amount = price
            .checked_mul(fee_bps)
            .unwrap()
            .checked_div(BPS_DENOMINATOR)
            .unwrap();
        let seller_amount = price.checked_sub(fee_amount).unwrap();

        // Transfer fee to vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.buyer_token_account.to_account_info(),
                    to: ctx.accounts.fee_vault.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            fee_amount,
        )?;

        // Transfer payment to seller
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.buyer_token_account.to_account_info(),
                    to: ctx.accounts.seller_token_account.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            seller_amount,
        )?;

        listing.sales_count = listing.sales_count.checked_add(1).unwrap();

        // Record the purchase for the buyer
        let receipt = &mut ctx.accounts.purchase_receipt;
        receipt.buyer = ctx.accounts.buyer.key();
        receipt.listing = listing.key();
        receipt.price = price;
        receipt.purchased_at = Clock::get()?.unix_timestamp;
        receipt.content_hash = listing.content_hash;
        receipt.has_rated = false;
        receipt.bump = ctx.bumps.purchase_receipt;

        emit!(PurchaseCompleted {
            listing: listing.key(),
            buyer: ctx.accounts.buyer.key(),
            seller: listing.seller,
            price,
            fee: fee_amount,
            content_hash: listing.content_hash,
        });

        msg!("Purchase completed for listing: {}", listing.key());
        Ok(())
    }

    /// Rate a listing. Only buyers who purchased can rate, and only once.
    pub fn rate_listing(ctx: Context<RateListing>, positive: bool) -> Result<()> {
        let receipt = &mut ctx.accounts.purchase_receipt;
        require!(!receipt.has_rated, ErrorCode::AlreadyRated);
        receipt.has_rated = true;

        let listing = &mut ctx.accounts.listing;
        if positive {
            listing.positive_ratings = listing.positive_ratings.checked_add(1).unwrap();
        } else {
            listing.negative_ratings = listing.negative_ratings.checked_add(1).unwrap();
        }

        emit!(ListingRated {
            listing: listing.key(),
            buyer: ctx.accounts.buyer.key(),
            positive,
        });

        Ok(())
    }

    /// Deactivate a listing. Only the seller can deactivate.
    pub fn deactivate_listing(ctx: Context<DeactivateListing>) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        listing.active = false;

        emit!(ListingDeactivated {
            listing: listing.key(),
            seller: listing.seller,
        });

        msg!("Listing deactivated: {}", listing.key());
        Ok(())
    }

    /// Initialize the fee vault. Admin only, called once.
    pub fn initialize_fee_vault(ctx: Context<InitializeFeeVault>) -> Result<()> {
        msg!("Fee vault initialized: {}", ctx.accounts.fee_vault.key());
        Ok(())
    }

    /// Withdraw accumulated fees from the vault. Admin only.
    pub fn withdraw_fees(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
        let seeds = &[b"fee_vault".as_ref(), &[ctx.bumps.fee_vault_authority]];
        let signer_seeds = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.fee_vault.to_account_info(),
                    to: ctx.accounts.admin_token_account.to_account_info(),
                    authority: ctx.accounts.fee_vault_authority.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        msg!("Fees withdrawn: {}", amount);
        Ok(())
    }
}

// ─── Accounts ───────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(price: u64, content_hash: [u8; 32])]
pub struct CreateListing<'info> {
    #[account(
        init,
        payer = seller,
        space = 8 + Listing::INIT_SPACE,
        seeds = [b"listing", seller.key().as_ref(), content_hash.as_ref()],
        bump,
    )]
    pub listing: Account<'info, Listing>,

    #[account(mut)]
    pub seller: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Purchase<'info> {
    #[account(mut, constraint = listing.active @ ErrorCode::ListingInactive)]
    pub listing: Account<'info, Listing>,

    /// The seller's AgentRecord to check verification status
    #[account(constraint = seller_record.wallet == listing.seller @ ErrorCode::InvalidSeller)]
    pub seller_record: Account<'info, AgentRecord>,

    #[account(
        init,
        payer = buyer,
        space = 8 + PurchaseReceipt::INIT_SPACE,
        seeds = [b"receipt", listing.key().as_ref(), buyer.key().as_ref()],
        bump,
    )]
    pub purchase_receipt: Account<'info, PurchaseReceipt>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        constraint = buyer_token_account.owner == buyer.key() @ ErrorCode::InvalidTokenAccount,
        constraint = buyer_token_account.amount >= listing.price @ ErrorCode::InsufficientFunds,
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = seller_token_account.owner == listing.seller @ ErrorCode::InvalidTokenAccount,
    )]
    pub seller_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"fee_vault_token"],
        bump,
    )]
    pub fee_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RateListing<'info> {
    #[account(mut)]
    pub listing: Account<'info, Listing>,

    #[account(
        mut,
        seeds = [b"receipt", listing.key().as_ref(), buyer.key().as_ref()],
        bump = purchase_receipt.bump,
        constraint = purchase_receipt.buyer == buyer.key() @ ErrorCode::NotBuyer,
    )]
    pub purchase_receipt: Account<'info, PurchaseReceipt>,

    pub buyer: Signer<'info>,
}

#[derive(Accounts)]
pub struct DeactivateListing<'info> {
    #[account(
        mut,
        has_one = seller @ ErrorCode::NotSeller,
    )]
    pub listing: Account<'info, Listing>,

    pub seller: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitializeFeeVault<'info> {
    #[account(
        init,
        payer = admin,
        token::mint = usdc_mint,
        token::authority = fee_vault_authority,
        seeds = [b"fee_vault_token"],
        bump,
    )]
    pub fee_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA used as token authority
    #[account(seeds = [b"fee_vault"], bump)]
    pub fee_vault_authority: UncheckedAccount<'info>,

    pub usdc_mint: Account<'info, anchor_spl::token::Mint>,

    #[account(
        mut,
        constraint = admin.key() == ADMIN_PUBKEY @ ErrorCode::Unauthorized
    )]
    pub admin: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    #[account(
        mut,
        seeds = [b"fee_vault_token"],
        bump,
    )]
    pub fee_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA used as token authority for the fee vault
    #[account(seeds = [b"fee_vault"], bump)]
    pub fee_vault_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub admin_token_account: Account<'info, TokenAccount>,

    #[account(
        constraint = admin.key() == ADMIN_PUBKEY @ ErrorCode::Unauthorized
    )]
    pub admin: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

// ─── State ──────────────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct Listing {
    pub seller: Pubkey,
    pub price: u64,
    pub content_hash: [u8; 32],
    pub created_at: i64,
    pub active: bool,
    pub sales_count: u64,
    pub positive_ratings: u64,
    pub negative_ratings: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct PurchaseReceipt {
    pub buyer: Pubkey,
    pub listing: Pubkey,
    pub price: u64,
    pub purchased_at: i64,
    pub content_hash: [u8; 32],
    pub has_rated: bool,
    pub bump: u8,
}

/// Imported from agent_registry for CPI reads
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
pub struct ListingCreated {
    pub listing: Pubkey,
    pub seller: Pubkey,
    pub price: u64,
    pub content_hash: [u8; 32],
    pub created_at: i64,
}

#[event]
pub struct PurchaseCompleted {
    pub listing: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub price: u64,
    pub fee: u64,
    pub content_hash: [u8; 32],
}

#[event]
pub struct ListingRated {
    pub listing: Pubkey,
    pub buyer: Pubkey,
    pub positive: bool,
}

#[event]
pub struct ListingDeactivated {
    pub listing: Pubkey,
    pub seller: Pubkey,
}

// ─── Errors ─────────────────────────────────────────────────────────────────

#[error_code]
pub enum ErrorCode {
    #[msg("Price must be greater than zero")]
    InvalidPrice,
    #[msg("Listing is not active")]
    ListingInactive,
    #[msg("Invalid token account owner")]
    InvalidTokenAccount,
    #[msg("Insufficient funds for purchase")]
    InsufficientFunds,
    #[msg("Invalid seller record")]
    InvalidSeller,
    #[msg("Only the buyer can perform this action")]
    NotBuyer,
    #[msg("Only the seller can perform this action")]
    NotSeller,
    #[msg("Already rated this listing")]
    AlreadyRated,
    #[msg("Unauthorized: only admin can perform this action")]
    Unauthorized,
}
