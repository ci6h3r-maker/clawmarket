import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { config } from "../config";
import { BorshCoder } from "@coral-xyz/anchor";
import { createHash } from "crypto";

export const connection = new Connection(config.rpcUrl, config.commitment);

// ─── PDA Derivations ─────────────────────────────────────────────────────────

export function deriveAgentPda(agentPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), agentPubkey.toBytes()],
    config.agentRegistryProgramId
  );
}

export function deriveListingPda(
  seller: PublicKey,
  contentHash: Buffer
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("listing"), seller.toBytes(), contentHash],
    config.productMarketplaceProgramId
  );
}

export function derivePurchaseReceiptPda(
  listing: PublicKey,
  buyer: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("receipt"), listing.toBytes(), buyer.toBytes()],
    config.productMarketplaceProgramId
  );
}

export function deriveFeeVaultTokenPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fee_vault_token")],
    config.productMarketplaceProgramId
  );
}

export function deriveFeeVaultAuthorityPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fee_vault")],
    config.productMarketplaceProgramId
  );
}

export function deriveJobPda(
  client: PublicKey,
  descriptionHash: Buffer
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("job"), client.toBytes(), descriptionHash],
    config.serviceEscrowProgramId
  );
}

export function deriveEscrowTokenPda(job: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow_token"), job.toBytes()],
    config.serviceEscrowProgramId
  );
}

export function deriveEscrowVaultAuthorityPda(
  job: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow_vault"), job.toBytes()],
    config.serviceEscrowProgramId
  );
}

// ─── Instruction Discriminators ──────────────────────────────────────────────
// Anchor uses sha256("global:<method_name>")[0..8] as the discriminator

function anchorDiscriminator(name: string): Buffer {
  const hash = createHash("sha256")
    .update(`global:${name}`)
    .digest();
  return hash.subarray(0, 8);
}

// ─── Borsh Serialization Helpers ─────────────────────────────────────────────

function encodeU64(value: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value);
  return buf;
}

function encodeI64(value: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(value);
  return buf;
}

function encodePubkey(pubkey: PublicKey): Buffer {
  return Buffer.from(pubkey.toBytes());
}

function encodeBool(value: boolean): Buffer {
  return Buffer.from([value ? 1 : 0]);
}

// ─── Transaction Builders ────────────────────────────────────────────────────

export async function buildRegisterAgentTx(
  agentPubkey: PublicKey,
  wallet: PublicKey
): Promise<Transaction> {
  const [agentPda] = deriveAgentPda(agentPubkey);

  const data = Buffer.concat([
    anchorDiscriminator("register_agent"),
    Buffer.from(agentPubkey.toBytes()), // agent_pubkey: [u8; 32]
  ]);

  const ix = new TransactionInstruction({
    programId: config.agentRegistryProgramId,
    keys: [
      { pubkey: agentPda, isSigner: false, isWritable: true },
      { pubkey: wallet, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = wallet;
  return tx;
}

export async function buildCreateListingTx(
  seller: PublicKey,
  price: bigint,
  contentHash: Buffer
): Promise<Transaction> {
  const [listingPda] = deriveListingPda(seller, contentHash);

  const data = Buffer.concat([
    anchorDiscriminator("create_listing"),
    encodeU64(price),
    contentHash, // [u8; 32]
  ]);

  const ix = new TransactionInstruction({
    programId: config.productMarketplaceProgramId,
    keys: [
      { pubkey: listingPda, isSigner: false, isWritable: true },
      { pubkey: seller, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = seller;
  return tx;
}

export async function buildPurchaseTx(
  listingPda: PublicKey,
  sellerWallet: PublicKey,
  sellerAgentPda: PublicKey,
  buyer: PublicKey
): Promise<Transaction> {
  const [receiptPda] = derivePurchaseReceiptPda(listingPda, buyer);
  const [feeVaultToken] = deriveFeeVaultTokenPda();

  const buyerTokenAccount = await getAssociatedTokenAddress(
    config.usdcMint,
    buyer
  );
  const sellerTokenAccount = await getAssociatedTokenAddress(
    config.usdcMint,
    sellerWallet
  );

  const data = anchorDiscriminator("purchase");

  const ix = new TransactionInstruction({
    programId: config.productMarketplaceProgramId,
    keys: [
      { pubkey: listingPda, isSigner: false, isWritable: true },
      { pubkey: sellerAgentPda, isSigner: false, isWritable: false },
      { pubkey: receiptPda, isSigner: false, isWritable: true },
      { pubkey: buyer, isSigner: true, isWritable: true },
      { pubkey: buyerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: sellerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: feeVaultToken, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = buyer;
  return tx;
}

export async function buildRateListingTx(
  listingPda: PublicKey,
  buyer: PublicKey,
  positive: boolean
): Promise<Transaction> {
  const [receiptPda] = derivePurchaseReceiptPda(listingPda, buyer);

  const data = Buffer.concat([
    anchorDiscriminator("rate_listing"),
    encodeBool(positive),
  ]);

  const ix = new TransactionInstruction({
    programId: config.productMarketplaceProgramId,
    keys: [
      { pubkey: listingPda, isSigner: false, isWritable: true },
      { pubkey: receiptPda, isSigner: false, isWritable: true },
      { pubkey: buyer, isSigner: true, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = buyer;
  return tx;
}

export async function buildPostJobTx(
  client: PublicKey,
  payment: bigint,
  descriptionHash: Buffer,
  deadline: bigint
): Promise<Transaction> {
  const [jobPda] = deriveJobPda(client, descriptionHash);
  const [escrowToken] = deriveEscrowTokenPda(jobPda);
  const [escrowAuthority] = deriveEscrowVaultAuthorityPda(jobPda);

  const clientTokenAccount = await getAssociatedTokenAddress(
    config.usdcMint,
    client
  );

  const data = Buffer.concat([
    anchorDiscriminator("post_job"),
    encodeU64(payment),
    descriptionHash, // [u8; 32]
    encodeI64(deadline),
  ]);

  const ix = new TransactionInstruction({
    programId: config.serviceEscrowProgramId,
    keys: [
      { pubkey: jobPda, isSigner: false, isWritable: true },
      { pubkey: escrowToken, isSigner: false, isWritable: true },
      { pubkey: escrowAuthority, isSigner: false, isWritable: false },
      { pubkey: config.usdcMint, isSigner: false, isWritable: false },
      { pubkey: client, isSigner: true, isWritable: true },
      { pubkey: clientTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = client;
  return tx;
}

export async function buildClaimJobTx(
  jobPda: PublicKey,
  worker: PublicKey
): Promise<Transaction> {
  const data = anchorDiscriminator("claim_job");

  const ix = new TransactionInstruction({
    programId: config.serviceEscrowProgramId,
    keys: [
      { pubkey: jobPda, isSigner: false, isWritable: true },
      { pubkey: worker, isSigner: true, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = worker;
  return tx;
}

export async function buildSubmitWorkTx(
  jobPda: PublicKey,
  worker: PublicKey,
  deliverableHash: Buffer
): Promise<Transaction> {
  const data = Buffer.concat([
    anchorDiscriminator("submit_work"),
    deliverableHash,
  ]);

  const ix = new TransactionInstruction({
    programId: config.serviceEscrowProgramId,
    keys: [
      { pubkey: jobPda, isSigner: false, isWritable: true },
      { pubkey: worker, isSigner: true, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = worker;
  return tx;
}

export async function buildAcceptWorkTx(
  jobPda: PublicKey,
  client: PublicKey,
  workerWallet: PublicKey,
  workerAgentPda: PublicKey
): Promise<Transaction> {
  const [escrowToken] = deriveEscrowTokenPda(jobPda);
  const [escrowAuthority] = deriveEscrowVaultAuthorityPda(jobPda);
  const [feeVaultToken] = deriveFeeVaultTokenPda();

  const workerTokenAccount = await getAssociatedTokenAddress(
    config.usdcMint,
    workerWallet
  );

  const data = anchorDiscriminator("accept_work");

  const ix = new TransactionInstruction({
    programId: config.serviceEscrowProgramId,
    keys: [
      { pubkey: jobPda, isSigner: false, isWritable: true },
      { pubkey: workerAgentPda, isSigner: false, isWritable: false },
      { pubkey: escrowToken, isSigner: false, isWritable: true },
      { pubkey: escrowAuthority, isSigner: false, isWritable: false },
      { pubkey: workerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: feeVaultToken, isSigner: false, isWritable: true },
      { pubkey: client, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = client;
  return tx;
}

export async function buildDisputeWorkTx(
  jobPda: PublicKey,
  client: PublicKey
): Promise<Transaction> {
  const data = anchorDiscriminator("dispute_work");

  const ix = new TransactionInstruction({
    programId: config.serviceEscrowProgramId,
    keys: [
      { pubkey: jobPda, isSigner: false, isWritable: true },
      { pubkey: client, isSigner: true, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = client;
  return tx;
}

// ─── Account Fetching ────────────────────────────────────────────────────────

export async function fetchAgentRecord(agentPubkey: PublicKey) {
  const [pda] = deriveAgentPda(agentPubkey);
  const info = await connection.getAccountInfo(pda);
  if (!info) return null;

  // Anchor account layout: 8-byte discriminator + data
  const data = info.data.subarray(8);
  return {
    pda: pda.toBase58(),
    agentPubkey: new PublicKey(data.subarray(0, 32)).toBase58(),
    wallet: new PublicKey(data.subarray(32, 64)).toBase58(),
    registeredAt: Number(data.readBigInt64LE(64)),
    totalSales: Number(data.readBigUInt64LE(72)),
    totalPurchases: Number(data.readBigUInt64LE(80)),
    positiveRatings: Number(data.readBigUInt64LE(88)),
    negativeRatings: Number(data.readBigUInt64LE(96)),
    isVerified: data[104] === 1,
    bump: data[105],
  };
}

export async function fetchListing(listingPda: PublicKey) {
  const info = await connection.getAccountInfo(listingPda);
  if (!info) return null;

  const data = info.data.subarray(8);
  return {
    pda: listingPda.toBase58(),
    seller: new PublicKey(data.subarray(0, 32)).toBase58(),
    price: Number(data.readBigUInt64LE(32)),
    contentHash: Buffer.from(data.subarray(40, 72)).toString("hex"),
    createdAt: Number(data.readBigInt64LE(72)),
    active: data[80] === 1,
    salesCount: Number(data.readBigUInt64LE(81)),
    positiveRatings: Number(data.readBigUInt64LE(89)),
    negativeRatings: Number(data.readBigUInt64LE(97)),
    bump: data[105],
  };
}

export async function fetchJob(jobPda: PublicKey) {
  const info = await connection.getAccountInfo(jobPda);
  if (!info) return null;

  const data = info.data.subarray(8);
  let offset = 0;

  const client = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
  offset += 32;

  // worker: Option<Pubkey> — 1 byte tag + 32 bytes if Some
  const hasWorker = data[offset] === 1;
  offset += 1;
  let worker: string | null = null;
  if (hasWorker) {
    worker = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
    offset += 32;
  } else {
    offset += 32; // Option<Pubkey> still reserves space in Anchor with InitSpace
  }

  const payment = Number(data.readBigUInt64LE(offset));
  offset += 8;

  const descriptionHash = Buffer.from(data.subarray(offset, offset + 32)).toString("hex");
  offset += 32;

  // deliverable_hash: Option<[u8; 32]>
  const hasDeliverable = data[offset] === 1;
  offset += 1;
  let deliverableHash: string | null = null;
  if (hasDeliverable) {
    deliverableHash = Buffer.from(data.subarray(offset, offset + 32)).toString("hex");
    offset += 32;
  } else {
    offset += 32;
  }

  // status: enum (1 byte)
  const statusByte = data[offset];
  offset += 1;
  const statusMap = ["open", "claimed", "submitted", "completed", "disputed", "cancelled"];
  const status = statusMap[statusByte] || "unknown";

  const createdAt = Number(data.readBigInt64LE(offset));
  offset += 8;

  // claimed_at: Option<i64>
  const hasClaimedAt = data[offset] === 1;
  offset += 1;
  let claimedAt: number | null = null;
  if (hasClaimedAt) {
    claimedAt = Number(data.readBigInt64LE(offset));
  }
  offset += 8;

  // submitted_at: Option<i64>
  const hasSubmittedAt = data[offset] === 1;
  offset += 1;
  let submittedAt: number | null = null;
  if (hasSubmittedAt) {
    submittedAt = Number(data.readBigInt64LE(offset));
  }
  offset += 8;

  const deadline = Number(data.readBigInt64LE(offset));
  offset += 8;

  const bump = data[offset];

  return {
    pda: jobPda.toBase58(),
    client,
    worker,
    payment,
    descriptionHash,
    deliverableHash,
    status,
    createdAt,
    claimedAt,
    submittedAt,
    deadline,
    bump,
  };
}
