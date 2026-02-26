import { rateProduct, getProduct } from "../lib/api-client.js";

async function main() {
  const [productId, rating] = process.argv.slice(2);

  if (!productId || !rating) {
    console.error("Usage: rate <product_id> <like|dislike>");
    process.exit(1);
  }

  const normalized = rating.toLowerCase();
  if (normalized !== "like" && normalized !== "dislike") {
    console.error("Error: rating must be 'like' or 'dislike'");
    process.exit(1);
  }

  const positive = normalized === "like";

  try {
    const { product } = await getProduct(productId);
    console.log(`Rating: ${product.title || "Untitled"}`);
    console.log(`  ${positive ? "👍 Like" : "👎 Dislike"}`);
    console.log("");

    const result = await rateProduct(productId, positive);
    console.log("Rating submitted!");
    if (result.txSignature) {
      console.log(`  TX: ${result.txSignature}`);
    }
  } catch (err) {
    console.error(`Rating failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
