import { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { DeleteMetaobjectsMutationVariables } from "app/types/admin.generated";

const query = `
  #graphql
  mutation DeleteMetaobjects($where: MetaobjectBulkDeleteWhereCondition!) {
    metaobjectBulkDelete(where: $where) {
      job {
        id
        done
      }
      userErrors {
        message
      }
    }
  }
`;

export const metaobjectBulkDelete = async (
  definition: DeleteMetaobjectsMutationVariables,
  admin: AdminApiContext,
) => {
  try {
    const res = await admin.graphql(query, {
      variables: definition,
    });
    if (!res.ok) {
      throw new Error(
        `Failed to create metafield definition: ${res.status} ${res.statusText}`,
      );
    }
    const data = await res.json();

    if (
      data.data?.metaobjectBulkDelete?.userErrors &&
      data.data.metaobjectBulkDelete?.userErrors?.length > 0
    ) {
      throw new Error(
        data.data.metaobjectBulkDelete.userErrors
          .map((error) => error.message)
          .join(", "),
      );
    }

    return data.data || null;
  } catch (error) {
    console.error(error);
    return null;
  }
};
