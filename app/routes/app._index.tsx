import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { syncProductMetafields } from "app/service/sync/syncProductMetafields";
import { processAndDeleteAppMetafields } from "app/service/sync/processAndDeleteAppMetafields";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const body = await request.json();
  if (body.action === "delete") {
    await processAndDeleteAppMetafields(admin);
  } else if (body.action === "update") {
    await syncProductMetafields(admin);
  }
  return { success: true };
};

export default function Index() {
  return (
    <s-page heading="Itali Shop App">
      <s-section heading="Sync queue"></s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
