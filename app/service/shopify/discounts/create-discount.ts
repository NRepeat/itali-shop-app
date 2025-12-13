import { AdminApiContext } from "@shopify/shopify-app-react-router/server";

// TODO: Generate this type from the Shopify GraphQL schema
// import { DiscountAutomaticBasicInput } from "@/types";
type DiscountAutomaticBasicInput = any;

const CREATE_AUTOMATIC_DISCOUNT_MUTATION = `
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
  discount: DiscountAutomaticBasicInput,
  admin: AdminApiContext,
) => {
  try {
    const res = await admin.graphql(CREATE_AUTOMATIC_DISCOUNT_MUTATION, {
      variables: { basicAutomaticDiscount: discount },
    });

    if (!res.ok) {
      throw new Error(`Failed to create discount: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();

    if (data.data?.discountAutomaticBasicCreate?.userErrors?.length > 0) {
      throw new Error(
        data.data.discountAutomaticBasicCreate.userErrors
          .map((error: { message: string }) => error.message)
          .join(", "),
      );
    }

    return data.data?.discountAutomaticBasicCreate?.automaticDiscount;
  } catch (error) {
    console.error("Error creating automatic discount:", error);
    return null;
  }
};
