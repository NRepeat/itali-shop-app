import { AdminApiContext } from "@shopify/shopify-app-react-router/server";

const query = `
  #graphql
  query getMetaobjectDefinitionByType($type: String!) {
    metaobjectDefinitionByType(type: $type) {
      id
      name
      type
    }
  }
`;

export const getMetaobjectDefinitionByType = async (
  type: string,
  admin: AdminApiContext,
): Promise<{ id: string; name: string; type: string } | null> => {
  try {
    const res = await admin.graphql(query, { variables: { type } });

    if (!res.ok) {
      throw new Error(
        `Failed to fetch metaobject definition: ${res.status} ${res.statusText}`,
      );
    }

    const data = await res.json();
    return data.data?.metaobjectDefinitionByType ?? null;
  } catch (error) {
    console.error(`[getMetaobjectDefinitionByType] Error for type "${type}":`, error);
    return null;
  }
};
