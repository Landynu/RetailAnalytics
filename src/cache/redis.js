import Redis from 'ioredis';

let redisClient = null;

/**
 * Get or create Redis client (singleton pattern)
 * Supports both REDIS_URL and individual environment variables
 */
export function getRedisClient() {
  if (redisClient) {
    return redisClient;
  }

  try {
    // Try REDIS_URL first (Railway format: redis://default:password@host:port)
    const redisUrl = process.env.REDIS_URL;

    if (redisUrl) {
      redisClient = new Redis(redisUrl, {
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true
      });
    } else {
      // Fall back to individual variables (REDISHOST, REDISPORT, REDISPASSWORD)
      const host = process.env.REDISHOST || 'localhost';
      const port = parseInt(process.env.REDISPORT || '6379', 10);
      const password = process.env.REDISPASSWORD || undefined;

      redisClient = new Redis({
        host,
        port,
        password,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true
      });
    }

    // Set up error handlers
    redisClient.on('error', (err) => {
      console.error('Redis connection error:', err.message);
      // Don't throw - allow graceful degradation
    });

    redisClient.on('connect', () => {
      console.log('Redis connected');
    });

    redisClient.on('ready', () => {
      console.log('Redis ready');
    });

    redisClient.on('close', () => {
      console.log('Redis connection closed');
    });

    // Connect lazily
    redisClient.connect().catch((err) => {
      console.warn('Redis connection failed (continuing without cache):', err.message);
      redisClient = null;
    });

    return redisClient;
  } catch (error) {
    console.warn('Redis initialization failed (continuing without cache):', error.message);
    return null;
  }
}

/**
 * Check if Redis is available
 */
export function isRedisAvailable() {
  const client = getRedisClient();
  return client && client.status === 'ready';
}

/**
 * Get cached value with logging
 * @param {string} key - Cache key
 * @param {string} queryName - Optional query name for logging
 * @returns {Promise<any|null>} Cached value or null if not found
 */
export async function getCached(key, queryName = null) {
  const startTime = Date.now();
  const client = getRedisClient();
  if (!client || client.status !== 'ready') {
    return null;
  }

  try {
    const value = await client.get(key);
    const redisDuration = Date.now() - startTime;
    if (value === null) {
      if (queryName) {
        console.log(`[QUERY] ${queryName} | CACHE MISS | ${redisDuration}ms | key: ${key.substring(0, 50)}...`);
      }
      return null;
    }

    // Parse JSON (this can be slow for large objects)
    const parseStart = Date.now();
    const parsed = JSON.parse(value);
    const parseDuration = Date.now() - parseStart;
    const totalDuration = Date.now() - startTime;

    const ttl = await client.ttl(key);
    if (queryName) {
      const sizeKB = (value.length / 1024).toFixed(2);
      if (parseDuration > 50) {
        console.log(`[QUERY] ${queryName} | CACHE HIT | Redis: ${redisDuration}ms | Parse: ${parseDuration}ms | Total: ${totalDuration}ms | TTL: ${ttl}s | Size: ${sizeKB}KB | key: ${key.substring(0, 50)}...`);
      } else {
        console.log(`[QUERY] ${queryName} | CACHE HIT | ${totalDuration}ms | TTL: ${ttl}s | key: ${key.substring(0, 50)}...`);
      }
    }
    return parsed;
  } catch (error) {
    console.warn(`Cache get error for key ${key}:`, error.message);
    return null;
  }
}

/**
 * Get multiple cached values in parallel using pipelining (faster for multiple keys)
 * @param {string[]} keys - Array of cache keys
 * @param {string[]} queryNames - Optional array of query names for logging (must match keys length)
 * @returns {Promise<Array<any|null>>} Array of cached values (null if not found)
 */
export async function getCachedBatch(keys, queryNames = null) {
  const startTime = Date.now();
  const client = getRedisClient();
  if (!client || client.status !== 'ready') {
    return keys.map(() => null);
  }

  try {
    // Use pipeline for batch operations (single round trip)
    const pipeline = client.pipeline();
    keys.forEach(key => pipeline.get(key));
    const results = await pipeline.exec();

    const redisDuration = Date.now() - startTime;
    const parsedResults = [];

    for (let i = 0; i < results.length; i++) {
      const [error, value] = results[i];
      const queryName = queryNames ? queryNames[i] : null;

      if (error) {
        console.warn(`Cache get error for key ${keys[i]}:`, error.message);
        parsedResults.push(null);
        continue;
      }

      if (value === null) {
        if (queryName) {
          console.log(`[QUERY] ${queryName} | CACHE MISS | ${redisDuration}ms | key: ${keys[i].substring(0, 50)}...`);
        }
        parsedResults.push(null);
        continue;
      }

      // Parse JSON
      const parseStart = Date.now();
      const parsed = JSON.parse(value);
      const parseDuration = Date.now() - parseStart;

      if (queryName) {
        const sizeKB = (value.length / 1024).toFixed(2);
        if (parseDuration > 50) {
          console.log(`[QUERY] ${queryName} | CACHE HIT | Redis: ${redisDuration}ms | Parse: ${parseDuration}ms | TTL: N/A | Size: ${sizeKB}KB | key: ${keys[i].substring(0, 50)}...`);
        } else {
          console.log(`[QUERY] ${queryName} | CACHE HIT | ${redisDuration + parseDuration}ms | key: ${keys[i].substring(0, 50)}...`);
        }
      }

      parsedResults.push(parsed);
    }

    return parsedResults;
  } catch (error) {
    console.warn(`Cache batch get error:`, error.message);
    return keys.map(() => null);
  }
}

/**
 * Set cached value with TTL and logging
 * @param {string} key - Cache key
 * @param {any} value - Value to cache (will be JSON stringified)
 * @param {number} ttlSeconds - Time to live in seconds
 * @param {string} queryName - Optional query name for logging
 * @returns {Promise<boolean>} Success status
 */
export async function setCached(key, value, ttlSeconds = 300, queryName = null) {
  const startTime = Date.now();
  const client = getRedisClient();
  if (!client || client.status !== 'ready') {
    return false;
  }

  try {
    const serialized = JSON.stringify(value);
    await client.setex(key, ttlSeconds, serialized);
    const duration = Date.now() - startTime;
    const sizeKB = (serialized.length / 1024).toFixed(2);
    if (queryName) {
      console.log(`[QUERY] ${queryName} | CACHE SET | ${duration}ms | TTL: ${ttlSeconds}s | Size: ${sizeKB}KB | key: ${key.substring(0, 50)}...`);
    }
    return true;
  } catch (error) {
    console.warn(`Cache set error for key ${key}:`, error.message);
    return false;
  }
}

/**
 * Delete cached value
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} Success status
 */
export async function deleteCached(key) {
  const client = getRedisClient();
  if (!client || client.status !== 'ready') {
    return false;
  }

  try {
    await client.del(key);
    return true;
  } catch (error) {
    console.warn(`Cache delete error for key ${key}:`, error.message);
    return false;
  }
}
