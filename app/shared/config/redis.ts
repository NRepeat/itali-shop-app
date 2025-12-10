import { RedisOptions } from "bullmq";

const host = process.env.REDIS_HOST;
const port = process.env.REDIS_PORT;
if (!host || !port) {
  throw new Error(
    "REDIS_HOST and REDIS_PORT environment variables are required",
  );
}

export const REDIS_CONFIG: {
  port: number;
  host: string;
  options: RedisOptions;
} = {
  port: Number(port),
  host,
  options: {
    maxRetriesPerRequest: null,
    // tls: {
    //   rejectUnauthorized: process.env.NODE_ENV === "production",
    // },
  },
};
