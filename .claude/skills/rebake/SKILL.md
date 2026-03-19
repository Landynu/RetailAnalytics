---
name: rebake
description: Re-run CartoGopher bake to update codebase index after changes
user-invocable: true
---

Re-index the RetailAnalytics codebase with CartoGopher after code changes.

## Steps

1. **Run the bake**:
   ```bash
   cd /home/landyn/Projects/webapps/cannalytics/RetailAnalytics && cartogopher bake .
   ```

2. **Verify**: Confirm the bake completed successfully and `bakes/latest` was updated.

3. **Report**: Show bake stats (functions, LOC, endpoints) from the output.
