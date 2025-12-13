import { CreateBasicAutomaticDiscountMutation, CreateBasicAutomaticDiscountMutationVariables } from "@/types";
import { client } from "@shared/lib/shopify/client/client";
// AdminApiContext is no longer needed

const CREATE_AUTOMATIC_DISCOUNT_MUTATION = `
  #graphql
  mutation CreateBasicAutomaticDiscount($basicAutomaticDiscount: DiscountAutomaticBasicInput!) {
    discountAutomaticBasicCreate(automaticBasicDiscount: $basicAutomaticDiscount) {
      automaticDiscount {
        discountId
        title
        startsAt
        endsAt
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

export const createAutomaticDiscount = async (
  discountVariables: CreateBasicAutomaticDiscountMutationVariables,
  accessToken: string,
  shopDomain: string,
) => {
  try {
    const res = await client.request<CreateBasicAutomaticDiscountMutation, CreateBasicAutomaticDiscountMutationVariables>({
      query: CREATE_AUTOMATIC_DISCOUNT_MUTATION,
      variables: discountVariables,
      accessToken: accessToken,
      shopDomain: shopDomain,
    });

    if (res?.discountAutomaticBasicCreate?.userErrors?.length > 0) {
      throw new Error(
        res.discountAutomaticBasicCreate.userErrors
          .map((error: { message: string }) => error.message)
          .join(", "),
      );
    }

    return res?.discountAutomaticBasicCreate?.automaticDiscount;
  } catch (error) {
    console.error("Error creating automatic discount:", error);
    return null;
  }
};
