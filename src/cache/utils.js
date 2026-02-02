import { getRedisClient } from './redis.js';

/**
 * Generate cache key with consistent naming convention
 * @param {string} prefix - Cache key prefix (e.g., 'recent_sales', 'brands_distributors')
 * @param {object} params - Parameters to hash into the key
 * @returns {string} Cache key
 */
export function generateCacheKey(prefix, params = {}) {
  const paramString = JSON.stringify(params);
  // Simple hash function for params
  let hash = 0;
  for (let i = 0; i < paramString.length; i++) {
    const char = paramString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  const hashStr = Math.abs(hash).toString(36);
  return `cache:${prefix}:${hashStr}`;
}

/**
 * Invalidate cache by pattern (uses SCAN for pattern matching)
 * @param {string} pattern - Redis key pattern (e.g., 'cache:recent_sales:*')
 * @returns {Promise<number>} Number of keys deleted
 */
export async function invalidateCachePattern(pattern) {
  const client = getRedisClient();
  if (!client || client.status !== 'ready') {
    return 0;
  }

  try {
    let deletedCount = 0;
    let cursor = '0';

    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;

      if (keys.length > 0) {
        await client.del(...keys);
        deletedCount += keys.length;
      }
    } while (cursor !== '0');

    console.log(`Invalidated ${deletedCount} cache keys matching pattern: ${pattern}`);
    return deletedCount;
  } catch (error) {
    console.warn(`Cache pattern invalidation error for ${pattern}:`, error.message);
    return 0;
  }
}

/**
 * Get TTL (time to live) for a key
 * @param {string} key - Cache key
 * @returns {Promise<number>} TTL in seconds, -1 if key exists but has no expiry, -2 if key doesn't exist
 */
export async function getTTL(key) {
  const client = getRedisClient();
  if (!client || client.status !== 'ready') {
    return -2;
  }

  try {
    return await client.ttl(key);
  } catch (error) {
    console.warn(`Cache TTL error for key ${key}:`, error.message);
    return -2;
  }
}

/**
 * Clear all cache (use with caution!)
 * @returns {Promise<boolean>} Success status
 */
export async function clearAllCache() {
  const client = getRedisClient();
  if (!client || client.status !== 'ready') {
    return false;
  }

  try {
    await client.flushdb();
    console.log('All cache cleared');
    return true;
  } catch (error) {
    console.warn('Cache clear error:', error.message);
    return false;
  }
}

/**
 * Get cache statistics (for monitoring/learning)
 * @returns {Promise<object>} Cache stats
 */
export async function getCacheStats() {
  const client = getRedisClient();
  if (!client || client.status !== 'ready') {
    return { available: false };
  }

  try {
    const info = await client.info('stats');
    const keyspace = await client.info('keyspace');
    const keys = await client.dbsize();

    return {
      available: true,
      keys,
      info: {
        stats: info,
        keyspace: keyspace
      }
    };
  } catch (error) {
    console.warn('Cache stats error:', error.message);
    return { available: false, error: error.message };
  }
}

/**
 * Query timing wrapper - logs query execution time and cache status
 * @param {string} queryName - Name of the query for logging
 * @param {Function} queryFn - Async function to execute
 * @param {object} params - Optional parameters to log (storeIds, productIds count, etc.)
 * @returns {Promise<any>} Query result
 */
export async function timedQuery(queryName, queryFn, params = {}) {
  const startTime = Date.now();
  try {
    const result = await queryFn();
    const duration = Date.now() - startTime;
    const paramStr = Object.entries(params)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return `${key}:${value.length}`;
        }
        if (typeof value === 'object' && value !== null) {
          return `${key}:${JSON.stringify(value).substring(0, 50)}`;
        }
        return `${key}:${value}`;
      })
      .join(' ');
    console.log(`[QUERY] ${queryName} | DB | ${duration}ms | ${paramStr}`);

    // Log result size if it's an array or object
    if (Array.isArray(result)) {
      console.log(`[QUERY] ${queryName} | RESULT | ${result.length} items`);
    } else if (result && typeof result === 'object') {
      const keys = Object.keys(result);
      console.log(`[QUERY] ${queryName} | RESULT | ${keys.length} keys`);
    }

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[QUERY] ${queryName} | ERROR | ${duration}ms | ${error.message}`);
    throw error;
  }
}
