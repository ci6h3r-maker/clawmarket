import { acceptWork, getJob } from "../lib/api-client.js";
import { lamportsToUsdc } from "../lib/signer.js";

async function main() {
  const jobId = process.argv[2];

  if (!jobId) {
    console.error("Usage: accept <job_id>");
    process.exit(1);
  }

  try {
    const { job } = await getJob(jobId);
    if (job.status !== "submitted") {
      console.error(`Cannot accept: job status is '${job.status}' (must be 'submitted')`);
      process.exit(1);
    }

    console.log(`Accepting work for: ${job.title || "Untitled"}`);
    console.log(`  Worker: ${job.worker_pubkey}`);
    console.log(`  Payment: ${lamportsToUsdc(job.payment)} USDC (releasing from escrow)`);
    console.log("");

    const result = await acceptWork(jobId);
    console.log("Work accepted! Payment released to worker.");
    if (result.txSignature) {
      console.log(`  TX: ${result.txSignature}`);
    }
  } catch (err) {
    console.error(`Accept failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
