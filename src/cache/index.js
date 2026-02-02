// Re-export all cache functions for convenient imports
export {
  getRedisClient,
  isRedisAvailable,
  getCached,
  getCachedBatch,
  setCached,
  deleteCached
} from './redis.js';

export {
  generateCacheKey,
  invalidateCachePattern,
  getTTL,
  clearAllCache,
  getCacheStats,
  timedQuery
} from './utils.js';

export {
  calculateWeekBoundaries,
  warmOrderingAnalyticsCache
} from './warmCache.js';
