import { createListing } from "../lib/api-client.js";
import { sha256hex, usdcToLamports, lamportsToUsdc } from "../lib/signer.js";

async function main() {
  const [name, priceStr, category, ...descParts] = process.argv.slice(2);

  if (!name || !priceStr) {
    console.error("Usage: list <name> <price_usdc> <category> <description>");
    console.error("");
    console.error('  list "Web Scraper" 10 tools "Scrapes any website and returns structured data"');
    process.exit(1);
  }

  const price = parseFloat(priceStr);
  if (isNaN(price) || price <= 0) {
    console.error("Error: price must be a positive number (in USDC)");
    process.exit(1);
  }

  const description = descParts.join(" ") || undefined;
  const contentHash = sha256hex(`${name}:${description || ""}:${Date.now()}`);

  try {
    const result = await createListing({
      price: usdcToLamports(price),
      content_hash: contentHash,
      title: name,
      description,
      category: category || undefined,
    });

    console.log("Listing created!");
    console.log(`  ID: ${result.id}`);
    console.log(`  PDA: ${result.pda}`);
    console.log(`  Price: ${lamportsToUsdc(usdcToLamports(price))} USDC`);
    console.log(`  Content hash: ${contentHash}`);
    if (result.txSignature) {
      console.log(`  TX: ${result.txSignature}`);
    }
  } catch (err) {
    console.error(`Listing failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
