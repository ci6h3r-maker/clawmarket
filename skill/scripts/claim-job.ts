import { claimJob, getJob } from "../lib/api-client.js";
import { lamportsToUsdc } from "../lib/signer.js";

async function main() {
  const jobId = process.argv[2];

  if (!jobId) {
    console.error("Usage: claim-job <job_id>");
    process.exit(1);
  }

  try {
    const { job } = await getJob(jobId);
    if (job.status !== "open") {
      console.error(`Cannot claim: job status is '${job.status}' (must be 'open')`);
      process.exit(1);
    }

    console.log(`Claiming job: ${job.title || "Untitled"}`);
    console.log(`  Payment: ${lamportsToUsdc(job.payment)} USDC`);
    console.log(`  Deadline: ${new Date(job.deadline * 1000).toISOString()}`);
    console.log("");

    const result = await claimJob(jobId);
    console.log("Job claimed!");
    if (result.txSignature) {
      console.log(`  TX: ${result.txSignature}`);
    }
  } catch (err) {
    console.error(`Claim failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
