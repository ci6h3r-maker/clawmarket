import nacl from "tweetnacl";
import bs58 from "bs58";
import { createHash } from "crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname } from "path";
import { Connection, Keypair as SolanaKeypair, Transaction } from "@solana/web3.js";
import { config } from "./config.js";

export interface AgentKeypair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

// --- Ed25519 Agent Keypair (API auth) ---

export function generateKeypair(): AgentKeypair {
  return nacl.sign.keyPair();
}

export function loadKeypair(path?: string): AgentKeypair {
  const kpPath = path || config.keypairPath;
  if (!existsSync(kpPath)) {
    throw new Error(
      `Agent keypair not found at ${kpPath}\nRun the 'register' command first to generate one.`
    );
  }
  const data = JSON.parse(readFileSync(kpPath, "utf-8"));
  return {
    publicKey: bs58.decode(data.publicKey),
    secretKey: bs58.decode(data.secretKey),
  };
}

export function saveKeypair(keypair: AgentKeypair, path?: string): void {
  const kpPath = path || config.keypairPath;
  const dir = dirname(kpPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(
    kpPath,
    JSON.stringify(
      {
        publicKey: bs58.encode(keypair.publicKey),
        secretKey: bs58.encode(keypair.secretKey),
      },
      null,
      2
    )
  );
}

export function getPublicKeyBase58(keypair?: AgentKeypair): string {
  const kp = keypair || loadKeypair();
  return bs58.encode(kp.publicKey);
}

// --- Request Signing ---

export function signRequest(
  action: string,
  payload: Record<string, unknown>,
  keypair?: AgentKeypair
): {
  agent_pubkey: string;
  timestamp: number;
  signature: string;
  action: string;
} {
  const kp = keypair || loadKeypair();
  const timestamp = Math.floor(Date.now() / 1000);

  const payloadHash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");

  const message = `CLAWMARKET:${action}:${timestamp}:${payloadHash}`;
  const messageBytes = new TextEncoder().encode(message);
  const signature = nacl.sign.detached(messageBytes, kp.secretKey);

  return {
    agent_pubkey: bs58.encode(kp.publicKey),
    timestamp,
    signature: bs58.encode(signature),
    action,
  };
}

// --- Solana Wallet (transaction signing) ---

export function loadWalletKeypair(path?: string): SolanaKeypair {
  const walletPath = path || config.walletPath;
  if (!existsSync(walletPath)) {
    throw new Error(
      `Solana wallet keypair not found at ${walletPath}\nSet SOLANA_KEYPAIR_PATH or use 'solana-keygen new' to create one.`
    );
  }
  const data = JSON.parse(readFileSync(walletPath, "utf-8"));
  return SolanaKeypair.fromSecretKey(Uint8Array.from(data));
}

export function getWalletAddress(path?: string): string {
  return loadWalletKeypair(path).publicKey.toBase58();
}

export async function signAndSubmit(base64Tx: string): Promise<string> {
  const connection = new Connection(config.rpcUrl, "confirmed");
  const tx = Transaction.from(Buffer.from(base64Tx, "base64"));
  const wallet = loadWalletKeypair();
  tx.partialSign(wallet);
  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

// --- Utilities ---

export function sha256hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Convert human-readable USDC (e.g. 10.5) to lamports */
export function usdcToLamports(usdc: number): number {
  return Math.round(usdc * 10 ** config.usdcDecimals);
}

/** Convert USDC lamports to human-readable string */
export function lamportsToUsdc(lamports: number): string {
  return (lamports / 10 ** config.usdcDecimals).toFixed(config.usdcDecimals);
}
