import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { processAndDeleteAppMetafields } from "app/service/sync/processAndDeleteAppMetafields";
import { syncCollections } from "@/service/sync/collection/syncCollections";
import { syncProducts } from "@/service/sync/products/syncProducts";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const body = await request.json();
  if (body.action === "delete") {
    await syncProducts(session.shop, session.accessToken!);
  } else if (body.action === "update") {
    await syncProducts(session.shop, session.accessToken!);
  }
  return { success: true };
};

export default function Index() {
  const fetcher = useFetcher();
  const handleSyncCollections = () => {
    fetcher.submit(
      { action: "update" },
      { method: "post", encType: "application/json" },
    );
  };
  return (
    <s-page heading="Itali Shop App">
      <s-section heading="Sync queue">
        <s-button onClick={() => handleSyncCollections()}>
          Sync Collections
        </s-button>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
