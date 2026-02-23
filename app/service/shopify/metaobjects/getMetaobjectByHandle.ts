import { AdminApiContext } from "@shopify/shopify-app-react-router/server";

const query = `
  #graphql
  query GetMetaobjectByHandle($handle: MetaobjectHandleInput!) {
    metaobjectByHandle(handle: $handle) {
      id
      handle
      type
    }
  }
`;

export const getMetaobjectByHandle = async (
  admin: AdminApiContext,
  handle: string,
  type: string,
): Promise<{ id: string; handle: string; type: string } | null> => {
  try {
    const res = await admin.graphql(query, {
      variables: { handle: { handle, type } },
    });

    return res.data?.metaobjectByHandle ?? null;
  } catch (error) {
    console.error(`[getMetaobjectByHandle] Error fetching handle="${handle}" type="${type}":`, error);
    return null;
  }
};
