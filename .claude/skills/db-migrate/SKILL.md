---
name: db-migrate
description: Safely run Wasp database migration with pre/post checks
user-invocable: true
argument-hint: "[migration-name]"
---

Run a safe database migration workflow for RetailAnalytics.

## Steps

1. **Show what changed**: Run `git diff schema.prisma` to display pending schema changes.

2. **Confirm migration name**: Use $ARGUMENTS as the migration name, or ask the user if not provided.

3. **Run the migration**:
   ```bash
   cd /home/landyn/Projects/webapps/cannalytics/RetailAnalytics && wasp db migrate-dev "$MIGRATION_NAME"
   ```

4. **Verify success**: Check that a new migration directory was created in `migrations/`.

5. **Post-migration reminders**:
   - Commit the new migration files
   - If `wasp start` is running, types should auto-update; if not, restart it
   - Run `/rebake` to update CartoGopher index with new schema
