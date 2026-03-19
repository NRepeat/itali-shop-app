import { listProducts, deleteProduct } from "../app/service/google-merchant/client";

async function cleanupNotApproved() {
  console.log("🔍 Fetching products from Google Merchant Center...");
  
  try {
    const products = await listProducts();
    console.log(`📦 Found ${products.length} products total.`);

    let deletedCount = 0;

    for (const product of products) {
      // Проверяем статус одобрения
      const status = product.productStatus;
      const offerId = product.offerId;
      const lang = product.contentLanguage;
      const label = product.feedLabel;

      let shouldDelete = false;

      // 1. Проверяем destinationStatuses (отклонено ли в Free Listings или Shopping Ads)
      const isDisapproved = status?.destinationStatuses?.some(
        (ds: any) => ds.status === "DISAPPROVED" || ds.status === "REJECTED"
      );

      // 2. Проверяем наличие критических ошибок на уровне товара
      const hasIssues = (status?.itemLevelIssues?.length || 0) > 0;

      // Если товар отклонен или имеет ошибки — удаляем его, чтобы залить чистым
      if (isDisapproved || hasIssues) {
        shouldDelete = true;
      }

      if (shouldDelete) {
        console.log(`🗑️ Deleting not approved product: ${offerId} (${lang}~${label})`);
        
        // Выводим причину для логов
        if (status?.itemLevelIssues) {
          status.itemLevelIssues.forEach((issue: any) => {
            console.log(`   - Issue: ${issue.description} (${issue.severity})`);
          });
        }

        await deleteProduct(offerId, lang, label);
        deletedCount++;
      }
    }

    console.log(`\n✅ Cleanup complete! Deleted ${deletedCount} non-approved products.`);
    process.exit(0);
  } catch (error: any) {
    console.error("❌ Cleanup failed:", error.message);
    process.exit(1);
  }
}

cleanupNotApproved();
