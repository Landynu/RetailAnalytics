---
description: Common troubleshooting patterns for Wasp and RetailAnalytics
globs:
alwaysApply: false
---

# Troubleshooting

## Import Errors
If Wasp imports break after changing main.wasp or schema.prisma:
**Restart `wasp start`** before further debugging.

## Operations Not Working
1. Check all required `entities` listed in main.wasp declaration
2. Verify `fn: import` path uses `@src/` prefix
3. Check Wasp server console for runtime errors
4. Ensure client calls match expected argument shape

## Redis / Caching Issues
1. Verify `REDIS_URL` in `.env.server`
2. Inspect `src/cache/` modules (redis.js for connection, utils.js for get/set helpers)
3. Check `warmCache.js` for cache pre-warming logic
4. Cache keys are typically `{queryName}:{storeId}:{params}`

## POS Scraper Issues
1. Verify Playwright is installed (`npx playwright install`)
2. Check `ENCRYPTION_KEY` env var for credential encryption
3. Review `src/server/scraper.js` for POS-specific logic (Greenline, Dutchie, Cova)
4. Check PgBoss job logs for `scrapeAllPOSAccounts` failures

## CSV Upload / S3 Issues
1. Verify S3 env vars: `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`
2. Check `src/actions/s3.js` for upload logic
3. Ensure Railway S3-compatible storage is configured

## Database Issues
1. Verify schema.prisma syntax
2. Run `wasp db migrate-dev` after schema changes
3. Ensure PostgreSQL is running
4. Check `DATABASE_URL` in `.env.server`

## Performance
- Use specific entity dependencies in operations for targeted cache invalidation
- Leverage pre-aggregated WeeklySalesSummary instead of querying raw snapshots
- Check Redis cache hit rates in server logs
