import Redis from 'ioredis';

let redisClient = null;

/**
 * Get or create Redis client (singleton pattern)
 * Supports both REDIS_URL and individual environment variables
 */
function getRedisClient() {
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
      console.log('✅ Redis connected');
    });

    redisClient.on('ready', () => {
      console.log('✅ Redis ready');
    });

    redisClient.on('close', () => {
      console.log('⚠️ Redis connection closed');
    });

    // Connect lazily
    redisClient.connect().catch((err) => {
      console.warn('⚠️ Redis connection failed (continuing without cache):', err.message);
      redisClient = null;
    });

    return redisClient;
  } catch (error) {
    console.warn('⚠️ Redis initialization failed (continuing without cache):', error.message);
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
    console.warn(`⚠️ Cache get error for key ${key}:`, error.message);
    return null;
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
    console.warn(`⚠️ Cache set error for key ${key}:`, error.message);
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
    console.warn(`⚠️ Cache delete error for key ${key}:`, error.message);
    return false;
  }
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

    console.log(`🗑️ Invalidated ${deletedCount} cache keys matching pattern: ${pattern}`);
    return deletedCount;
  } catch (error) {
    console.warn(`⚠️ Cache pattern invalidation error for ${pattern}:`, error.message);
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
    console.warn(`⚠️ Cache TTL error for key ${key}:`, error.message);
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
    console.log('🗑️ All cache cleared');
    return true;
  } catch (error) {
    console.warn('⚠️ Cache clear error:', error.message);
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
    console.warn('⚠️ Cache stats error:', error.message);
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

/**
 * Warm cache with base (unfiltered) data for ordering analytics
 * This pre-populates cache after CSV uploads so filters are instant
 * @param {object} context - Wasp context with entities
 * @param {number[]} storeIds - List of store IDs to warm cache for
 * @param {Date} startDate - Start date for date range
 * @param {Date} endDate - End date for date range
 * @param {boolean} includeHiddenCategories - Whether to include hidden categories
 */
export async function warmOrderingAnalyticsCache(context, storeIds, startDate, endDate, includeHiddenCategories = false) {
  const warmStartTime = Date.now();
  console.log(`[CACHE] 🚀 Starting cache warm for stores: ${storeIds.join(',')}`);
  
  // Validate context
  if (!context || !context.entities) {
    console.error(`[CACHE] ❌ Cache warm failed: Invalid context (missing entities)`);
    return;
  }
  
  try {
    // Calculate date ranges
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const weekBoundaries = calculateWeekBoundaries(startDate, endDate);
    const today = new Date();
    const currentDay = today.getDay();
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
    currentWeekStart.setHours(0, 0, 0, 0);
    
    // Base product where (no user filters)
    const productIdsWithRecentSales = await context.entities.WeeklySalesSummary.findMany({
      where: {
        storeId: { in: storeIds },
        weekStart: { gte: thirtyDaysAgo },
        unitsSold: { gt: 0 }
      },
      select: { productId: true },
      distinct: ['productId']
    }).then(results => results.map(r => r.productId));
    
    const baseProductWhere = {
      AND: [
        {
          OR: [
            { stockLevels: { some: { storeId: { in: storeIds }, quantity: { gt: 0 } }}},
            ...(productIdsWithRecentSales.length > 0 ? [{ id: { in: productIdsWithRecentSales } }] : [{ id: { in: [] } }])
          ]
        },
        ...(includeHiddenCategories ? [] : [
          { parentCategory: { notIn: ['Accessories', 'Accessory', 'VPT'] } }
        ])
      ]
    };
    
    // Load ALL base data in parallel
    const [
      allProducts,
      allProductIdsForRankings,
      weeklySalesData,
      movementSalesData,
      allPOs,
      allRankingsSalesData
    ] = await Promise.all([
      // All products matching base filter (unfiltered)
      context.entities.ProductCatalog.findMany({
        where: baseProductWhere,
        include: {
          stockLevels: {
            where: { storeId: { in: storeIds } },
            select: { storeId: true, quantity: true, store: { select: { id: true, name: true } } }
          }
        }
      }),
      // All product IDs for rankings
      context.entities.ProductCatalog.findMany({
        where: baseProductWhere,
        select: { id: true, subcategory: true }
      }),
      // Weekly sales summaries (complete weeks)
      context.entities.WeeklySalesSummary.findMany({
        where: {
          storeId: { in: storeIds },
          weekStart: { gte: weekBoundaries.start, lt: currentWeekStart }
        },
        select: {
          productId: true,
          storeId: true,
          weekStart: true,
          unitsSold: true
        }
      }),
      // Movement sales (incomplete week)
      context.entities.InventoryMovement.findMany({
        where: {
          storeId: { in: storeIds },
          type: 'sale',
          date: { gte: startDate, lte: endDate }
        },
        select: { productId: true, storeId: true, changeQty: true, date: true }
      }),
      // All purchase orders
      context.entities.InventoryMovement.findMany({
        where: {
          storeId: { in: storeIds },
          type: 'purchase order'
        },
        select: { productId: true, date: true, changeQty: true },
        orderBy: { date: 'desc' }
      }),
      // Rankings data (all products)
      context.entities.WeeklySalesSummary.groupBy({
        by: ['productId'],
        where: {
          storeId: { in: storeIds },
          weekStart: { gte: weekBoundaries.start, lt: currentWeekStart }
        },
        _sum: { unitsSold: true }
      })
    ]);
    
    // Process and cache data
    const storeIdsKey = storeIds.sort().join(',');
    const dateRangeKey = `${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}`;
    
    // Cache base products
    const baseProductsKey = generateCacheKey('base:products', {
      storeIds: storeIdsKey,
      includeHidden: includeHiddenCategories
    });
    await setCached(baseProductsKey, allProducts, 3600, 'base:products'); // 1 hour TTL
    
    // Cache rankings products
    const baseRankingsProductsKey = generateCacheKey('base:rankings_products', {
      storeIds: storeIdsKey,
      includeHidden: includeHiddenCategories
    });
    await setCached(baseRankingsProductsKey, allProductIdsForRankings, 3600, 'base:rankings_products');
    
    // Process and cache sales totals
    const salesMap = new Map();
    const completeWeeksSet = new Set();
    
    // Aggregate weekly sales
    const weeklySalesAggregated = new Map();
    weeklySalesData.forEach(item => {
      const key = `${item.productId}_${item.storeId}`;
      weeklySalesAggregated.set(key, (weeklySalesAggregated.get(key) || 0) + (item.unitsSold || 0));
      completeWeeksSet.add(item.weekStart.getTime());
    });
    
    weeklySalesAggregated.forEach((unitsSold, key) => {
      const [productId, storeId] = key.split('_').map(Number);
      if (!salesMap.has(productId)) {
        salesMap.set(productId, { totalSales: 0, locationSales: {} });
      }
      const productSales = salesMap.get(productId);
      productSales.totalSales += unitsSold;
      productSales.locationSales[storeId] = (productSales.locationSales[storeId] || 0) + unitsSold;
    });
    
    // Add movement sales (incomplete week)
    movementSalesData.forEach(movement => {
      const movementDate = new Date(movement.date);
      const movementDay = movementDate.getDay();
      const movementWeekStart = new Date(movementDate);
      movementWeekStart.setDate(movementDate.getDate() - (movementDay === 0 ? 6 : movementDay - 1));
      movementWeekStart.setHours(0, 0, 0, 0);
      const movementWeekStartTime = movementWeekStart.getTime();
      
      const isCurrentIncompleteWeek = movementWeekStartTime >= currentWeekStart.getTime();
      const isNotInCompleteWeeks = !completeWeeksSet.has(movementWeekStartTime);
      
      if (isCurrentIncompleteWeek || isNotInCompleteWeeks) {
        if (!salesMap.has(movement.productId)) {
          salesMap.set(movement.productId, { totalSales: 0, locationSales: {} });
        }
        const productSales = salesMap.get(movement.productId);
        const unitsSold = Math.abs(movement.changeQty);
        productSales.totalSales += unitsSold;
        productSales.locationSales[movement.storeId] = (productSales.locationSales[movement.storeId] || 0) + unitsSold;
      }
    });
    
    const baseSalesTotalsKey = generateCacheKey('base:sales_totals', {
      storeIds: storeIdsKey,
      dateRange: dateRangeKey
    });
    await setCached(baseSalesTotalsKey, {
      salesMap: Object.fromEntries(salesMap),
      completeWeeks: Array.from(completeWeeksSet)
    }, 3600, 'base:sales_totals');
    
    // Process and cache purchase orders
    const lastPOMap = new Map();
    allPOs.forEach(po => {
      if (!lastPOMap.has(po.productId)) {
        lastPOMap.set(po.productId, {
          date: po.date,
          qty: Math.abs(po.changeQty)
        });
      }
    });
    
    const basePOsKey = generateCacheKey('base:purchase_orders', {
      storeIds: storeIdsKey
    });
    await setCached(basePOsKey, {
      lastPOMap: Object.fromEntries(
        Array.from(lastPOMap.entries()).map(([productId, poData]) => [
          productId,
          { date: poData.date.toISOString(), qty: poData.qty }
        ])
      )
    }, 3600, 'base:purchase_orders');
    
    // Cache rankings
    const rankingsSalesMap = new Map();
    allRankingsSalesData.forEach(item => {
      rankingsSalesMap.set(item.productId, item._sum.unitsSold || 0);
    });
    
    const baseRankingsKey = generateCacheKey('base:rankings', {
      storeIds: storeIdsKey,
      dateRange: `${weekBoundaries.start.toISOString().split('T')[0]}_${currentWeekStart.toISOString().split('T')[0]}`
    });
    await setCached(baseRankingsKey, {
      rankingsSalesMap: Object.fromEntries(rankingsSalesMap)
    }, 3600, 'base:rankings');
    
    const warmDuration = Date.now() - warmStartTime;
    console.log(`[CACHE] ✅ Cache warm complete: ${warmDuration}ms | Products: ${allProducts.length} | Sales: ${salesMap.size} | POs: ${lastPOMap.size}`);
    
  } catch (error) {
    console.error(`[CACHE] ❌ Cache warm failed:`, error.message);
    // Don't throw - cache warming should be fire-and-forget
  }
}

// Helper function for week boundaries (needed in cache.js)
function calculateWeekBoundaries(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Get Monday of the week containing startDate
  const startDay = start.getDay();
  const startWeekStart = new Date(start);
  startWeekStart.setDate(start.getDate() - (startDay === 0 ? 6 : startDay - 1));
  startWeekStart.setHours(0, 0, 0, 0);
  
  // Get Monday of the week containing endDate
  const endDay = end.getDay();
  const endWeekStart = new Date(end);
  endWeekStart.setDate(end.getDate() - (endDay === 0 ? 6 : endDay - 1));
  endWeekStart.setHours(0, 0, 0, 0);
  
  return {
    start: startWeekStart,
    end: endWeekStart
  };
}

