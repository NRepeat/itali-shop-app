import { PostHog } from "posthog-node";

const apiKey = process.env.POSTHOG_API_KEY;

if (!apiKey) {
  console.warn("POSTHOG_API_KEY is not set — PostHog tracking disabled");
}

export const posthog = apiKey
  ? new PostHog(apiKey, {
      host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
    })
  : null;
