import { Request, Response, NextFunction } from "express";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { createHash } from "crypto";
import db from "../db";
import { config } from "../config";

export interface AuthenticatedRequest extends Request {
  agentPubkey?: string;
}

// Reconstruct the signed message: CLAWMARKET:{action}:{timestamp}:{sha256(payload)}
function buildSignatureMessage(
  action: string,
  timestamp: number,
  payload: Record<string, unknown>
): string {
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  return `CLAWMARKET:${action}:${timestamp}:${payloadHash}`;
}

// Verify an Ed25519 signature from a bot request
export function verifySignature(options?: { skipRegistrationCheck?: boolean }) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const {
      agent_pubkey,
      timestamp,
      signature,
      action,
    }: {
      agent_pubkey?: string;
      timestamp?: number;
      signature?: string;
      action?: string;
    } = req.body;

    if (!agent_pubkey || !timestamp || !signature || !action) {
      res.status(400).json({
        error: "Missing required auth fields: agent_pubkey, timestamp, signature, action",
      });
      return;
    }

    // 1. Check timestamp within 5 minutes
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > config.signatureMaxAgeSeconds) {
      res.status(401).json({ error: "Signature expired or timestamp too far in the future" });
      return;
    }

    // 2. Reconstruct message
    const { agent_pubkey: _ap, timestamp: _ts, signature: _sig, action: _act, ...payload } =
      req.body;
    const message = buildSignatureMessage(action, timestamp, payload);
    const messageBytes = new TextEncoder().encode(message);

    // 3. Verify Ed25519 signature
    let pubkeyBytes: Uint8Array;
    let signatureBytes: Uint8Array;
    try {
      pubkeyBytes = bs58.decode(agent_pubkey);
      signatureBytes = bs58.decode(signature);
    } catch {
      res.status(400).json({ error: "Invalid base58 encoding for pubkey or signature" });
      return;
    }

    if (pubkeyBytes.length !== 32) {
      res.status(400).json({ error: "agent_pubkey must be 32 bytes (Ed25519)" });
      return;
    }

    if (signatureBytes.length !== 64) {
      res.status(400).json({ error: "Signature must be 64 bytes" });
      return;
    }

    const valid = nacl.sign.detached.verify(messageBytes, signatureBytes, pubkeyBytes);
    if (!valid) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    // 4. Check agent is registered (skip for registration endpoint)
    if (!options?.skipRegistrationCheck) {
      const agent = db
        .prepare("SELECT agent_pubkey FROM agents WHERE agent_pubkey = ?")
        .get(agent_pubkey);
      if (!agent) {
        res.status(403).json({ error: "Agent not registered" });
        return;
      }
    }

    req.agentPubkey = agent_pubkey;
    next();
  };
}
