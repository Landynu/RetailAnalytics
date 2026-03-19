---
name: wasp-operation
description: Scaffold a new Wasp query or action with main.wasp declaration and implementation
user-invocable: true
argument-hint: "[operationName] [query|action] [domainModule]"
---

Scaffold a new Wasp operation (query or action) for RetailAnalytics.

## Steps

1. **Gather info** from arguments or ask the user:
   - Operation name (camelCase, e.g., `getInventoryHistory`)
   - Type: `query` or `action`
   - Domain module (e.g., `analytics`, `ordering`, `inventory`, `brandDistributor`, `pos`, `productCatalog`, `store`, `invitation`, `outOfStock`, `dailySalesAnalytics`, `globalSalesAnalytics`)
   - Entities needed (e.g., `[Product, InventorySnapshot, Store]`)
   - Brief description of what it does

2. **Use CartoGopher** to find existing patterns:
   - `search` for similar operations in the domain module
   - `symbol` to understand existing operation signatures

3. **Add the declaration** to `main.wasp`:
   ```wasp
   query getThings {
     fn: import { getThings } from "@src/queries/<domain>",
     entities: [Entity1, Entity2]
   }
   ```
   Or for actions:
   ```wasp
   action doThing {
     fn: import { doThing } from "@src/actions/<domain>",
     entities: [Entity1, Entity2]
   }
   ```

4. **Add the implementation** in `src/queries/<domain>.js` or `src/actions/<domain>.js`:
   ```javascript
   import { HttpError } from 'wasp/server'

   export const operationName = async (args, context) => {
     if (!context.user) {
       throw new HttpError(401)
     }
     // Implementation using context.entities.Model
   }
   ```

5. **Remind the user**: If imports aren't resolving, restart `wasp start`.
