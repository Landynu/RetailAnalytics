# Connection Pool Fix for Railway

## Problem
Railway database was rejecting connections with error:
```
FATAL: sorry, too many clients already
```

## Solution Applied

### 1. Connection Pool Configuration ✓
Updated `.env.server` with strict connection limits:

```
DATABASE_URL=postgresql://...?connection_limit=5&pool_timeout=20&connect_timeout=10
```

**Parameters:**
- `connection_limit=5` - Maximum 5 concurrent connections (Railway free tier has ~20 total)
- `pool_timeout=20` - Wait up to 20 seconds for connection from pool
- `connect_timeout=10` - Wait up to 10 seconds when establishing connection

### 2. Why This Happened

The "too many clients" error occurs because:
1. **Multiple Queries**: Each query in `getGlobalSalesAnalytics` opens multiple connections via `Promise.all()`
2. **Default Pool Size**: Prisma defaults to 10 connections per instance
3. **Railway Limits**: Free tier only allows ~20 concurrent connections
4. **Auth Checks**: Every request checks sessions, consuming additional connections

Your query was trying to open **5 simultaneous connections** for the Promise.all queries, plus auth connections, exceeding Railway's limits.

### 3. How To Apply The Fix

**Step 1: Stop the current server**
Press `Ctrl+C` to stop `wasp start`

**Step 2: Restart the server**
```bash
wasp start
```

**Step 3: Test the dashboard**
- Open your application
- Try querying "This Year" or a large date range
- Monitor the server logs for any connection errors

### 4. Expected Results After Fix

**Before:**
- ❌ "too many clients already" errors
- ❌ Failed queries on large datasets
- ❌ Session authentication failures

**After:**
- ✅ Stable connection pooling
- ✅ Queries complete successfully
- ✅ No connection errors
- ⚠️  Queries might be slightly slower due to connection queuing

### 5. If Issues Persist

If you still see connection errors, we can:

**Option A: Increase Pool Size (if you have more connections available)**
```
connection_limit=10
```

**Option B: Add Connection Retry Logic**
Add to `src/serverSetup.js`:

```javascript
export const serverMiddlewareFn = (middlewareConfig) => {
  middlewareConfig.set('prisma.connectionPool', {
    timeout: 20000,
    retries: 3
  })
  return middlewareConfig
}
```

**Option C: Implement Query Batching**
Instead of running 5 queries in parallel, run them sequentially:
```javascript
// Instead of Promise.all([ query1, query2, query3, query4, query5 ])
// Run them in sequence:
const sales = await query1();
const refunds = await query2();
// etc...
```

This is slower but uses only 1 connection at a time.

### 6. Long-term Solution

The permanent fix is **Phase 2: Summary Tables**. This will:
- Reduce query complexity
- Require fewer concurrent connections
- Enable connection_limit of 3-5 to work reliably
- Dramatically improve performance

### 7. Monitoring Connection Usage

Add this to check active connections:
```sql
SELECT count(*) FROM pg_stat_activity WHERE datname = 'railway';
```

Run this query in Railway's database console to see how many connections are active.

## Next Steps

1. **Restart your server** to apply the connection limit
2. **Test the dashboard** - especially "This Year" queries
3. **Report results** - Let me know if you still see connection errors
4. If stable, we proceed to **Phase 2: Summary Tables**

The connection pool fix is critical for Phase 1 to work properly!
