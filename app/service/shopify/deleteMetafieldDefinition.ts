import { AdminApiContext } from "@shopify/shopify-app-react-router/server";

interface DeleteMetafieldDefinitionResult {
  metafieldDefinitionDelete: {
    deletedDefinitionId: string | null;
    userErrors: Array<{
      field: string[];
      message: string;
      code: string;
    }>;
  };
}

const query = `
  #graphql
  mutation DeleteMetafieldDefinition($id: ID!,$deleteAssociated: Boolean!) {
    metafieldDefinitionDelete(id: $id,deleteAllAssociatedMetafields: $deleteAssociated) {
      deletedDefinitionId
      userErrors {
        field
        message
        code
      }
    }
  }
`;

export const deleteMetafieldDefinition = async (
  id: string,
  admin: AdminApiContext,
): Promise<string | null> => {
  try {
    const res = await admin.graphql(query, {
      variables: { id, deleteAssociated: true },
    });

    if (!res.ok) {
      throw new Error(
        `Failed to delete metafield definition: ${res.status} ${res.statusText}`,
      );
    }

    const data = (await res.json()) as {
      data: DeleteMetafieldDefinitionResult;
    };

    const deleteResult = data.data?.metafieldDefinitionDelete;

    if (deleteResult?.userErrors && deleteResult.userErrors.length > 0) {
      throw new Error(
        deleteResult.userErrors
          .map((error) => `[${error.code}] ${error.message}`)
          .join(", "),
      );
    }

    // Возвращает ID удаленного определения
    return deleteResult?.deletedDefinitionId || null;
  } catch (error) {
    console.error("Error deleting metafield definition:", error);
    return null;
  }
};
