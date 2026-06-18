import { createClient, type RedisClientType } from 'redis';
import { env } from '../../config/env.js';

type MemoryEntry = {
  expiresAt: number;
  value: string;
};

const memoryCache = new Map<string, MemoryEntry>();
const MAX_MEMORY_ENTRIES = 500;
let redisClient: RedisClientType | null = null;
let redisConnectPromise: Promise<RedisClientType | null> | null = null;

function pruneMemoryCache() {
  const now = Date.now();
  for (const [key, entry] of memoryCache) {
    if (entry.expiresAt <= now) memoryCache.delete(key);
  }
  while (memoryCache.size > MAX_MEMORY_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value;
    if (!oldestKey) break;
    memoryCache.delete(oldestKey);
  }
}

async function getRedisClient() {
  if (!env.redisUrl) return null;
  if (redisClient?.isReady) return redisClient;
  if (redisConnectPromise) return redisConnectPromise;

  redisConnectPromise = (async () => {
    try {
      const client = createClient({
        url: env.redisUrl,
        socket: {
          connectTimeout: 1500,
          reconnectStrategy: (retries) => retries > 2 ? false : Math.min(retries * 200, 500),
        },
      });
      client.on('error', (error) => console.warn('[cache] Redis unavailable:', error.message));
      await client.connect();
      redisClient = client as RedisClientType;
      console.log('[cache] Redis connected');
      return redisClient;
    } catch (error: any) {
      console.warn('[cache] Redis disabled, using memory cache:', error?.message ?? error);
      return null;
    } finally {
      redisConnectPromise = null;
    }
  })();

  return redisConnectPromise;
}

export async function getCachedJson<T>(key: string): Promise<T | null> {
  const redis = await getRedisClient();
  if (redis) {
    try {
      const value = await redis.get(key);
      if (value) return JSON.parse(value) as T;
    } catch (error: any) {
      console.warn('[cache] Redis get failed:', error?.message ?? error);
    }
  }

  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return JSON.parse(entry.value) as T;
}

export async function setCachedJson(key: string, value: unknown, ttlSeconds: number) {
  const serialized = JSON.stringify(value);
  memoryCache.set(key, { value: serialized, expiresAt: Date.now() + ttlSeconds * 1000 });
  pruneMemoryCache();

  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.set(key, serialized, { EX: ttlSeconds });
  } catch (error: any) {
    console.warn('[cache] Redis set failed:', error?.message ?? error);
  }
}

export async function deleteCachePrefix(prefix: string) {
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) memoryCache.delete(key);
  }

  const redis = await getRedisClient();
  if (!redis) return;
  try {
    let cursor = '0';
    do {
      const result = await redis.scan(cursor, { MATCH: `${prefix}*`, COUNT: 100 });
      cursor = result.cursor;
      if (result.keys.length) await redis.del(result.keys);
    } while (cursor !== '0');
  } catch (error: any) {
    console.warn('[cache] Redis prefix delete failed:', error?.message ?? error);
  }
}

export function cacheKey(prefix: string, value: unknown) {
  return `${prefix}:${Buffer.from(JSON.stringify(value)).toString('base64url')}`;
}
