import { PublicKey } from "@solana/web3.js";

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),

  // Solana
  rpcUrl: process.env.SOLANA_RPC_URL || "http://127.0.0.1:8899",
  commitment: "confirmed" as const,

  // Program IDs
  agentRegistryProgramId: new PublicKey(
    process.env.AGENT_REGISTRY_PROGRAM_ID ||
      "FWoyTYv4QLKjebwWgiVivNcfsDowP2CdrtARrY4qVVvH"
  ),
  productMarketplaceProgramId: new PublicKey(
    process.env.PRODUCT_MARKETPLACE_PROGRAM_ID ||
      "37XggunG3YEJqaf77AFYU4ceMAt4A5ptJK96WLEnHL46"
  ),
  serviceEscrowProgramId: new PublicKey(
    process.env.SERVICE_ESCROW_PROGRAM_ID ||
      "HrtWJH6o9xpvVebvi5NmjdX2NPRPWrayXVSsjsRc4Phb"
  ),

  // USDC mint (devnet)
  usdcMint: new PublicKey(
    process.env.USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
  ),

  // Admin
  adminPubkey: new PublicKey("BnRFhDAdrSVyo3xGxtY65FmgYcMguc4kBR4CGjogvY4"),

  // Auth
  signatureMaxAgeSeconds: 300, // 5 minutes

  // Database
  dbPath: process.env.DB_PATH || "clawmarket.db",
};
