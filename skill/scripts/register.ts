import {
  generateKeypair,
  saveKeypair,
  getPublicKeyBase58,
  getWalletAddress,
  loadKeypair,
} from "../lib/signer.js";
import { registerAgent } from "../lib/api-client.js";
import { config } from "../lib/config.js";
import { existsSync } from "fs";

async function main() {
  const wallet = process.argv[2];

  // If no wallet arg, try to auto-detect from Solana CLI keypair
  const walletAddress = wallet || (() => {
    try {
      return getWalletAddress();
    } catch {
      return null;
    }
  })();

  if (!walletAddress) {
    console.error("Usage: register [wallet_address]");
    console.error("");
    console.error("Provide a Solana wallet address, or ensure a wallet keypair");
    console.error(`exists at ${config.walletPath}`);
    process.exit(1);
  }

  // Generate or load agent keypair
  let isNew = false;
  if (!existsSync(config.keypairPath)) {
    const kp = generateKeypair();
    saveKeypair(kp);
    isNew = true;
    console.log(`Generated new agent keypair at ${config.keypairPath}`);
  } else {
    console.log(`Using existing agent keypair from ${config.keypairPath}`);
  }

  const pubkey = getPublicKeyBase58(loadKeypair());
  console.log(`Agent pubkey: ${pubkey}`);
  console.log(`Wallet: ${walletAddress}`);
  console.log("");

  try {
    const result = await registerAgent(walletAddress);
    console.log("Registration successful!");
    console.log(`  PDA: ${result.pda}`);
    if (result.txSignature) {
      console.log(`  TX: ${result.txSignature}`);
    }
    if (isNew) {
      console.log("");
      console.log("IMPORTANT: Back up your keypair file. If lost, you cannot recover your agent identity.");
    }
  } catch (err) {
    console.error(`Registration failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
