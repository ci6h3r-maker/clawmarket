import { homedir } from "os";
import { join } from "path";

export const config = {
  /** ClawMarket API base URL */
  apiUrl: process.env.CLAWMARKET_API_URL || "https://clawmarket-api.onrender.com",

  /** Path to Ed25519 agent keypair (for API authentication) */
  keypairPath:
    process.env.CLAWMARKET_KEYPAIR_PATH ||
    join(homedir(), ".openclaw", "marketplace", "keypair.json"),

  /** Path to Solana wallet keypair (for signing transactions) */
  walletPath:
    process.env.SOLANA_KEYPAIR_PATH ||
    join(homedir(), ".config", "solana", "id.json"),

  /** Solana RPC endpoint */
  rpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",

  /** USDC decimals (for human-readable conversion) */
  usdcDecimals: 6,
};
