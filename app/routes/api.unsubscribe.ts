import { unsubscribeWithToken } from "@/service/price-tracking/price-notification.service";
import type { LoaderFunctionArgs } from "react-router";

// GET /api/unsubscribe?id=xxx&email=xxx&token=xxx
// Called server-side by the storefront /unsubscribe page
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const subscriptionId = url.searchParams.get("id");
  const email = url.searchParams.get("email");
  const token = url.searchParams.get("token");

  if (!subscriptionId || !email || !token) {
    return Response.json({ error: "Missing required parameters" }, { status: 400 });
  }

  const result = await unsubscribeWithToken(subscriptionId, email, token);

  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ success: true });
};
