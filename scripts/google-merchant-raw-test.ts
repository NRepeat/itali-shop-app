import { insertProduct } from "../app/service/google-merchant/client";

async function testRawInsert() {
  const baseUrl = "https://www.miomio.com.ua";
  const offerId = "999999999999"; // Distinct test ID
  
  const productData = {
    offerId: offerId,
    contentLanguage: "ru",
    feedLabel: "UA",
    productAttributes: {
      title: "Тестовая сумка Bikkembergs - Black - 42",
      description: "Высококачественная итальянская сумка из натуральной кожи. Прочная и стильная.",
      link: `${baseUrl}/ru/product/test-handle?variant=${offerId}`,
      imageLink: "https://cdn.shopify.com/s/files/1/0696/9753/6162/files/1-jpg-2_54e00883-7b27-42ac-a29a-e992a2d46e69.jpg",
      brand: "Bikkembergs",
      price: {
        amountMicros: "4500000000", // 4500.00 UAH
        currencyCode: "UAH"
      },
      availability: "IN_STOCK",
      condition: "NEW",
      googleProductCategory: "3032",
      gender: "MALE",
      ageGroup: "ADULT",
      color: "Black",
      size: "42",
      sizeSystem: "EU",
      sizeType: "regular",
      itemGroupId: "8888888888",
      productTypes: ["Сумки > Мужские сумки"],
      productHighlights: ["Натуральная кожа", "Сделано в Италии", "Экспресс доставка"],
      shipping: [{
        country: "UA",
        price: {
          amountMicros: "0",
          currencyCode: "UAH"
        }
      }]
    }
  };

  console.log("🚀 Sending ENRICHED raw test product to Google Merchant...");
  try {
    const result = await insertProduct(productData);
    console.log("✅ Result from API:", JSON.stringify(result, null, 2));
    console.log("\nWait 1-2 minutes and check Merchant Center -> Products -> All products");
    console.log(`Look for '${productData.productAttributes.title}'`);
  } catch (err) {
    console.error("❌ Test failed!");
  }
}

testRawInsert();
