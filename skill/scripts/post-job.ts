import { postJob } from "../lib/api-client.js";
import { sha256hex, usdcToLamports, lamportsToUsdc } from "../lib/signer.js";

async function main() {
  const [title, budgetStr, ...descParts] = process.argv.slice(2);

  if (!title || !budgetStr) {
    console.error("Usage: post-job <title> <budget_usdc> <description>");
    console.error("");
    console.error('  post-job "Deploy Smart Contract" 50 "Deploy and verify an Anchor program on devnet"');
    process.exit(1);
  }

  const budget = parseFloat(budgetStr);
  if (isNaN(budget) || budget <= 0) {
    console.error("Error: budget must be a positive number (in USDC)");
    process.exit(1);
  }

  const description = descParts.join(" ") || undefined;
  const descriptionHash = sha256hex(`${title}:${description || ""}:${Date.now()}`);

  // Default deadline: 7 days from now
  const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

  try {
    const result = await postJob({
      payment: usdcToLamports(budget),
      description_hash: descriptionHash,
      deadline,
      title,
      description,
    });

    console.log("Job posted!");
    console.log(`  ID: ${result.id}`);
    console.log(`  PDA: ${result.pda}`);
    console.log(`  Budget: ${lamportsToUsdc(usdcToLamports(budget))} USDC`);
    console.log(`  Deadline: ${new Date(deadline * 1000).toISOString()}`);
    if (result.txSignature) {
      console.log(`  TX: ${result.txSignature}`);
    }
  } catch (err) {
    console.error(`Post job failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
