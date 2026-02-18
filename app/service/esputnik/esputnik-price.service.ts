import { ESPUTNIK_CONFIG } from "@shared/config/esputnik";

export interface EsputnikPriceEventParams {
  email: string;
  productId: string;
  productTitle?: string;
  variantTitle?: string;
  newPrice: string;
  oldPrice?: string;
  currency?: string;
}

export async function sendPriceDropEventToEsputnik(
  params: EsputnikPriceEventParams
): Promise<void> {
  const eventParams = [
    { name: "productId", value: params.productId },
    { name: "newPrice", value: params.newPrice },
    { name: "currency", value: params.currency || "UAH" },
    ...(params.productTitle
      ? [{ name: "productTitle", value: params.productTitle }]
      : []),
    ...(params.variantTitle
      ? [{ name: "variantTitle", value: params.variantTitle }]
      : []),
    ...(params.oldPrice
      ? [{ name: "oldPrice", value: params.oldPrice }]
      : []),
  ];

  const response = await fetch(`${ESPUTNIK_CONFIG.baseUrl}/events`, {
    method: "POST",
    headers: {
      Authorization: ESPUTNIK_CONFIG.authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      eventTypeKey: "priceDropped",
      keyValue: params.email,
      params: eventParams,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `eSputnik events API error: ${response.status} ${response.statusText} — ${body}`
    );
  }

  console.log(
    `eSputnik price event sent to ${params.email} for product ${params.productId}`
  );
}
