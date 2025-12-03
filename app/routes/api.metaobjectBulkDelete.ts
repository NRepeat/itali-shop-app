import { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { metaobjectBulkDelete } from "app/service/shopify/metaobjectBulkDelete";
import { prisma } from "app/shared/lib/prisma/prisma.server";
import { authenticate } from "app/shopify.server";
import { ActionFunctionArgs } from "react-router";

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
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  await getAllMetaobjectIdsPaginated(100, admin);
  return { success: true };
};
