import { insertProduct } from "@/service/google-merchant/client";
import { prisma } from "@shared/lib/prisma/prisma.server";
import { client } from "@shared/lib/shopify/client/client";
import type { LoaderFunctionArgs } from "react-router";

export const DISCOUNT_METAFIELD_KEY = "znizka";

const GET_PRODUCTS_FOR_GOOGLE_FEED = `#graphql
  query GetProductsForGoogleFeed($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges {
        node {
          id
          title
          handle
          description
          vendor
          productType
          featuredImage {
            url
          }
          images(first: 10) {
            edges {
              node {
                url
              }
            }
          }
          metafield(namespace: "custom", key: "${DISCOUNT_METAFIELD_KEY}") {
            value
          }
          variants(first: 100) {
            edges {
              node {
                id
                sku
                title
                availableForSale
                price {
                  amount
                  currencyCode
                }
                compareAtPrice {
                  amount
                  currencyCode
                }
                selectedOptions {
                  name
                  value
                }
                image {
                  url
                }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const session = await prisma.session.findFirst({
    select: { shop: true, accessToken: true },
  });

  if (!session?.accessToken || !session.shop) {
    return Response.json(
      { error: "No Shopify session found" },
      { status: 503 },
    );
  }

  let hasNextPage = true;
  let cursor: string | null = null;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.miomio.com.ua";
  let syncedCount = 0;

  try {
    while (hasNextPage) {
      const response: any = await client.request({
        query: GET_PRODUCTS_FOR_GOOGLE_FEED,
        variables: { first: 20, after: cursor },
        accessToken: session.accessToken,
        shopDomain: session.shop,
      });

      if (!response.products?.edges) break;

      for (const edge of response.products.edges) {
        const product = edge.node;
        const discount = product.metafield?.value ? parseFloat(product.metafield.value) : 0;
        
        for (const variantEdge of product.variants.edges) {
          const variant = variantEdge.node;
          
          if (!variant.sku) {
             console.warn(`Skipping variant ${variant.id} because it has no SKU`);
             continue;
          }

          const priceAmount = parseFloat(variant.price.amount);
          const compareAtPriceAmount = variant.compareAtPrice ? parseFloat(variant.compareAtPrice.amount) : null;
          
          // Google Merchant API expects amountMicros (price * 1,000,000)
          const amountMicros = Math.round(priceAmount * 1000000).toString();
          
          const availability = variant.availableForSale ? "IN_STOCK" : "OUT_OF_STOCK";
          
          const colorOpt = variant.selectedOptions.find((o: any) =>
            ["color", "колір", "цвет"].includes(o.name.toLowerCase()),
          );
          
          const gender = product.handle.includes("cholov")
            ? "MALE"
            : product.handle.includes("zhinoch")
              ? "FEMALE"
              : "UNISEX";

          const additionalImageLinks = product.images.edges
            .map((e: any) => e.node.url)
            .filter((url: string) => url !== (variant.image?.url || product.featuredImage?.url))
            .slice(0, 10);

          const productInput: any = {
            offerId: variant.sku,
            contentLanguage: "ru",
            feedLabel: "UA",
            channel: "ONLINE",
            attributes: {
              title: `${product.vendor} ${product.title}`,
              description: product.description || product.title,
              link: `${baseUrl}/ru/product/${product.handle}?variant=${variant.id.split("/").pop()}`,
              imageLink: variant.image?.url || product.featuredImage?.url,
              brand: product.vendor,
              price: {
                amountMicros: amountMicros,
                currencyCode: variant.price.currencyCode,
              },
              availability: availability,
              condition: "NEW",
              googleProductCategory: "3032", // Default for bags as requested
              gender: gender,
              ageGroup: "ADULT",
              itemGroupId: product.id.split("/").pop(),
            },
          };

          if (colorOpt) {
            productInput.attributes.color = colorOpt.value;
          }

          if (additionalImageLinks.length > 0) {
            productInput.attributes.additionalImageLinks = additionalImageLinks;
          }

          if (discount > 0) {
             productInput.attributes.customLabel_0 = `discount_${discount}%`;
          }

          // Handle sale price if applicable
          if (compareAtPriceAmount && compareAtPriceAmount > priceAmount) {
             // If there is a sale, price attribute should be the original price (compareAtPrice)
             // and salePrice should be the current price.
             productInput.attributes.price = {
                amountMicros: Math.round(compareAtPriceAmount * 1000000).toString(),
                currencyCode: variant.price.currencyCode,
             };
             productInput.attributes.salePrice = {
                amountMicros: amountMicros,
                currencyCode: variant.price.currencyCode,
             };
          }

          await insertProduct(productInput);
          syncedCount++;
        }
      }

      hasNextPage = response.products.pageInfo.hasNextPage;
      cursor = response.products.pageInfo.endCursor;
      
      // Safety break for testing
      // if (syncedCount > 10) break;
    }

    return Response.json({ success: true, syncedCount });
  } catch (error: any) {
    console.error("Sync error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
};
