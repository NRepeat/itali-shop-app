import { createClient } from "@sanity/client";

if (!process.env.SANITY_PROJECT_ID) {
  throw new Error("SANITY_PROJECT_ID is required");
}

if (!process.env.SANITY_DATASET) {
  throw new Error("SANITY_DATASET is required");
}

if (!process.env.SANITY_API_TOKEN) {
  throw new Error("SANITY_API_TOKEN is required");
}

export const sanityClient = createClient({
  projectId: process.env.SANITY_PROJECT_ID,
  dataset: process.env.SANITY_DATASET,
  token: process.env.SANITY_API_TOKEN,
  apiVersion: "2025-02-19",
  useCdn: false,
});
