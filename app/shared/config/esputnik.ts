const apiLogin = process.env.ESPUTNIK_API_LOGIN;
const apiKey = process.env.ESPUTNIK_API_KEY;

if (!apiLogin || !apiKey) {
  throw new Error(
    "ESPUTNIK_API_LOGIN and ESPUTNIK_API_KEY environment variables are required"
  );
}

export const ESPUTNIK_CONFIG = {
  baseUrl: "https://esputnik.com/api/v1",
  authHeader: `Basic ${Buffer.from(`${apiLogin}:${apiKey}`).toString("base64")}`,
};
