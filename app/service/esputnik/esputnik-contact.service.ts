import { ESPUTNIK_CONFIG } from "@shared/config/esputnik";

export async function unsubscribeContactFromEsputnik(email: string): Promise<void> {
  const response = await fetch(`${ESPUTNIK_CONFIG.baseUrl}/contacts/unsubscribed`, {
    method: "POST",
    headers: {
      Authorization: ESPUTNIK_CONFIG.authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ emails: [email] }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`eSputnik unsubscribe error: ${response.status} — ${body}`);
  }
}

export async function resubscribeContactInEsputnik(email: string): Promise<void> {
  const response = await fetch(`${ESPUTNIK_CONFIG.baseUrl}/contacts/unsubscribed`, {
    method: "DELETE",
    headers: {
      Authorization: ESPUTNIK_CONFIG.authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ emails: [email] }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`eSputnik resubscribe error: ${response.status} — ${body}`);
  }
}
