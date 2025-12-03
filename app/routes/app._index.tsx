import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
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
  const fetcher = useFetcher();
  const handleSync = () => {
    fetcher.submit(
      { action: "update" },
      { method: "post", encType: "application/json" },
    );
  };
  const handleDelete = async () => {
    fetcher.submit(
      { action: "delete" },
      { method: "post", encType: "application/json" },
    );
  };
  return (
    <s-page heading="Itali Shop App">
      <s-section heading="Sync product from italu-shoes">
        <s-paragraph>
          Syncing products from italu-shoes is a crucial feature of the Shopify
          app template. It allows you to easily import products from your
          italu-shoes account into your Shopify store, ensuring that your
          inventory is up-to-date and your customers have access to the latest
          products.
        </s-paragraph>
        <>
          <s-button variant="primary" onClick={handleSync}>
            Sync
          </s-button>
          <s-button variant="secondary" onClick={handleDelete}>
            Delete
          </s-button>
        </>
      </s-section>
      <s-section heading="Sync queue"></s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
