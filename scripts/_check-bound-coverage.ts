import { PrismaClient as Ext } from "../prisma/generated/external_client/client";
import { PrismaClient } from "../prisma/generated/app_client/client";
const ext = new Ext(); const prisma = new PrismaClient();
(async () => {
  const p4097 = await ext.$queryRawUnsafe<any[]>(`SELECT product_id, model, status, quantity FROM bc_product WHERE product_id = 4097`);
  console.log("product 4097:", JSON.stringify(p4097));

  const allPairs = await ext.bc_product_related_article.findMany({ select: { article_id: true, product_id: true } });
  const allIds = [...new Set([...allPairs.map((p) => p.article_id), ...allPairs.map((p) => p.product_id)])];
  const mapped = await prisma.productMap.findMany({ where: { localProductId: { in: allIds } }, select: { localProductId: true } });
  const mappedSet = new Set(mapped.map((m) => m.localProductId));

  const unmappedOwners = new Set(allPairs.filter((p) => !mappedSet.has(p.article_id)).map((p) => p.article_id));
  const unmappedTargets = new Set(allPairs.filter((p) => !mappedSet.has(p.product_id)).map((p) => p.product_id));
  const bothMapped = allPairs.filter((p) => mappedSet.has(p.article_id) && mappedSet.has(p.product_id));

  console.log(`\nBound-product pairs total     : ${allPairs.length}`);
  console.log(`Unique product IDs involved   : ${allIds.length}`);
  console.log(`In productMap                 : ${mappedSet.size}`);
  console.log(`Owner (article_id) NOT mapped : ${unmappedOwners.size}`);
  console.log(`Target (product_id) NOT mapped: ${unmappedTargets.size}`);
  console.log(`Both sides mapped (resolvable): ${bothMapped.length}`);

  // Show pairs where owner IS mapped but target is NOT (link will be missing)
  const missingTarget = allPairs.filter((p) => mappedSet.has(p.article_id) && !mappedSet.has(p.product_id));
  if (missingTarget.length > 0) {
    console.log(`\nPairs where owner is in Shopify but linked target is NOT mapped (${missingTarget.length}):`);
    for (const pair of missingTarget.slice(0, 20)) {
      const rows = await ext.$queryRawUnsafe<any[]>(`SELECT model, status, quantity FROM bc_product WHERE product_id = ${pair.product_id}`);
      const r = rows[0];
      console.log(`  article_id=${pair.article_id} → product_id=${pair.product_id}  model=${r?.model}  status=${r?.status}  qty=${r?.quantity}`);
    }
    if (missingTarget.length > 20) console.log(`  ... and ${missingTarget.length - 20} more`);
  }
})()
  .catch(console.error)
  .finally(async () => { await ext.$disconnect(); await prisma.$disconnect(); });
