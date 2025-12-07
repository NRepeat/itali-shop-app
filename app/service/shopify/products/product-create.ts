import {
  ProductCreateMutationMutationVariables,
  ProductVariantsBulkInput,
  ProductVariantsBulkUpdateMutationVariables,
  ProductsQuery,
} from "@/types";
import { createShopifyProduct } from "./api/create-shopify-product";
import { productVariantsBulkUpdate } from "./api/product-variants-bulk-update";
export type ProductNode = ProductsQuery["products"]["edges"][number]["node"];
export type SmartCartProductType = {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  thumbnail: string;
  image: string;
};

export type ProductToProcessType = {
  smartCart?: ProductCreateMutationMutationVariables;
};
export const creatProduct = async ({
  domain,
  item,
  locationId,
}: {
  item: ProductToProcessType;
  domain: string;
  locationId: string;
}) => {
  try {
    if (!item.smartCart) {
      throw new Error("Smart cart item not found");
    }
    const crateProductInput: ProductCreateMutationMutationVariables =
      item.smartCart;
    const newShopifyProduct = await createShopifyProduct(
      domain,
      crateProductInput,
    );
    const variantsToUpdate: ProductVariantsBulkInput[] =
      newShopifyProduct.variants.edges.map((v) => ({
        id: v.node.id,
        price: item.smartCart?.price,
        inventoryItem: {
          sku: item.smartCart?.sku,
          tracked: true,
        },
      }));

    const productVariantsBulkUpdateInput: ProductVariantsBulkUpdateMutationVariables =
      {
        productId: newShopifyProduct.id,
        variants: variantsToUpdate,
        locationId,
      };

    const productVariantsBulkCreateResponse = await productVariantsBulkUpdate(
      domain,
      productVariantsBulkUpdateInput,
    );
    if (!productVariantsBulkCreateResponse) {
      throw new Error(
        "Product variants bulk create failed after product creation.",
      );
    }
  } catch (error) {
    console.error(error);
    throw new Error("Product creation failed.");
  }
};
