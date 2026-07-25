import { Redis } from "ioredis";
import { env } from "../config/env.js";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

export async function pingRedis() {
  if (redis.status !== "ready") {
    await redis.connect();
  }
  const pong = await redis.ping();
  return pong === "PONG";
}

/** Live provider location during active contracts: geo:contract:{id} */
export function contractGeoKey(contractId: string) {
  return `geo:contract:${contractId}`;
}
