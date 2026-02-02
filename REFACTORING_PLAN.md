# RetailAnalytics Codebase Refactoring Plan

## Progress Tracking

### Phase 2: Actions Split - COMPLETE
- [x] Created `src/actions/` directory
- [x] `src/actions/store.js` - createStore, updateStoreBranding, toggleStoreActive/Favourite/Primary (128 lines)
- [x] `src/actions/menu.js` - generateSmartMenu, generatePrintableMenu (79 lines)
- [x] `src/actions/analytics.js` - exportAnalyticsData, clearAnalyticsCache (111 lines)
- [x] `src/actions/orderWorksheet.js` - 6 functions (223 lines)
- [x] `src/actions/inventory.js` - uploadInventory, analyzeInventoryExport, uploadInventoryExport (1,094 lines - still large)
- [x] `src/actions/inventoryLogs.js` - uploadInventoryLogs (345 lines)
- [x] `src/actions/productCatalog.js` - uploadProductCatalog (257 lines)
- [x] `src/actions/product.js` - enrichProductFormats, updateProductEnrichment, etc. (209 lines)
- [x] `src/actions/productAction.js` - createProductAction, etc. (203 lines)
- [x] `src/actions/weeklySummary.js` - backfillWeeklySummaries (285 lines)
- [x] `src/actions/brandDistributor.js` - updateBrandDistributors, etc. (114 lines)
- [x] `src/actions/classification.js` - seed/create/update/delete Classification (68 lines)
- [x] `src/actions/category.js` - seed/create/update/delete CategoryDefinition, Subcategory (254 lines)
- [x] `src/actions/productSync.js` - syncProductCategoriesToDefinitions, etc. (317 lines)
- [x] `src/actions/s3.js` - configureS3CORS, migrateProductImages, etc. (109 lines)
- [x] `src/actions/cleanup.js` - cleanupOctoberNovember2025, deleteInventoryMovementsByDateRange (227 lines)
- [x] `src/actions/pos.js` - createPOSAccount, etc. (124 lines)
- [x] Update main.wasp imports (all 64 actions updated)

### Phase 3: Queries Split - COMPLETE (partial - simple queries only)
- [x] Created `src/queries/` directory
- [x] `src/queries/helpers.js` - filterProductsInMemory, calculateWeekBoundaries (41 lines)
- [x] `src/queries/store.js` - getUserStores, getStoreById (23 lines)
- [x] `src/queries/pos.js` - getPOSAccounts (37 lines)
- [x] `src/queries/brandDistributor.js` - getBrandDistributors, getDistributors (65 lines)
- [x] `src/queries/productAction.js` - getProductActions, getActiveActionsByProduct (92 lines)
- [x] `src/queries/productCatalog.js` - getProductCatalog, getClassifications, getCategoryDefinitions, getProductById (191 lines)
- [x] `src/queries/inventory.js` - getSalesTrends, getInventoryDashboard, getTopProductsByCategory, getInventoryMovements, getProductInventoryMovements, getCategoryBreakdown, getMenuData (357 lines)
- [x] Update main.wasp imports (all simpler queries updated)
- [ ] Large analytics queries remain in queries.js (getOrderingAnalytics ~1200 lines, getGlobalSalesAnalytics, getDailySalesAnalytics, getOutOfStockProducts, getGlobalAnalyticsFiltered)

### Phase 4: Cache Split - COMPLETE
- [x] Created `src/cache/` directory
- [x] `src/cache/redis.js` - Redis client, getCached, setCached, deleteCached, getCachedBatch (244 lines)
- [x] `src/cache/utils.js` - generateCacheKey, invalidateCachePattern, getTTL, clearAllCache, getCacheStats, timedQuery (162 lines)
- [x] `src/cache/warmCache.js` - warmOrderingAnalyticsCache, calculateWeekBoundaries (272 lines)
- [x] `src/cache/index.js` - Re-exports (25 lines)
- [x] `src/cache.js` updated to re-export from modules (backwards compatible)

### Cleanup - COMPLETE
- [x] Remove `src/middleware/payloadSize.js` (unused)
- [x] Remove empty `src/middleware/` directory

---

## Executive Summary

**Current State:** 24,464 lines across 82 source files with **22 files exceeding the 300-line target**
**Goal:** Reduce file sizes to ~300 lines using Wasp best practices

### Critical Files (1000+ lines)
| File | Lines | Functions | Recommendation |
|------|-------|-----------|----------------|
| actions.js | 4,163 | 61 | Split into 11 domain modules |
| queries.js | 3,438 | 28 | Split into 9 domain modules |
| GlobalUpload.jsx | 1,214 | - | Extract shared components/hooks |
| InventoryUpload.jsx | 1,213 | - | Extract shared components/hooks |
| OrderingDashboard.jsx | 1,117 | - | Extract 4 hooks + 3 components |

### Unused Code Identified
- **4 unused actions:** `updateProductCannabinoids`, `bulkUpdateProducts`, `markProductStatus`, `deleteDistributor`
- **2 unused queries:** `getMenuData`, `getCategoryBreakdown`
- **1 unused component file:** `src/components/ui/table.jsx` (8 exports)

---

## Phase 1: Remove Unused Code (Quick Win)

### 1.1 Remove Unused Actions
Remove from `main.wasp` and `src/actions.js`:
- [ ] `updateProductCannabinoids` (line 3030)
- [ ] `bulkUpdateProducts` (line 3034)
- [ ] `markProductStatus` (line 2233)
- [ ] `deleteDistributor` (line 2675)

### 1.2 Remove Unused Queries
Remove from `main.wasp` and `src/queries.js`:
- [ ] `getMenuData` (line 383)
- [ ] `getCategoryBreakdown` (line 352)

### 1.3 Remove Unused Components
- [ ] Delete `src/components/ui/table.jsx` (entire file, 8 exports unused)

**Estimated reduction:** ~400 lines

---

## Phase 2: Split actions.js (4,163 → 11 files @ ~300-400 lines each)

### New Directory Structure
```
src/
├── actions/
│   ├── index.js              # Re-exports all actions
│   ├── storeActions.js       # 5 functions (~150 lines)
│   ├── inventoryActions.js   # 6 functions (~400 lines)
│   ├── orderActions.js       # 6 functions (~250 lines)
│   ├── productActions.js     # 11 functions (~350 lines)
│   ├── categoryActions.js    # 11 functions (~300 lines)
│   ├── brandActions.js       # 5 functions (~200 lines)
│   ├── dataActions.js        # 5 functions (~250 lines)
│   ├── menuActions.js        # 3 functions (~200 lines)
│   ├── imageActions.js       # 4 functions (~150 lines)
│   ├── posActions.js         # 4 functions (~150 lines)
│   └── cacheActions.js       # 1 function (~50 lines)
└── actions.js                # Deprecated barrel re-export (for Wasp compatibility)
```

### Function Distribution

**storeActions.js** (5 functions)
- `createStore`
- `updateStoreBranding`
- `toggleStoreActive`
- `toggleStoreFavourite`
- `toggleStorePrimary`

**inventoryActions.js** (6 functions)
- `uploadInventory`
- `analyzeInventoryExport`
- `uploadInventoryExport`
- `uploadInventoryLogs`
- `uploadProductCatalog`
- `deleteInventoryMovementsByDateRange`

**orderActions.js** (6 functions)
- `getOrCreateOrderWorksheet`
- `addToOrderWorksheet`
- `updateOrderWorksheetItem`
- `removeFromOrderWorksheet`
- `clearOrderWorksheet`
- `exportOrderWorksheet`

**productActions.js** (11 functions)
- `enrichProductFormats`
- `updateProductEnrichment`
- `createProductAction`
- `updateProductAction`
- `completeProductAction`
- `reactivateProductAction`
- `deleteProductAction`
- `exportProductActions`

**categoryActions.js** (11 functions)
- `createClassification`, `updateClassification`, `deleteClassification`
- `createCategoryDefinition`, `updateCategoryDefinition`, `deleteCategoryDefinition`
- `createSubcategory`, `updateSubcategory`, `deleteSubcategory`
- `syncProductCategoriesToDefinitions`
- `syncProductClassifications`

**brandActions.js** (5 functions)
- `updateBrandDistributors`
- `createDistributor`
- `syncBrands`
- `seedDistributors`

**dataActions.js** (5 functions)
- `seedDefaultClassifications`
- `seedDefaultCategories`
- `backfillWeeklySummaries`
- `cleanupOctoberNovember2025`
- `syncAllProductEnrichments`

**menuActions.js** (3 functions)
- `generateSmartMenu`
- `generatePrintableMenu`
- `exportAnalyticsData`

**imageActions.js** (4 functions)
- `configureS3CORS`
- `migrateProductImages`
- `checkS3Storage`
- `checkImageMigrationStatus`

**posActions.js** (4 functions)
- `createPOSAccount`
- `updatePOSAccount`
- `deletePOSAccount`
- `linkStoreToPOSAccount`

**cacheActions.js** (1 function)
- `clearAnalyticsCache`

### Wasp Configuration Update
After splitting, update `main.wasp` imports:
```wasp
// Before
action createStore {
  fn: import { createStore } from "@src/actions.js",
  entities: [Store]
}

// After (Wasp supports direct imports)
action createStore {
  fn: import { createStore } from "@src/actions/storeActions.js",
  entities: [Store]
}
```

---

## Phase 3: Split queries.js (3,438 → 9 files @ ~200-400 lines each)

### New Directory Structure
```
src/
├── queries/
│   ├── index.js                    # Re-exports all queries
│   ├── storeQueries.js             # 3 functions (~150 lines)
│   ├── inventoryQueries.js         # 6 functions (~400 lines)
│   ├── storeAnalyticsQueries.js    # 1 function (~200 lines)
│   ├── globalAnalyticsQueries.js   # 4 functions → consolidate to 2 (~400 lines)
│   ├── orderingAnalyticsQueries.js # 1 function → split into 4 helpers (~400 lines)
│   ├── outOfStockQueries.js        # 1 function (~250 lines)
│   ├── productCatalogQueries.js    # 6 functions (~300 lines)
│   ├── productActionsQueries.js    # 2 functions (~100 lines)
│   ├── posAccountsQueries.js       # 1 function (~50 lines)
│   └── queryHelpers.js             # Shared utilities (~100 lines)
└── queries.js                      # Deprecated barrel re-export
```

### Priority Consolidation
Merge these near-duplicate functions:
- `getGlobalAnalytics` + `getGlobalSalesAnalytics` + `getGlobalAnalyticsFiltered` → `getGlobalAnalytics(options)`

### Split getOrderingAnalytics (1,173 lines)
This function is too large. Break into:
- `getOrderingProducts()` - fetch & filter products
- `buildOrderingRankings()` - ranking logic
- `buildSparklineData()` - sparkline calculations
- `aggregateOrderingMetrics()` - metrics aggregation

---

## Phase 4: Extract Shared Upload Components (GlobalUpload + InventoryUpload)

### New Shared Modules
```
src/
├── components/
│   └── uploads/
│       ├── CSVFileUploadInput.jsx      # Reusable file input + textarea
│       ├── UploadTabNavigation.jsx     # Tab switching UI
│       ├── DeleteInventoryMovements.jsx # Deletion tool (99% identical)
│       └── UploadStatusMessages.jsx    # Error/success display
├── hooks/
│   └── uploads/
│       ├── useCSVFileHandler.js        # File selection + validation
│       ├── useUploadState.js           # Consolidated state management
│       └── useDeleteInventory.js       # Deletion tool state/handlers
└── utils/
    └── uploads/
        ├── csvValidation.js            # File type validation
        ├── csvLoader.js                # FileReader wrapper
        ├── formatters.js               # Size/date formatting
        └── csvErrorMessages.js         # Error message constants
```

### Expected Results
- GlobalUpload.jsx: 1,214 → ~350 lines (71% reduction)
- InventoryUpload.jsx: 1,213 → ~450 lines (63% reduction)

---

## Phase 5: Refactor Large Page Components

### 5.1 OrderingDashboard.jsx (1,117 → ~400 lines)

**Extract hooks:**
- `useOrderingDataLoader` - progressive loading and state management
- `useProductFiltering` - all filtering logic
- `useProductSorting` - sorting with secondary alphabetical sort
- `useAnalyticsCalculations` - strain counts, location inventory, sales matrix

**Extract components:**
- `OrderingHeaderSection` - title, badges, date range display
- `OrderingStrainCards` - strain type cards
- `ProductTableSection` - table with header and rows

### 5.2 Dashboard.jsx (660 → ~350 lines)

**Extract:**
- `dateRangeUtils.js` - `getRelativeDateRange()` function
- `useFilterPersistence` - localStorage versioning + JSON parsing
- `useViewModeSwitching` - handles active view + conditional query enabling
- `DashboardKPICards` - KPI card grids
- `DashboardViewTabs` - view switching tabs

### 5.3 ActionsPage.jsx (559 → ~300 lines)

**Extract:**
- `actionTypeConfig.js` - ACTION_TYPE_CONFIG object (80 lines)
- `useAutoCompleteActions` - hook for zero inventory auto-completion
- `useActionHandlers` - update, complete, reactivate, delete logic
- `ActionGroupCard` - collapsible action type cards
- `ActionItemRow` - individual action within group

### 5.4 BrandMapping.jsx (548 → ~350 lines)

**Extract:**
- `useBrandFiltering` - all filtering and sorting logic
- `useDistributorCounts` - brand counts per distributor
- `BrandFilterPanel` - filter section
- `BrandListItem` - individual brand card

### 5.5 Settings.jsx (526 → ~300 lines)

**Extract:**
- `useFormModal` - hook to manage modal open/close/submit states
- Move modals to separate files (already partially isolated)

### 5.6 CategoryManagement.jsx (475 → ~300 lines)

**Extract:**
- `useCRUDOperations` - generic create/update/delete logic
- `ClassificationsTab` - own component
- `CategoriesTab` - own component
- `SubcategoriesTab` - own component

---

## Phase 6: Additional Refactoring Opportunities

### 6.1 Extract Shared Auth Middleware (actions)
Pattern appears 60+ times:
```javascript
// Before (in each function)
if (!context.user) { throw new HttpError(401) }

// After (extracted)
const requireAuth = (fn) => async (args, context) => {
  if (!context.user) throw new HttpError(401);
  return fn(args, context);
}
```

### 6.2 Extract Shared Filter Builders (queries)
```javascript
// Create src/queries/filterBuilders.js
export function buildProductWhereClause(filters) { ... }
export function buildStoreWhereClause(storeIds, userId) { ... }
export function buildMovementWhereClause(storeIds, dateRange) { ... }
```

### 6.3 Consolidate Cache Invalidation Patterns
Multiple functions use the same cache invalidation patterns. Extract to:
```javascript
// src/utils/cachePatterns.js
export const CACHE_PATTERNS = {
  ORDERING: 'cache:ordering:*',
  ANALYTICS: 'cache:analytics:*',
  PRODUCTS: 'cache:products:*',
  // ...
}
export function invalidateRelatedCaches(patternKeys) { ... }
```

---

## Implementation Order

### Week 1: Quick Wins & Foundation
1. [ ] Remove unused code (Phase 1)
2. [ ] Create directory structure for actions/queries
3. [ ] Split actions.js into domain modules (Phase 2)
4. [ ] Update main.wasp imports

### Week 2: Queries & Shared Components
5. [ ] Split queries.js into domain modules (Phase 3)
6. [ ] Consolidate duplicate analytics queries
7. [ ] Create shared upload components (Phase 4)

### Week 3: Page Components
8. [ ] Refactor OrderingDashboard.jsx (Phase 5.1)
9. [ ] Refactor Dashboard.jsx (Phase 5.2)
10. [ ] Refactor ActionsPage.jsx (Phase 5.3)

### Week 4: Remaining Pages & Polish
11. [ ] Refactor BrandMapping.jsx (Phase 5.4)
12. [ ] Refactor Settings.jsx (Phase 5.5)
13. [ ] Refactor CategoryManagement.jsx (Phase 5.6)
14. [ ] Extract shared utilities (Phase 6)
15. [ ] Final testing and cleanup

---

## Expected Results

| Metric | Before | After |
|--------|--------|-------|
| Files over 300 lines | 22 | 0-2 |
| Largest file | 4,163 lines | ~400 lines |
| Total unused code removed | 0 | ~400 lines |
| Duplicated patterns | High | Minimal |
| Test isolation | Poor | Good |

### File Count Changes
- actions.js (1 file) → 11 files + 1 barrel
- queries.js (1 file) → 9 files + 1 barrel
- Upload pages (2 files) → 2 pages + 8 shared modules
- Large pages (6 files) → 6 pages + ~15 extracted modules

**Net increase:** ~30 new files, but all under 400 lines with clear single responsibilities

---

## Wasp Best Practices Applied

1. **Domain-based module organization** - Actions and queries grouped by business domain
2. **Co-located concerns** - Related hooks and utilities near their consumers
3. **Barrel exports** - Index files for clean imports
4. **Single responsibility** - Each file handles one concern
5. **Shared utilities** - Common patterns extracted to reusable modules
6. **Type safety ready** - Structure supports future TypeScript migration
