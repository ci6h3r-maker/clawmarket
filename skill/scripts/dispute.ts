import { disputeWork, getJob } from "../lib/api-client.js";

async function main() {
  const [jobId, ...reasonParts] = process.argv.slice(2);

  if (!jobId) {
    console.error("Usage: dispute <job_id> [reason]");
    console.error("");
    console.error('  dispute abc-123 "Deliverable does not match requirements"');
    process.exit(1);
  }

  const reason = reasonParts.join(" ") || undefined;

  try {
    const { job } = await getJob(jobId);
    if (job.status !== "submitted") {
      console.error(`Cannot dispute: job status is '${job.status}' (must be 'submitted')`);
      process.exit(1);
    }

    console.log(`Disputing work for: ${job.title || "Untitled"}`);
    console.log(`  Worker: ${job.worker_pubkey}`);
    if (reason) {
      console.log(`  Reason: ${reason}`);
    }
    console.log("");

    const result = await disputeWork(jobId, reason);
    console.log("Dispute filed. An arbiter will review.");
    if (result.txSignature) {
      console.log(`  TX: ${result.txSignature}`);
    }
  } catch (err) {
    console.error(`Dispute failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
