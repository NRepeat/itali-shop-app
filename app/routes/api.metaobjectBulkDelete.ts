import { getAllMetaobjectIdsPaginated } from "app/service/sync/getAllMetaobjectIdsPaginate";
import { authenticate } from "app/shopify.server";
import { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  await getAllMetaobjectIdsPaginated(100, admin);
  return { success: true };
};
