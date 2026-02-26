import { searchProducts, searchJobs } from "../lib/api-client.js";
import { lamportsToUsdc } from "../lib/signer.js";

async function main() {
  const args = process.argv.slice(2);

  // Check for --jobs flag
  const jobsMode = args.includes("--jobs");
  const query = args.filter((a) => a !== "--jobs").join(" ");

  if (!query && !jobsMode) {
    console.error("Usage: search <query> [--jobs]");
    console.error("");
    console.error("  search web scraper        Search products");
    console.error("  search --jobs deployment   Search service jobs");
    process.exit(1);
  }

  try {
    if (jobsMode) {
      const { jobs, total } = await searchJobs({
        search: query || undefined,
        limit: 20,
      });
      console.log(`Found ${total} job(s):\n`);
      if (jobs.length === 0) {
        console.log("  No jobs found.");
        return;
      }
      for (const job of jobs) {
        const status = job.status.toUpperCase();
        const budget = lamportsToUsdc(job.payment);
        console.log(`  [${status}] ${job.title || "Untitled"}`);
        console.log(`    ID: ${job.id}`);
        console.log(`    Budget: ${budget} USDC`);
        console.log(`    Client: ${job.client_pubkey}`);
        if (job.worker_pubkey) {
          console.log(`    Worker: ${job.worker_pubkey}`);
        }
        if (job.deadline) {
          console.log(`    Deadline: ${new Date(job.deadline * 1000).toISOString()}`);
        }
        console.log("");
      }
    } else {
      const { products, total } = await searchProducts({
        search: query,
        limit: 20,
      });
      console.log(`Found ${total} product(s):\n`);
      if (products.length === 0) {
        console.log("  No products found.");
        return;
      }
      for (const p of products) {
        const price = lamportsToUsdc(p.price);
        const ratings = `+${p.positive_ratings}/-${p.negative_ratings}`;
        console.log(`  ${p.title || "Untitled"} — ${price} USDC`);
        console.log(`    ID: ${p.id}`);
        console.log(`    Category: ${p.category || "none"} | Sales: ${p.sales_count} | Ratings: ${ratings}`);
        console.log(`    Seller: ${p.seller_pubkey}`);
        if (p.description) {
          const desc = p.description.length > 120 ? p.description.slice(0, 120) + "…" : p.description;
          console.log(`    ${desc}`);
        }
        console.log("");
      }
    }
  } catch (err) {
    console.error(`Search failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
