import { ProductsQuery, ProductsQueryVariables } from "@/types";
import { prisma } from "@shared/lib/prisma/prisma.server";
import { client } from "@shared/lib/shopify/client/client";

const PRODUCTS_QUERY = `
  #graphql
  query Products($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          handle
          variants(first:1) {
            edges {
              node {
                id
                sku
                title
              }
            }
          }
        }
      }
    }
  }
`;

export type ProductNode = ProductsQuery["products"]["edges"][number]["node"];

export const getAllShopifyProducts = async (
  domain: string,
  pageSize: number = 50,
) => {
  const allProducts: ProductNode[] = [];
  let hasNextPage = true;
  let endCursor: string | undefined = undefined;

  const session = await prisma.session.findFirst({
    where: { shop: domain },
  });

  if (!session?.accessToken) {
    throw new Error("Session or Access Token not found");
  }
  const accessToken = session.accessToken;

  do {
    const variables: ProductsQueryVariables = {
      first: pageSize,
      after: endCursor,
    };
    try {
      const res = await client.request<ProductsQuery, ProductsQueryVariables>({
        query: PRODUCTS_QUERY,
        variables: variables,
        accessToken: accessToken,
        shopDomain: domain,
      });

      const productsConnection = res?.products;
      if (!productsConnection) break;

      allProducts.push(...productsConnection.edges.map((edge) => edge.node));
      hasNextPage = productsConnection.pageInfo.hasNextPage;
      //@ts-expect-error types
      endCursor = productsConnection.pageInfo.endCursor;
    } catch (error) {
      console.error(`Error fetching products from Shopify: ${error}`);
      throw error;
    }
  } while (hasNextPage);

  return allProducts;
};
