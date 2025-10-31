# Production Connection Pool Timeout Fix Guide

## Problem Summary
The production server was experiencing database connection pool timeouts during bulk inventory uploads:
- `Timed out fetching a new connection from the connection pool`
- Connection pool timeout: 10 seconds
- Connection limit: 97 (Railway PostgreSQL)
- Issue: 10,845 stock levels being upserted using parallel `Promise.all()` exhausted all connections

## Root Causes
1. **Parallel processing**: Using `Promise.all()` to process 500+ database operations simultaneously
2. **No connection pool configuration**: Using default pool settings (10 connections, 10s timeout)
3. **Retry logic**: Failed chunks would retry with smaller batches, creating MORE connection pressure
4. **No sequential processing**: All upserts attempted at once instead of one at a time

## Changes Made

### 1. Optimized Batch Processing (`src/actions.js`)
**Before:**
```javascript
// Process 500 items in parallel - exhausts connections!
await Promise.all(chunk.map(stock => 
  context.entities.StockLevel.upsert({...})
));
```

**After:**
```javascript
// Process items SEQUENTIALLY to manage connections
for (const stock of chunk) {
  await context.entities.StockLevel.upsert({...});
}
```

**Benefits:**
- Only 1 connection used at a time per chunk
- Prevents pool exhaustion
- More predictable performance
- Better error recovery

### 2. Reduced Chunk Size
- Changed from **500** to **100** items per chunk
- Provides better progress feedback
- Easier to recover from errors
- Prevents memory issues

### 3. Database Connection Pool Configuration (`.env.server`)

Add these query parameters to your production `DATABASE_URL`:

```bash
DATABASE_URL=postgresql://user:pass@host:5432/db?connection_limit=20&pool_timeout=30&connect_timeout=10&statement_timeout=300000
```

**Parameters explained:**
- `connection_limit=20`: Max connections in pool (Railway default: 10, max: 97)
- `pool_timeout=30`: Wait up to 30s for available connection (default: 10s)
- `connect_timeout=10`: Wait up to 10s to establish new connection (default: 5s)  
- `statement_timeout=300000`: Allow long queries (5 minutes in ms) for bulk operations

### 4. Improved Error Handling
- Continue processing remaining chunks even if one fails
- Better logging to track progress
- No more retry loops that create connection pressure

## Deployment Steps

### For Railway (or similar PaaS)

1. **Update your environment variables:**
   - Go to your Railway project dashboard
   - Click on your PostgreSQL service
   - Copy the `DATABASE_URL`
   - Go to your app service → Variables tab
   - Update `DATABASE_URL` by adding connection pool parameters:
   
   ```
   postgresql://user:pass@postgres.railway.internal:5432/railway?connection_limit=20&pool_timeout=30&connect_timeout=10&statement_timeout=300000
   ```

2. **Deploy the code changes:**
   ```bash
   git add .
   git commit -m "Fix: Prevent connection pool exhaustion in bulk uploads"
   git push origin main
   ```

3. **Verify deployment:**
   - Watch the deployment logs for any errors
   - Test a small inventory upload first
   - Monitor connection usage in Railway metrics

### For Docker/Self-Hosted

1. **Update `.env.server`:**
   ```bash
   DATABASE_URL=postgresql://user:pass@host:5432/db?connection_limit=20&pool_timeout=30&connect_timeout=10&statement_timeout=300000
   ```

2. **Rebuild and redeploy:**
   ```bash
   wasp build
   # Deploy built Docker image to your hosting
   ```

## Expected Performance Improvements

### Before:
- ❌ 10,845 stock levels → Connection pool timeout
- ❌ Parallel processing → All connections exhausted
- ❌ Auth requests fail → `GET /auth/me 500` errors
- ❌ Processing hangs/crashes

### After:
- ✅ Sequential processing → Controlled connection usage
- ✅ Progress logging → See real-time status
- ✅ Better error handling → Continues on partial failures
- ✅ Auth stays responsive → No connection starvation
- ✅ Predictable completion → ~2-3 minutes for 10k records

## Testing the Fix

1. **Small test upload (recommended first):**
   - Upload a CSV with ~100 products
   - Verify it completes successfully
   - Check server logs for progress messages

2. **Full upload:**
   - Upload your full inventory export
   - Monitor logs for: `Upserting X stock levels in chunks of 100...`
   - Should see: `Stock levels: 100/10845 completed`, etc.
   - Completion message should show total processed

3. **Monitor Railway metrics:**
   - Check "Database Connections" graph
   - Should stay well below 20 connections
   - No more spikes to 97+ connections

## Rollback Plan

If issues persist:

1. Revert code changes:
   ```bash
   git revert HEAD
   git push origin main
   ```

2. Restore original DATABASE_URL (without connection pool params)

3. Contact support with logs showing the specific errors

## Additional Optimizations (Future)

If you still experience slowness with very large uploads (50k+ records):

1. **Consider batch API endpoint:**
   - Upload CSV in multiple smaller files
   - Process each file separately
   - Provides better UX with progress tracking

2. **Background job processing:**
   - Queue large uploads for background processing
   - Use Wasp Jobs feature for async handling
   - Notify user when complete

3. **Database indexing:**
   - Ensure indexes exist on `StockLevel(storeId, productId)`
   - Monitor slow query logs
   - Add composite indexes if needed

## Support

If you continue to experience issues after applying these fixes:
- Check Railway logs for specific error messages
- Monitor database connection count in Railway dashboard
- Verify all environment variables are set correctly
- Ensure you're on the latest deployed version

---

**Version:** 1.0  
**Date:** October 31, 2025  
**Tested on:** Railway PostgreSQL, Wasp 0.15.x
