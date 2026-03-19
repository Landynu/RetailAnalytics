---
name: deploy-check
description: Pre-deployment validation checklist for RetailAnalytics (Railway)
user-invocable: true
---

Run pre-deployment validation for RetailAnalytics before deploying to Railway.

## Checklist

Run each check and report results:

1. **Syntax validation**: Check key server files for syntax errors:
   ```bash
   cd /home/landyn/Projects/webapps/cannalytics/RetailAnalytics && for f in src/queries/*.js src/actions/*.js; do node --check "$f" 2>&1 || echo "FAIL: $f"; done
   ```

2. **Pending migrations**: Check if schema.prisma has uncommitted changes:
   ```bash
   git diff --name-only schema.prisma
   git status migrations/
   ```

3. **Build succeeds**:
   ```bash
   cd /home/landyn/Projects/webapps/cannalytics/RetailAnalytics && wasp build
   ```

4. **Environment variables**: Remind user to verify Railway secrets match `.env.server` keys:
   - DATABASE_URL
   - REDIS_URL
   - S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET
   - ENCRYPTION_KEY

## Report
Present results as a checklist with pass/fail for each step. If any step fails, provide the error details and suggest fixes.
