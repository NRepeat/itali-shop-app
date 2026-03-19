import { getProduct } from "../app/service/google-merchant/client";

async function main() {
  const offerId = process.argv[2] || "SKU123456789";
  const language = process.argv[3] || "en";
  const label = process.argv[4] || "US";

  console.log(`🔍 Fetching product from Google Merchant: ${offerId} (${language}~${label})...`);
  try {
    const product = await getProduct(offerId, language, label);
    console.log("✅ Product found!");
    console.log(JSON.stringify(product, null, 2));
  } catch (err: any) {
    console.error("❌ Product not found or error occurred.");
  }
}

main();
