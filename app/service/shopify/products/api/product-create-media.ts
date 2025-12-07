import {
  ProductCreateMediaMutationVariables,
  ProductCreateMediaMutation,
} from "@/types";
import { prisma } from "@shared/lib/prisma/prisma.server";
import { client } from "@shared/lib/shopify/client/client";

const PRODUCT_CREATE_MEDIA = `
  #graphql
  mutation productCreateMedia($media: [CreateMediaInput!]!, $productId: ID!) {
    productCreateMedia(media: $media, productId: $productId) {
      mediaUserErrors {
        field
        message
      }
      product {
        id
        title
      }
    }
  }
  `;

export const productCreateMediaMutation = async (
  domain: string,
  variables: ProductCreateMediaMutationVariables,
) => {
  try {
    const session = await prisma.session.findFirst({
      where: { shop: domain },
    });
    if (!session?.accessToken) {
      throw new Error("Session or Access Token not found");
    }
    const accessToken = session.accessToken;

    const res = await client.request<
      ProductCreateMediaMutation,
      ProductCreateMediaMutationVariables
    >({
      query: PRODUCT_CREATE_MEDIA,
      variables: variables,
      accessToken: accessToken,
      shopDomain: domain,
    });
    if (res.productCreateMedia?.mediaUserErrors) {
      console.error(
        "Media creation failed:",
        res.productCreateMedia.mediaUserErrors
          .map((error) => error.message)
          .join(", "),
      );
      throw new Error("Media creation failed");
    }
    return res.productCreateMedia;
  } catch (error) {
    console.error(`Error creating media for product: ${error}`);
    throw new Error(`Error creating media for product: ${error}`);
  }
};
