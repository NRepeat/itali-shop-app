import { prisma } from "../../prisma/prisma.server";

/**
 * Retrieves the Shopify admin access token and shop domain from the database.
 * This is intended for server-side API calls that are not tied to a specific user session.
 * It fetches the most recently updated active session.
 *
 * @returns An object containing the accessToken and shopDomain.
 * @throws Error if no active Shopify session can be found in the database.
 */
export async function getShopifyAdminCredentials(): Promise<{
  accessToken: string;
  shopDomain: string;
}> {
  const session = await prisma.session.findFirst({
    where: { shop: "italy-stage.myshopify.com" },
  });
  console.log("🚀 ~ getShopifyAdminCredentials ~ session:", session)

  if (!session?.accessToken || !session.shop) {
    throw new Error(
      "No active Shopify admin session found in the database. Ensure the app is installed and authenticated.",
    );
  }

  return { accessToken: session.accessToken, shopDomain: session.shop };
}
