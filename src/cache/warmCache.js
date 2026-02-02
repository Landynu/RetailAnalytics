import { generateCacheKey } from './utils.js';
import { setCached } from './redis.js';

/**
 * Calculate week boundaries for a date range
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {object} Object with start and end week boundaries (Monday dates)
 */
export function calculateWeekBoundaries(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Get Monday of the week containing startDate
  const startDay = start.getDay();
  const startWeekStart = new Date(start);
  startWeekStart.setDate(start.getDate() - (startDay === 0 ? 6 : startDay - 1));
  startWeekStart.setHours(0, 0, 0, 0);

  // Get Monday of the week containing endDate
  const endDay = end.getDay();
  const endWeekStart = new Date(end);
  endWeekStart.setDate(end.getDate() - (endDay === 0 ? 6 : endDay - 1));
  endWeekStart.setHours(0, 0, 0, 0);

  return {
    start: startWeekStart,
    end: endWeekStart
  };
}

/**
 * Warm cache with base (unfiltered) data for ordering analytics
 * This pre-populates cache after CSV uploads so filters are instant
 * @param {object} context - Wasp context with entities
 * @param {number[]} storeIds - List of store IDs to warm cache for
 * @param {Date} startDate - Start date for date range
 * @param {Date} endDate - End date for date range
 * @param {boolean} includeHiddenCategories - Whether to include hidden categories
 */
export async function warmOrderingAnalyticsCache(context, storeIds, startDate, endDate, includeHiddenCategories = false) {
  const warmStartTime = Date.now();
  console.log(`[CACHE] Starting cache warm for stores: ${storeIds.join(',')}`);

  // Validate context
  if (!context || !context.entities) {
    console.error(`[CACHE] Cache warm failed: Invalid context (missing entities)`);
    return;
  }

  // Validate required entities exist
  const requiredEntities = ['WeeklySalesSummary', 'ProductCatalog', 'InventoryMovement'];
  for (const entityName of requiredEntities) {
    if (!context.entities[entityName]) {
      console.error(`[CACHE] Cache warm failed: Missing entity '${entityName}' in context.entities`);
      return;
    }
  }

  try {
    // Calculate date ranges
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const weekBoundaries = calculateWeekBoundaries(startDate, endDate);
    const today = new Date();
    const currentDay = today.getDay();
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
    currentWeekStart.setHours(0, 0, 0, 0);

    // Base product where (no user filters)
    const productIdsWithRecentSales = await context.entities.WeeklySalesSummary.findMany({
      where: {
        storeId: { in: storeIds },
        weekStart: { gte: thirtyDaysAgo },
        unitsSold: { gt: 0 }
      },
      select: { productId: true },
      distinct: ['productId']
    }).then(results => results.map(r => r.productId));

    const baseProductWhere = {
      AND: [
        {
          OR: [
            { stockLevels: { some: { storeId: { in: storeIds }, quantity: { gt: 0 } }}},
            ...(productIdsWithRecentSales.length > 0 ? [{ id: { in: productIdsWithRecentSales } }] : [{ id: { in: [] } }])
          ]
        },
        ...(includeHiddenCategories ? [] : [
          { parentCategory: { notIn: ['Accessories', 'Accessory', 'VPT'] } }
        ])
      ]
    };

    // Load ALL base data in parallel
    const [
      allProducts,
      allProductIdsForRankings,
      weeklySalesData,
      movementSalesData,
      allPOs
    ] = await Promise.all([
      // All products matching base filter (unfiltered)
      context.entities.ProductCatalog.findMany({
        where: baseProductWhere,
        include: {
          stockLevels: {
            where: { storeId: { in: storeIds } },
            select: { storeId: true, quantity: true, store: { select: { id: true, name: true } } }
          }
        }
      }),
      // All product IDs for rankings (with fields needed for Power BI conditional grouping)
      context.entities.ProductCatalog.findMany({
        where: baseProductWhere,
        select: {
          id: true,
          subcategory: true,
          parentCategory: true,
          format: true,
          strainType: true,
          stockLevels: {
            where: { storeId: { in: storeIds } },
            select: { quantity: true }
          }
        }
      }),
      // Weekly sales summaries (complete weeks)
      context.entities.WeeklySalesSummary.findMany({
        where: {
          storeId: { in: storeIds },
          weekStart: { gte: weekBoundaries.start, lt: currentWeekStart }
        },
        select: {
          productId: true,
          storeId: true,
          weekStart: true,
          unitsSold: true
        }
      }),
      // Movement sales (incomplete week)
      context.entities.InventoryMovement.findMany({
        where: {
          storeId: { in: storeIds },
          type: 'sale',
          date: { gte: startDate, lte: endDate }
        },
        select: { productId: true, storeId: true, changeQty: true, date: true }
      }),
      // All purchase orders
      context.entities.InventoryMovement.findMany({
        where: {
          storeId: { in: storeIds },
          type: 'purchase order'
        },
        select: { productId: true, date: true, changeQty: true },
        orderBy: { date: 'desc' }
      })
    ]);

    // Process and cache data
    const storeIdsKey = storeIds.sort().join(',');
    const dateRangeKey = `${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}`;

    // Cache base products
    const baseProductsKey = generateCacheKey('base:products', {
      storeIds: storeIdsKey,
      includeHidden: includeHiddenCategories
    });
    await setCached(baseProductsKey, allProducts, 3600, 'base:products'); // 1 hour TTL

    // Cache rankings products (transform to include computed totalInventory)
    const baseRankingsProductsKey = generateCacheKey('base:rankings_products', {
      storeIds: storeIdsKey,
      includeHidden: includeHiddenCategories
    });
    const transformedRankingsProducts = allProductIdsForRankings.map(p => ({
      id: p.id,
      subcategory: p.subcategory,
      parentCategory: p.parentCategory,
      format: p.format,
      strainType: p.strainType,
      totalInventory: p.stockLevels ? p.stockLevels.reduce((sum, sl) => sum + sl.quantity, 0) : 0
    }));
    await setCached(baseRankingsProductsKey, transformedRankingsProducts, 3600, 'base:rankings_products');

    // Process and cache sales totals
    const salesMap = new Map();
    const completeWeeksSet = new Set();

    // Aggregate weekly sales
    const weeklySalesAggregated = new Map();
    weeklySalesData.forEach(item => {
      const key = `${item.productId}_${item.storeId}`;
      weeklySalesAggregated.set(key, (weeklySalesAggregated.get(key) || 0) + (item.unitsSold || 0));
      completeWeeksSet.add(item.weekStart.getTime());
    });

    weeklySalesAggregated.forEach((unitsSold, key) => {
      const [productId, storeId] = key.split('_').map(Number);
      if (!salesMap.has(productId)) {
        salesMap.set(productId, { totalSales: 0, locationSales: {} });
      }
      const productSales = salesMap.get(productId);
      productSales.totalSales += unitsSold;
      productSales.locationSales[storeId] = (productSales.locationSales[storeId] || 0) + unitsSold;
    });

    // Add movement sales (incomplete week)
    movementSalesData.forEach(movement => {
      const movementDate = new Date(movement.date);
      const movementDay = movementDate.getDay();
      const movementWeekStart = new Date(movementDate);
      movementWeekStart.setDate(movementDate.getDate() - (movementDay === 0 ? 6 : movementDay - 1));
      movementWeekStart.setHours(0, 0, 0, 0);
      const movementWeekStartTime = movementWeekStart.getTime();

      const isCurrentIncompleteWeek = movementWeekStartTime >= currentWeekStart.getTime();
      const isNotInCompleteWeeks = !completeWeeksSet.has(movementWeekStartTime);

      if (isCurrentIncompleteWeek || isNotInCompleteWeeks) {
        if (!salesMap.has(movement.productId)) {
          salesMap.set(movement.productId, { totalSales: 0, locationSales: {} });
        }
        const productSales = salesMap.get(movement.productId);
        const unitsSold = Math.abs(movement.changeQty);
        productSales.totalSales += unitsSold;
        productSales.locationSales[movement.storeId] = (productSales.locationSales[movement.storeId] || 0) + unitsSold;
      }
    });

    const baseSalesTotalsKey = generateCacheKey('base:sales_totals', {
      storeIds: storeIdsKey,
      dateRange: dateRangeKey
    });
    await setCached(baseSalesTotalsKey, {
      salesMap: Object.fromEntries(salesMap),
      completeWeeks: Array.from(completeWeeksSet)
    }, 3600, 'base:sales_totals');

    // Process and cache purchase orders
    const lastPOMap = new Map();
    allPOs.forEach(po => {
      if (!lastPOMap.has(po.productId)) {
        lastPOMap.set(po.productId, {
          date: po.date,
          qty: Math.abs(po.changeQty)
        });
      }
    });

    const basePOsKey = generateCacheKey('base:purchase_orders', {
      storeIds: storeIdsKey
    });
    await setCached(basePOsKey, {
      lastPOMap: Object.fromEntries(
        Array.from(lastPOMap.entries()).map(([productId, poData]) => [
          productId,
          { date: poData.date.toISOString(), qty: poData.qty }
        ])
      )
    }, 3600, 'base:purchase_orders');

    const warmDuration = Date.now() - warmStartTime;
    console.log(`[CACHE] Cache warm complete: ${warmDuration}ms | Products: ${allProducts.length} | Sales: ${salesMap.size} | POs: ${lastPOMap.size}`);

  } catch (error) {
    console.error(`[CACHE] Cache warm failed:`, error.message);
    // Don't throw - cache warming should be fire-and-forget
  }
}
