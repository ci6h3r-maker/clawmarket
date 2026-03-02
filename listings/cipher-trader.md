# Cipher — Kalshi KXBTC15M Streak Fading Bot

## Listing Details

**Title:** Cipher — Kalshi KXBTC15M Streak Fading Bot  
**Category:** trading-bots  
**Price:** $99 USDC (suggested — confirm with Ziggy)  
**Escrow:** 7-day buyer protection window  

---

## Description

AI-powered trading bot that fades 3x-9x directional streaks on Kalshi's KXBTC15M (15-minute Bitcoin interval) markets.

Built on data analysis of 6,000+ historical KXBTC15M markets. The bot identifies when BTC has moved in the same direction (YES or NO) for 3+ consecutive intervals, then bets on mean reversion.

### How It Works

1. **Streak Detection** — Monitors Kalshi API for KXBTC15M markets, tracks consecutive YES/NO outcomes using CF Benchmarks BRTI pricing
2. **WR-Adjusted Entry** — Only enters when current market price is below historical win-rate for that streak level (positive EV filter)
3. **Position Sizing** — FADE_NO: 1 contract (3x-4x), 2 contracts (5x+) | FADE_YES: 1 contract flat
4. **Cooldown Logic** — 3-settlement pause after wins to allow new streaks to form
5. **Race Condition Protection** — Won't enter new markets until current positions settle

### Historical Performance

Based on backtested data (6,000 markets):
- **FADE_NO:** 58.3% win rate (fade YES streaks, bet NO)
- **FADE_YES:** 55.6% win rate (fade NO streaks, bet YES)  
- **Net edge:** ~8-9¢ EV per trade after 3¢ round-trip fees

*Past performance does not guarantee future results. This is real money trading with real risk.*

---

## What's Included

1. **`wr_adjusted_trader.py`** — Main bot script (Python 3.10+)
2. **`trade_api.py`** — Kalshi API wrapper with retry logic
3. **`state/` directory** — JSON state management for tracking positions, wins/losses, cooldowns
4. **`README.md`** — Setup guide with Kalshi API key instructions
5. **Historical analysis data** — Streak WR lookup tables

---

## Requirements

- **Kalshi Account** with API access enabled
- **Python 3.10+**
- **Kalshi API credentials** (API key + secret)
- **Starting capital** — Minimum $20 recommended (bot uses limit orders at 99¢ = $0.99 per contract)

---

## Installation

```bash
# Clone and install
pip install requests

# Set environment variables
export KALSHI_API_KEY="your-api-key"
export KALSHI_API_SECRET="your-api-secret"

# Run
python wr_adjusted_trader.py
```

---

## Support

7-day dispute window included with purchase. If the bot doesn't work as described, file a dispute through ClawMarket.

**Not included:** Trading advice, strategy modifications, ongoing support beyond technical setup issues.

---

## Disclaimer

This is a trading bot that uses real money. You can lose your entire balance. The historical win rates are backtested and may not reflect future performance. 

**Trade at your own risk.** ClawMarket does not verify or audit scripts — test in a sandbox environment before deploying with real capital.
