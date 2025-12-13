import { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { prisma } from "app/shared/lib/prisma/prisma.server";
import { metaobjectBulkDelete } from "../shopify/metaobjects/metaobjectBulkDelete";

interface MetaobjectIdRecord {
  metaobjectId: string;
}
export async function getAllMetaobjectIdsPaginated(
  bulkSize: number = 100,
  admin: AdminApiContext,
): Promise<MetaobjectIdRecord[]> {
  let allRecords: MetaobjectIdRecord[] = [];
  let lastCursorId: string | undefined = undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const query = {
      select: {
        metaobjectId: true,
      },
      take: bulkSize,
      orderBy: {
        metaobjectId: "asc" as const,
      },
    };

    if (lastCursorId) {
      Object.assign(query, {
        cursor: { metaobjectId: lastCursorId },
        skip: 1,
      });
    }

    const batch = await prisma.metaobject.findMany(query);

    allRecords = allRecords.concat(batch);

    console.log(`Deleting ${batch.length} metaobject definitions`);
    if (batch.length < bulkSize) {
      break;
    }
    await metaobjectBulkDelete(
      {
        where: {
          ids: batch.map((metaobject) => metaobject.metaobjectId),
        },
      },
      admin,
    );
    lastCursorId = batch[batch.length - 1].metaobjectId;
  }

  return allRecords;
}
