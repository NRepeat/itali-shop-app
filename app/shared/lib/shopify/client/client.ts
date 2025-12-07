import { SHOPIFY_API_VERSION } from './const';

interface ShopifyRequestOptions<V> {
  query: string;
  variables?: V;
  accessToken: string;
  shopDomain: string;
}
const apiVersion = SHOPIFY_API_VERSION ?? '2025-10';
const request = async <T, V>(args: ShopifyRequestOptions<V>): Promise<T> => {
  try {
    const { query, variables, accessToken, shopDomain } = args;
    const response = await fetch(
      `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ query, variables }),
      },
    );

    const result = await response.json();
    if (result.errors) {
      throw new Error(
        Array.isArray(result.errors)
          ? result.errors
              ?.map((error: { message: string }) => error.message)
              .join('\n')
          : result.errors,
      );
    }

    return result.data as T;
  } catch (error) {
    console.error(`Error fetching data from Shopify: ${error}`);
    throw new Error(`Error fetching data from Shopify: ${error}`);
  }
};

export const client = {
  request,
};
