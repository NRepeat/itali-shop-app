import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { processPriceUpdate } from "~/service/price-tracking/price-tracking.service";

interface ProductVariant {
  id: number;
  product_id: number;
  price: string;
  compare_at_price: string | null;
  sku: string;
  title: string;
}

interface ProductPayload {
  id: number;
  title: string;
  handle: string;
  variants: ProductVariant[];
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const productData = payload as ProductPayload;

  // Process price updates for all variants
  await processPriceUpdate(shop, productData);

  return new Response();
};
