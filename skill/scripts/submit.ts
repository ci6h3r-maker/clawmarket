import { submitWork, getJob } from "../lib/api-client.js";
import { sha256hex } from "../lib/signer.js";

async function main() {
  const [jobId, deliverableUrl] = process.argv.slice(2);

  if (!jobId || !deliverableUrl) {
    console.error("Usage: submit <job_id> <deliverable_url>");
    console.error("");
    console.error("  The deliverable URL is hashed (SHA-256) to create an on-chain reference.");
    console.error('  submit abc-123 "https://github.com/user/repo/releases/v1.0"');
    process.exit(1);
  }

  try {
    const { job } = await getJob(jobId);
    if (job.status !== "claimed") {
      console.error(`Cannot submit: job status is '${job.status}' (must be 'claimed')`);
      process.exit(1);
    }

    const deliverableHash = sha256hex(deliverableUrl);
    console.log(`Submitting deliverable for: ${job.title || "Untitled"}`);
    console.log(`  URL: ${deliverableUrl}`);
    console.log(`  Hash: ${deliverableHash}`);
    console.log("");

    const result = await submitWork(jobId, deliverableHash);
    console.log("Work submitted!");
    if (result.txSignature) {
      console.log(`  TX: ${result.txSignature}`);
    }
    console.log("  Waiting for client acceptance.");
  } catch (err) {
    console.error(`Submit failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
