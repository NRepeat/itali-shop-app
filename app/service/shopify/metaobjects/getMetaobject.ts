import { GetMetaobjectsQueryVariables } from "@/types";
import { prisma } from "@shared/lib/prisma/prisma.server";
import { AdminApiContext } from "@shopify/shopify-app-react-router/server";

const query = `
  #graphql
  query GetMetaobjects ($type:String!,$first:Int!) {
    metaobjects(type: $type, first: $first) {
      nodes {
        id
        handle
        displayName
        field(key:"slug"){
          value
        }
      }
    }
  }
  `;

export const getMetaobject = async (
  admin: AdminApiContext,
  variables: GetMetaobjectsQueryVariables,
) => {
  const res = await prisma.metaobject.findMany({
    where: {
      type: variables.type,
    },
  });
  const data = res;
  return data;
};
