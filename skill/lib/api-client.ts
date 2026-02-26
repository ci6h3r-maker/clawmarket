import {
  signRequest,
  signAndSubmit,
  type AgentKeypair,
} from "./signer.js";
import { config } from "./config.js";

// --- Types ---

export interface Product {
  id: string;
  pda: string;
  seller_pubkey: string;
  price: number;
  content_hash: string;
  title: string | null;
  description: string | null;
  category: string | null;
  created_at: number;
  active: number;
  sales_count: number;
  positive_ratings: number;
  negative_ratings: number;
}

export interface Job {
  id: string;
  pda: string;
  client_pubkey: string;
  worker_pubkey: string | null;
  payment: number;
  description_hash: string;
  title: string | null;
  description: string | null;
  requirements: string | null;
  deliverable_hash: string | null;
  status: string;
  created_at: number;
  claimed_at: number | null;
  submitted_at: number | null;
  deadline: number;
}

export interface Agent {
  agent_pubkey: string;
  wallet: string;
  registered_at: number;
  total_sales: number;
  total_purchases: number;
  positive_ratings: number;
  negative_ratings: number;
  is_verified: boolean;
  pda: string;
}

export interface TxResponse {
  transaction: string;
  message: string;
  [key: string]: unknown;
}

// --- HTTP helpers ---

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${config.apiUrl}${path}`;
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const data = await res.json();

  if (!res.ok) {
    const msg =
      (data as Record<string, string>).error ||
      (data as Record<string, string>).message ||
      res.statusText;
    throw new Error(`API ${res.status}: ${msg}`);
  }
  return data as T;
}

function buildSignedBody(
  action: string,
  payload: Record<string, unknown>,
  keypair?: AgentKeypair
): Record<string, unknown> {
  const auth = signRequest(action, payload, keypair);
  return { ...payload, ...auth };
}

/** Sign the returned transaction with Solana wallet and submit on-chain */
async function submitTx(txResponse: TxResponse): Promise<string | null> {
  if (!txResponse.transaction) return null;
  try {
    return await signAndSubmit(txResponse.transaction);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Transaction failed: ${msg}`);
  }
}

// --- Products ---

export async function searchProducts(params: {
  search?: string;
  category?: string;
  min_price?: number;
  max_price?: number;
  seller?: string;
  sort?: string;
  order?: string;
  limit?: number;
  offset?: number;
}): Promise<{ products: Product[]; total: number }> {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) query.set(k, String(v));
  }
  const qs = query.toString();
  return request("GET", `/products${qs ? `?${qs}` : ""}`);
}

export async function getProduct(
  id: string
): Promise<{ product: Product; onChain: unknown }> {
  return request("GET", `/products/${id}`);
}

export async function createListing(
  params: {
    price: number;
    content_hash: string;
    title?: string;
    description?: string;
    category?: string;
  },
  keypair?: AgentKeypair
): Promise<TxResponse & { id: string; pda: string; txSignature: string | null }> {
  const body = buildSignedBody("create_listing", params as Record<string, unknown>, keypair);
  const res = await request<TxResponse & { id: string; pda: string }>("POST", "/products", body);
  const txSignature = await submitTx(res);
  return { ...res, txSignature };
}

export async function purchaseProduct(
  productId: string,
  keypair?: AgentKeypair
): Promise<TxResponse & { txSignature: string | null }> {
  const body = buildSignedBody("purchase", {}, keypair);
  const res = await request<TxResponse>("POST", `/products/${productId}/purchase`, body);
  const txSignature = await submitTx(res);
  return { ...res, txSignature };
}

export async function rateProduct(
  productId: string,
  positive: boolean,
  keypair?: AgentKeypair
): Promise<TxResponse & { txSignature: string | null }> {
  const body = buildSignedBody("rate_listing", { positive }, keypair);
  const res = await request<TxResponse>("POST", `/products/${productId}/rate`, body);
  const txSignature = await submitTx(res);
  return { ...res, txSignature };
}

// --- Jobs ---

export async function searchJobs(params: {
  status?: string;
  client?: string;
  worker?: string;
  search?: string;
  sort?: string;
  order?: string;
  limit?: number;
  offset?: number;
}): Promise<{ jobs: Job[]; total: number }> {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) query.set(k, String(v));
  }
  const qs = query.toString();
  return request("GET", `/jobs${qs ? `?${qs}` : ""}`);
}

export async function getJob(
  id: string
): Promise<{ job: Job; onChain: unknown }> {
  return request("GET", `/jobs/${id}`);
}

export async function postJob(
  params: {
    payment: number;
    description_hash: string;
    deadline: number;
    title?: string;
    description?: string;
    requirements?: unknown;
  },
  keypair?: AgentKeypair
): Promise<TxResponse & { id: string; pda: string; txSignature: string | null }> {
  const body = buildSignedBody("post_job", params as Record<string, unknown>, keypair);
  const res = await request<TxResponse & { id: string; pda: string }>("POST", "/jobs", body);
  const txSignature = await submitTx(res);
  return { ...res, txSignature };
}

export async function claimJob(
  jobId: string,
  keypair?: AgentKeypair
): Promise<TxResponse & { txSignature: string | null }> {
  const body = buildSignedBody("claim_job", {}, keypair);
  const res = await request<TxResponse>("POST", `/jobs/${jobId}/claim`, body);
  const txSignature = await submitTx(res);
  return { ...res, txSignature };
}

export async function submitWork(
  jobId: string,
  deliverableHash: string,
  keypair?: AgentKeypair
): Promise<TxResponse & { txSignature: string | null }> {
  const body = buildSignedBody(
    "submit_work",
    { deliverable_hash: deliverableHash },
    keypair
  );
  const res = await request<TxResponse>("POST", `/jobs/${jobId}/submit`, body);
  const txSignature = await submitTx(res);
  return { ...res, txSignature };
}

export async function acceptWork(
  jobId: string,
  keypair?: AgentKeypair
): Promise<TxResponse & { txSignature: string | null }> {
  const body = buildSignedBody("accept_work", {}, keypair);
  const res = await request<TxResponse>("POST", `/jobs/${jobId}/accept`, body);
  const txSignature = await submitTx(res);
  return { ...res, txSignature };
}

export async function disputeWork(
  jobId: string,
  reason?: string,
  keypair?: AgentKeypair
): Promise<TxResponse & { txSignature: string | null }> {
  const payload: Record<string, unknown> = {};
  if (reason) payload.reason = reason;
  const body = buildSignedBody("dispute_work", payload, keypair);
  const res = await request<TxResponse>("POST", `/jobs/${jobId}/dispute`, body);
  const txSignature = await submitTx(res);
  return { ...res, txSignature };
}

// --- Agents ---

export async function registerAgent(
  wallet: string,
  keypair?: AgentKeypair
): Promise<TxResponse & { agent_pubkey: string; pda: string; txSignature: string | null }> {
  const body = buildSignedBody("register", { wallet }, keypair);
  const res = await request<TxResponse & { agent_pubkey: string; pda: string }>(
    "POST",
    "/agents/register",
    body
  );
  const txSignature = await submitTx(res);
  return { ...res, txSignature };
}

export async function getAgent(
  pubkey: string
): Promise<{ agent: Agent; listings: Product[]; clientJobs: Job[]; workerJobs: Job[] }> {
  return request("GET", `/agents/${pubkey}`);
}

// --- Health ---

export async function healthCheck(): Promise<{ status: string; timestamp: number }> {
  return request("GET", "/health");
}
