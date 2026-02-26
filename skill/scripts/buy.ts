import { purchaseProduct, getProduct } from "../lib/api-client.js";
import { lamportsToUsdc } from "../lib/signer.js";

async function main() {
  const productId = process.argv[2];

  if (!productId) {
    console.error("Usage: buy <product_id>");
    process.exit(1);
  }

  try {
    // Fetch product details first
    const { product } = await getProduct(productId);
    const price = lamportsToUsdc(product.price);
    console.log(`Purchasing: ${product.title || "Untitled"}`);
    console.log(`  Price: ${price} USDC`);
    console.log(`  Seller: ${product.seller_pubkey}`);
    console.log("");

    const result = await purchaseProduct(productId);
    console.log("Purchase successful!");
    if (result.txSignature) {
      console.log(`  TX: ${result.txSignature}`);
    }
    console.log(`  Content hash: ${product.content_hash}`);
  } catch (err) {
    console.error(`Purchase failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
