import type { LoaderFunctionArgs } from "react-router";
import { unsubscribeWithToken } from "~/service/price-tracking/price-notification.service";

// GET /api/unsubscribe?id=xxx&email=xxx&token=xxx
// This endpoint is designed for email unsubscribe links (one-click unsubscribe)
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const subscriptionId = url.searchParams.get("id");
  const email = url.searchParams.get("email");
  const token = url.searchParams.get("token");

  if (!subscriptionId || !email || !token) {
    return new Response(
      generateHtmlResponse(
        "Error",
        "Missing required parameters. Please use the link from your email."
      ),
      {
        status: 400,
        headers: { "Content-Type": "text/html" },
      }
    );
  }

  const result = await unsubscribeWithToken(subscriptionId, email, token);

  if (result.success) {
    return new Response(
      generateHtmlResponse(
        "Unsubscribed",
        "You have been successfully unsubscribed from price notifications for this product."
      ),
      {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }
    );
  }

  return new Response(
    generateHtmlResponse(
      "Error",
      result.error || "Failed to unsubscribe. The link may have expired or already been used."
    ),
    {
      status: 400,
      headers: { "Content-Type": "text/html" },
    }
  );
};

function generateHtmlResponse(title: string, message: string): string {
  return `
<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background-color: #f5f5f5;
    }
    .container {
      text-align: center;
      padding: 40px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      max-width: 400px;
    }
    h1 {
      color: ${title === "Error" ? "#dc3545" : "#28a745"};
      margin-bottom: 16px;
    }
    p {
      color: #666;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>
  `.trim();
}
