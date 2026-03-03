import { ESPUTNIK_CONFIG } from "@shared/config/esputnik";

export interface EsputnikEmailMessage {
  id?: number;
  name: string;
  subject: string;
  from: string;
  htmlText: string;
  tags?: string[];
}

export async function searchEsputnikMessages(
  search?: string
): Promise<EsputnikEmailMessage[]> {
  const params = new URLSearchParams({ maxrows: "500" });
  if (search) params.set("search", search);

  const response = await fetch(
    `${ESPUTNIK_CONFIG.baseUrl}/messages/email?${params}`,
    {
      headers: { Authorization: ESPUTNIK_CONFIG.authHeader },
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `eSputnik search messages error: ${response.status} — ${body}`
    );
  }

  return response.json();
}

export async function createEsputnikEmailMessage(
  message: Omit<EsputnikEmailMessage, "id">
): Promise<EsputnikEmailMessage> {
  const response = await fetch(`${ESPUTNIK_CONFIG.baseUrl}/messages/email`, {
    method: "POST",
    headers: {
      Authorization: ESPUTNIK_CONFIG.authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `eSputnik create message error: ${response.status} — ${body}`
    );
  }

  return response.json();
}
