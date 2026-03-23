import crypto from "crypto";

/**
 * Minimal LiqPay API client for server-side status checks.
 * Used by the liqpay-capture worker to poll payment status.
 */
export class LiqPayClient {
  private readonly host = "https://www.liqpay.ua/api/";

  constructor(
    private readonly publicKey: string,
    private readonly privateKey: string
  ) {}

  async api(path: string, params: Record<string, any>): Promise<any> {
    const fullParams = { ...params, public_key: this.publicKey };
    const data = Buffer.from(JSON.stringify(fullParams)).toString("base64");
    const signature = this.sign(this.privateKey + data + this.privateKey);

    const body = new URLSearchParams({ data, signature });
    const res = await fetch(this.host + path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) throw new Error(`LiqPay API error: ${res.status}`);
    return res.json();
  }

  private sign(str: string): string {
    return crypto.createHash("sha1").update(str).digest("base64");
  }
}
