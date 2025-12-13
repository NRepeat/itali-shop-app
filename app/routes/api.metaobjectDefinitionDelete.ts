import { metaobjectDefinitionDelete } from "@/service/shopify/metaobjects/metaobjectDefinitionDelete";
import { prisma } from "app/shared/lib/prisma/prisma.server";
import { authenticate } from "app/shopify.server";
import { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const ids = await prisma.metaobjectDefinition.findMany({
    select: {
      metaobjecDefinitionId: true,
    },
  });
  for (const id of ids) {
    await metaobjectDefinitionDelete({ id: id.metaobjecDefinitionId }, admin);
  }
  return { success: true };
};
