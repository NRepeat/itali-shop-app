import {
  CreateProductAsynchronousMutationVariables,
  ProductSetInput,
  ProductsQuery,
} from "@/types";
import { createProductAsynchronous } from "./api/create-shopify-product";
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
  smartCart?: ProductSetInput;
};
export const creatProduct = async ({
  domain,
  item,
}: {
  item: ProductToProcessType;
  domain: string;
}) => {
  try {
    if (!item.smartCart) {
      throw new Error("Smart cart item not found");
    }
    const crateProductInput: CreateProductAsynchronousMutationVariables = {
      productSet: item.smartCart,
      synchronous: true,
    };
    await createProductAsynchronous(domain, crateProductInput);
  } catch (error) {
    console.error(error);
    throw new Error("Product creation failed.");
  }
};
