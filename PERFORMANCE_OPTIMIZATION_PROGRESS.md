# Performance Optimization Progress

## Date: October 31, 2025

## Problem Statement
- API transfers of 3.79 MB (4MB) for "This Year" queries
- Need to optimize for 3-4 years of historical data
- Want seasonality trends, day-of-week analysis, time-of-day patterns

## Phase 1: Quick Wins - COMPLETED ✓

### 1. Query Optimization ✓
**Files Modified:** `src/queries.js`

**Changes Made:**
- Added field selection to all major queries
- Only fetch required fields instead of full objects
- Optimized `getGlobalSalesAnalytics`: Now selects only 7 fields instead of entire product object
- Optimized `getOrderingAnalytics`: Uses selective field fetching
- Changed default date range from 14 to 30 days

**Expected Impact:** 50-60% reduction in payload size immediately

### 2. Database Indexes ✓
**Files Modified:** `schema.prisma`

**Indexes Added:**
```prisma
// InventoryMovement - for date-based queries
@@index([date, type])
@@index([storeId, date])
@@index([productId, date])
@@index([storeId, type, date])

// StockLevel - for inventory queries
@@index([storeId, quantity])
@@index([productId])

// ProductCatalog - for filtering
@@index([parentCategory])
@@index([brand])
@@index([status])
@@index([parentCategory, brand])

// Store - for user queries
@@index([userId, isActive])
```

**Expected Impact:** 2-5x faster query performance on large datasets

### 3. Schema Fixed ✓
- Fixed Category self-relation to use `Restrict` instead of `NoAction`
- Schema now compiles successfully with Wasp

## NEXT STEPS - Requires Database Connection

### Step 1: Update Database Connection
You need to update `.env.server` with your Railway production database URL:

```bash
# Replace the current DATABASE_URL with your Railway connection string
DATABASE_URL=postgresql://username:password@host.railway.app:5432/railway?connection_limit=20&pool_timeout=30&connect_timeout=10
```

### Step 2: Run Migration
Once the database URL is updated, run:

```bash
wasp db migrate-dev --name add_performance_indexes
```

This will:
- Create the migration file in `migrations/` directory
- Apply the indexes to your production database
- The indexes will dramatically speed up queries on your large dataset

### Step 3: Test Performance
After migration, test a "This Year" query and check:
- Payload size (should be significantly smaller)
- Query time (should be faster with indexes)
- Browser network tab will show the improvement

## Phase 2: Summary Tables (Next - Strategic Solution)

Once Phase 1 is deployed and tested, we'll implement:

### Weekly Summary Tables
These will pre-aggregate historical data:

```prisma
model WeeklySalesSummary {
  weekStart   DateTime
  storeId     Int
  productId   Int
  
  // Sales metrics
  grossSales  Float
  refunds     Float
  netRevenue  Float
  unitsSold   Int
  
  // Temporal breakdown
  salesByDayOfWeek Json  // {"0": 150, "1": 200, ...}
  salesMorning     Float
  salesAfternoon   Float  
  salesEvening     Float
  salesNight       Float
  
  @@unique([weekStart, storeId, productId])
  @@index([weekStart, storeId])
}
```

### Benefits of Summary Tables
- **Historical queries**: 95%+ reduction in data transfer
- **"This Year" query**: ~200KB instead of 4MB
- **Supports all analytics**: seasonality, day-of-week, time-of-day
- **Fast queries**: <200ms for any date range

### Implementation Steps
1. Add summary models to schema.prisma
2. Create backfill action to populate from existing data
3. Update queries to use hybrid approach:
   - Historical (>30 days): Use summaries
   - Recent (<30 days): Use raw movements
4. Add daily background job to keep summaries updated

## Performance Targets

### Current State
- "This Year" query: 3.79 MB transfer
- Query time: Unknown (likely 2-10 seconds)

### After Phase 1 (Immediate)
- "This Year" query: ~1.5-2 MB transfer (50%+ reduction)
- Query time: <1 second (with indexes)

### After Phase 2 (Strategic)
- "This Year" query: ~200KB transfer (95%+ reduction)
- Query time: <200ms
- All temporal analytics supported (day-of-week, time-of-day)

## Questions Answered

**Q: Can we do day-of-week and time-of-day analysis with summaries?**
A: Yes! We'll store:
- Day-of-week breakdown in JSON field
- Time buckets (morning/afternoon/evening/night) as separate fields
- For detailed hourly analysis of recent data, we query raw movements

**Q: Do we need Redis caching?**
A: Not initially. With summary tables, queries will be fast enough (<200ms). Add Redis later when:
- You have 5+ concurrent users
- You want sub-50ms response times
- You see repeated identical queries

**Q: How to handle the large existing dataset?**
A: The backfill action will:
- Process week-by-week through historical data
- Might take 10-30 minutes for 3-4 years of data
- Runs once, then daily job keeps it updated
- Can run on production database safely

## Files Modified So Far
- `src/queries.js` - Added field selection
- `schema.prisma` - Added performance indexes
- `PERFORMANCE_OPTIMIZATION_PROGRESS.md` - This file

## Files To Modify Next (Phase 2)
- `schema.prisma` - Add summary tables
- `src/actions.js` - Add backfill action
- `src/queries.js` - Add hybrid query logic
- `main.wasp` - Add background job configuration
