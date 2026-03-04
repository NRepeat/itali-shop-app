import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { revalidateNextJs } from "@/service/revalidate/revalidate-nextjs";
import { processPriceUpdate } from "@/service/price-tracking/price-tracking.service";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  revalidateNextJs({ type: "product", slug: (payload as any)?.handle }).catch(() => {});

  processPriceUpdate(shop, payload as any).catch((err) => {
    console.error("processPriceUpdate error:", err);
  });

  return new Response(null, { status: 200 });
};
