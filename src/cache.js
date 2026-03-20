// Re-export all cache functions from modular files
// This file provides backwards compatibility for existing imports

export {
  getRedisClient,
  isRedisAvailable,
  getCached,
  getCachedBatch,
  setCached,
  deleteCached
} from './cache/redis.js';

export {
  generateCacheKey,
  invalidateCachePattern,
  getTTL,
  clearAllCache,
  getCacheStats,
  timedQuery
} from './cache/utils.js';

export {
  calculateWeekBucketBoundaries,
  warmOrderingAnalyticsCache
} from './cache/warmCache.js';
