import { HttpError } from 'wasp/server'
import { getCached, getCachedBatch, setCached, generateCacheKey, timedQuery } from '../cache.js'
import { EXCLUDED_CATEGORIES } from '../lib/constants.js'
import {
  calculateCategoryRankings,
  processSparklineData,
  buildFilterOptions,
  buildBrandDistributorMap,
  calculateStrainCounts
} from './orderingHelpers.js'

export const getOrderingAnalytics = async ({
  storeIds = null,
  dateRange = null,
  filters = {},
  limit = 100,
  offset = 0,
  includeHiddenCategories = false,
  loadAll = false
}, context) => {
  if (!context.user) { throw new HttpError(401) }

  const queryStartTime = Date.now();
  // Default to 14 days if no date range provided
  const endDate = dateRange?.end ? new Date(dateRange.end) : new Date();
  const startDate = dateRange?.start ? new Date(dateRange.start) : new Date(endDate.getTime() - 14 * 24 * 60 * 60 * 1000);
  const periodDays = Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000));

  // Build store filter
  const storeWhere = { isActive: true };
  if (storeIds && storeIds.length > 0) {
    storeWhere.id = { in: storeIds.map(id => parseInt(id)) };
  }

  // Get user's active stores (including isPrimary flag)
  const stores = await context.entities.Store.findMany({
    where: storeWhere,
    select: { id: true, name: true, location: true, isPrimary: true }
  });

  const storeIdList = stores.map(s => s.id);
  const primaryStore = stores.find(s => s.isPrimary);

  // 30-day activity filter: Only show products with recent activity
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Calculate 12 weeks ago for sparkline data
  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84); // 12 weeks

  // Prepare cache keys for parallel reads (before we need them)
  const storeIdsKey = storeIdList.sort().join(',');
  const baseProductsKey = generateCacheKey('base:products', {
    storeIds: storeIdsKey,
    includeHidden: includeHiddenCategories
  });
  const baseRankingsProductsKey = generateCacheKey('base:rankings_products', {
    storeIds: storeIdsKey,
    includeHidden: includeHiddenCategories
  });
  const recentSalesCacheKey = generateCacheKey('recent_sales', {
    storeIds: storeIdList.sort().join(','),
    date: thirtyDaysAgo.toISOString().split('T')[0]
  });

  // Parallelize ALL cache reads at the start using batch (single Redis round trip)
  let [baseProducts, cachedRankingsProducts, productsWithRecentSalesCached] = await getCachedBatch(
    [baseProductsKey, baseRankingsProductsKey, recentSalesCacheKey],
    ['base:products', 'base:rankings_products', 'recent_sales']
  );

  // Get products with sales in last 30 days from WeeklySalesSummary (for performance)
  // If cache miss, fetch it
  let productsWithRecentSales = productsWithRecentSalesCached;
  if (!productsWithRecentSales) {
    productsWithRecentSales = await timedQuery('recent_sales', () =>
      context.entities.WeeklySalesSummary.findMany({
        where: {
          storeId: { in: storeIdList },
          weekStart: { gte: thirtyDaysAgo },
          unitsSold: { gt: 0 }
        },
        select: { productId: true },
        distinct: ['productId']
      }), { stores: storeIdList.length }
    );
    // Cache for 10 minutes (this data changes daily) - non-blocking
    setCached(recentSalesCacheKey, productsWithRecentSales, 600, 'recent_sales').catch(() => {});
  }

  const productIdsWithRecentSales = productsWithRecentSales.map(r => r.productId);

  // Base filter: Only date range, stores, and 30-day activity
  // Exclude Accessories/VPT by default for performance (unless explicitly requested)
  const baseProductWhere = {
    AND: [
      {
        OR: [
          // Has current inventory
          {
            stockLevels: {
              some: {
                storeId: { in: storeIdList },
                quantity: { gt: 0 }
              }
            }
          },
          // OR has sales in last 30 days (from WeeklySalesSummary)
          ...(productIdsWithRecentSales.length > 0 ? [{ id: { in: productIdsWithRecentSales } }] : [{ id: { in: [] } }])
        ]
      },
      // Exclude Accessories/VPT unless explicitly requested
      ...(includeHiddenCategories ? [] : [
        { parentCategory: { notIn: EXCLUDED_CATEGORIES } }
      ])
    ]
  };

  // Build complete WHERE clause with user filters at database level
  const productWhere = {
    AND: [
      baseProductWhere,
      // Apply user filters at database level
      ...(filters.brands && filters.brands.length > 0 ? [{ brand: { in: filters.brands } }] : []),
      ...(filters.categories && filters.categories.length > 0 ? [{ parentCategory: { in: filters.categories } }] : []),
      ...(filters.subcategories && filters.subcategories.length > 0 ? [{ subcategory: { in: filters.subcategories } }] : []),
      ...(filters.units && filters.units.length > 0 ? [{ unitCount: { in: filters.units } }] : []),
      ...(filters.sizes && filters.sizes.length > 0 ? [{ unitSize: { in: filters.sizes } }] : []),
    ]
  };

  // Base products and rankings products already loaded in parallel above

  let allProductIdsForRankings = null;

  if (baseProducts) {
    // Load from cache - rankings products already loaded in parallel
    // Include parentCategory, format, strainType, and inventory for Power BI-style conditional ranking
    allProductIdsForRankings = cachedRankingsProducts || baseProducts.map(p => ({
      id: p.id,
      subcategory: p.subcategory,
      parentCategory: p.parentCategory,
      format: p.format,
      strainType: p.strainType,
      totalInventory: p.stockLevels ? p.stockLevels.reduce((sum, sl) => sum + sl.quantity, 0) : 0
    }));
  } else {
    // Base cache miss - fetch all products (unfiltered) and cache them
    const dbResults = await Promise.all([
      timedQuery('all_product_ids_rankings', () =>
        context.entities.ProductCatalog.findMany({
          where: baseProductWhere,
          select: {
            id: true,
            subcategory: true,
            parentCategory: true,
            format: true,
            strainType: true,
            stockLevels: {
              where: { storeId: { in: storeIdList } },
              select: { quantity: true }
            }
          }
        }), { stores: storeIdList.length }
      ),
      timedQuery('base_products', () =>
        context.entities.ProductCatalog.findMany({
          where: baseProductWhere,
          include: {
            stockLevels: {
              where: { storeId: { in: storeIdList } },
              select: { storeId: true, quantity: true, store: { select: { name: true } } }
            },
            distributor: {
              select: { id: true, name: true }
            }
          }
        }), { stores: storeIdList.length }
      )
    ]);

    const [rankingsProducts, allProducts] = dbResults;

    // Process rankings products
    allProductIdsForRankings = rankingsProducts.map(p => ({
      id: p.id,
      subcategory: p.subcategory,
      parentCategory: p.parentCategory,
      format: p.format,
      strainType: p.strainType,
      totalInventory: p.stockLevels.reduce((sum, sl) => sum + sl.quantity, 0)
    }));

    // Cache rankings products (non-blocking)
    setCached(baseRankingsProductsKey, allProductIdsForRankings, 3600, 'base:rankings_products').catch(() => {});

    baseProducts = allProducts;

    // Cache base products (non-blocking)
    setCached(baseProductsKey, baseProducts, 3600, 'base:products').catch(() => {});
  }

  // Fetch filtered + paginated products (with filters applied at DB level)
  const [filteredProducts, totalCount] = await Promise.all([
    timedQuery('filtered_products', () =>
      context.entities.ProductCatalog.findMany({
        where: productWhere,
        include: {
          stockLevels: {
            where: { storeId: { in: storeIdList } },
            select: { storeId: true, quantity: true, store: { select: { name: true } } }
          },
          distributor: {
            select: { id: true, name: true }
          }
        },
        ...(loadAll ? {} : { take: limit, skip: offset }),
        orderBy: { name: 'asc' }
      }), { stores: storeIdList.length, limit, offset }
    ),
    timedQuery('total_count', () =>
      context.entities.ProductCatalog.count({
        where: productWhere
      }), {}
    )
  ]);

  // For pagination: use paginated products for metric calculation, but full filtered IDs for rankings/sparklines
  const products = loadAll ? filteredProducts : filteredProducts;
  const productIds = loadAll ? filteredProducts.map(p => p.id) : products.map(p => p.id);
  const allFilteredProductIds = filteredProducts.map(p => p.id);

  // ============================================================================
  // Sales Data, Purchase Orders, and Last Sale Data
  // ============================================================================

  const dateRangeKey = `${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}`;
  const baseSalesTotalsKey = generateCacheKey('base:sales_totals', {
    storeIds: storeIdsKey,
    dateRange: dateRangeKey
  });
  const basePOsKey = generateCacheKey('base:purchase_orders', {
    storeIds: storeIdsKey
  });

  const [cachedBaseSales, cachedBasePOs] = await getCachedBatch(
    [baseSalesTotalsKey, basePOsKey],
    ['base:sales_totals', 'base:purchase_orders']
  );

  const hasValidPOCache = cachedBasePOs && cachedBasePOs.lastPOMap && Object.keys(cachedBasePOs.lastPOMap).length > 0;
  const allBaseProductIds = baseProducts ? baseProducts.map(p => p.id) : [];

  // Fetch movements (sales) and purchase orders in parallel — only what's missing from cache
  const [movementSales, freshPOs] = await Promise.all([
    !cachedBaseSales && allBaseProductIds.length > 0 ? timedQuery('movement_sales', () =>
      context.entities.InventoryMovement.findMany({
        where: {
          storeId: { in: storeIdList },
          productId: { in: allBaseProductIds },
          type: 'sale',
          date: { gte: startDate, lte: endDate }
        },
        select: { productId: true, storeId: true, changeQty: true }
      }), { productIds: allBaseProductIds.length, stores: storeIdList.length, dateRange: dateRangeKey }
    ) : Promise.resolve(null),
    !hasValidPOCache && allBaseProductIds.length > 0 ? timedQuery('purchase_orders', () =>
      context.entities.InventoryMovement.findMany({
        where: {
          storeId: { in: storeIdList },
          productId: { in: allBaseProductIds },
          type: 'purchase order'
        },
        select: { productId: true, date: true, changeQty: true },
        orderBy: { date: 'desc' }
      }), { productIds: allBaseProductIds.length, stores: storeIdList.length }
    ) : Promise.resolve(null)
  ]);

  const allPOs = freshPOs;
  let salesMap = new Map();

  if (cachedBaseSales) {
    const baseSalesMap = new Map();
    if (cachedBaseSales.salesMap) {
      Object.entries(cachedBaseSales.salesMap).forEach(([productId, sales]) => {
        baseSalesMap.set(parseInt(productId), sales);
      });
    }
    allFilteredProductIds.forEach(productId => {
      if (baseSalesMap.has(productId)) {
        salesMap.set(productId, baseSalesMap.get(productId));
      }
    });
  } else {
    const baseSalesMap = new Map();
    (movementSales || []).forEach(movement => {
      if (!baseSalesMap.has(movement.productId)) {
        baseSalesMap.set(movement.productId, { totalSales: 0, locationSales: {} });
      }
      const productSales = baseSalesMap.get(movement.productId);
      const unitsSold = Math.abs(movement.changeQty);
      productSales.totalSales += unitsSold;
      productSales.locationSales[movement.storeId] = (productSales.locationSales[movement.storeId] || 0) + unitsSold;
    });

    setCached(
      baseSalesTotalsKey,
      { salesMap: Object.fromEntries(baseSalesMap) },
      3600,
      'base:sales_totals'
    ).catch(() => {});

    allFilteredProductIds.forEach(productId => {
      if (baseSalesMap.has(productId)) {
        salesMap.set(productId, baseSalesMap.get(productId));
      }
    });
  }

  // ============================================================================
  // Purchase Order Map
  // ============================================================================

  let lastPOMap = new Map();
  let baseLastPOMap = new Map();

  const useCachedPOs = cachedBasePOs && cachedBasePOs.lastPOMap && Object.keys(cachedBasePOs.lastPOMap).length > 0;

  if (useCachedPOs) {
    if (cachedBasePOs.lastPOMap) {
      Object.entries(cachedBasePOs.lastPOMap).forEach(([productId, poData]) => {
        const pid = parseInt(productId);
        baseLastPOMap.set(pid, {
          date: new Date(poData.date),
          qty: poData.qty
        });
      });
    }

    allFilteredProductIds.forEach(productId => {
      const pid = parseInt(productId);
      if (baseLastPOMap.has(pid)) {
        lastPOMap.set(pid, baseLastPOMap.get(pid));
      }
    });
  } else {
    if (allPOs && Array.isArray(allPOs)) {
      allPOs.forEach(po => {
        const pid = parseInt(po.productId);
        if (!baseLastPOMap.has(pid)) {
          baseLastPOMap.set(pid, {
            date: po.date instanceof Date ? po.date : new Date(po.date),
            qty: Math.abs(po.changeQty)
          });
        }
      });
    }

    // Cache the base lastPOMap (non-blocking)
    const basePOsToCache = {
      lastPOMap: Object.fromEntries(
        Array.from(baseLastPOMap.entries()).map(([productId, poData]) => [
          productId,
          { date: poData.date.toISOString(), qty: poData.qty }
        ])
      )
    };
    setCached(basePOsKey, basePOsToCache, 3600, 'base:purchase_orders').catch(() => {});

    allFilteredProductIds.forEach(productId => {
      const pid = parseInt(productId);
      if (baseLastPOMap.has(pid)) {
        lastPOMap.set(pid, baseLastPOMap.get(pid));
      }
    });
  }

  // ============================================================================
  // Recent Sales (Last Sale Date) and Location Counts
  // ============================================================================

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  // Start location_counts query early (independent)
  const locationCountsPromise = allFilteredProductIds.length > 0 ? timedQuery('location_counts', () =>
    context.entities.StockLevel.groupBy({
      by: ['storeId'],
      where: {
        storeId: { in: storeIdList },
        quantity: { gt: 0 },
        productId: { in: allFilteredProductIds }
      },
      _count: { productId: true }
    }), { productIds: allFilteredProductIds.length, stores: storeIdList.length }
  ) : Promise.resolve([]);

  // Cache key for recent sales movements
  const recentSalesMovementsCacheKey = productIds.length > 0 ? generateCacheKey('recent_sales_movements', {
    productIds: productIds.sort((a, b) => a - b).join(','),
    storeIds: storeIdList.sort().join(','),
    date: fourteenDaysAgo.toISOString().split('T')[0]
  }) : null;

  // Start recent sales cache check and location counts in parallel
  const [cachedRecentSales, locationCountsResult] = await Promise.all([
    recentSalesMovementsCacheKey ? getCached(recentSalesMovementsCacheKey, 'recent_sales_movements') : Promise.resolve(null),
    locationCountsPromise
  ]);

  // Fetch recent sales if cache miss
  let recentSales = cachedRecentSales;
  if (!recentSales && productIds.length > 0) {
    recentSales = await timedQuery('recent_sales_movements', () =>
      context.entities.InventoryMovement.findMany({
        where: {
          storeId: { in: storeIdList },
          productId: { in: productIds },
          type: 'sale',
          date: { gte: fourteenDaysAgo }
        },
        select: { productId: true, storeId: true, date: true },
        orderBy: { date: 'desc' }
      }), { productIds: productIds.length, stores: storeIdList.length }
    );
    if (recentSales && recentSales.length > 0 && recentSalesMovementsCacheKey) {
      setCached(recentSalesMovementsCacheKey, recentSales, 600, 'recent_sales_movements').catch(() => {});
    }
  }
  recentSales = recentSales || [];

  // Build map of product -> most recent sale date from movements
  const lastSaleMap = new Map();
  // Also build per-store last sale map: key = "productId:storeId"
  const lastSaleByStoreMap = new Map();
  recentSales.forEach(movement => {
    const saleDate = movement.date instanceof Date ? movement.date : new Date(movement.date);
    if (!lastSaleMap.has(movement.productId)) {
      lastSaleMap.set(movement.productId, saleDate);
    }
    const storeKey = `${movement.productId}:${movement.storeId}`;
    if (!lastSaleByStoreMap.has(storeKey)) {
      lastSaleByStoreMap.set(storeKey, saleDate);
    }
  });

  // Get older sales from weekly summaries (for products not in recent sales) - CACHED
  const remainingProductIds = productIds.filter(id => !lastSaleMap.has(id));
  const olderSalesCacheKey = remainingProductIds.length > 0 ? generateCacheKey('older_sales', {
    productIds: remainingProductIds.sort((a, b) => a - b).join(','),
    storeIds: storeIdList.sort().join(',')
  }) : null;

  let olderSaleData = olderSalesCacheKey ? await getCached(olderSalesCacheKey, 'older_sales') : null;
  if (!olderSaleData && remainingProductIds.length > 0) {
    olderSaleData = await timedQuery('older_sales', () =>
      context.entities.WeeklySalesSummary.findMany({
        where: {
          storeId: { in: storeIdList },
          productId: { in: remainingProductIds },
          unitsSold: { gt: 0 }
        },
        select: {
          productId: true,
          storeId: true,
          weekStart: true
        },
        orderBy: { weekStart: 'desc' }
      }), { productIds: remainingProductIds.length, stores: storeIdList.length }
    );
    if (olderSaleData && olderSaleData.length > 0 && olderSalesCacheKey) {
      setCached(olderSalesCacheKey, olderSaleData, 1800, 'older_sales').catch(() => {});
    }
  }
  olderSaleData = olderSaleData || [];

  olderSaleData.forEach(summary => {
    const weekStartDate = summary.weekStart instanceof Date ? summary.weekStart : new Date(summary.weekStart);
    if (!lastSaleMap.has(summary.productId)) {
      lastSaleMap.set(summary.productId, weekStartDate);
    }
    const storeKey = `${summary.productId}:${summary.storeId}`;
    if (!lastSaleByStoreMap.has(storeKey)) {
      lastSaleByStoreMap.set(storeKey, weekStartDate);
    }
  });

  // ============================================================================
  // Calculate Product Metrics
  // ============================================================================

  const allProductMetrics = [];

  for (const product of products) {
    const totalInventory = product.stockLevels.reduce((sum, sl) => sum + sl.quantity, 0);
    const productSales = salesMap.get(product.id) || { totalSales: 0, locationSales: {} };
    const totalSales = productSales.totalSales;

    // Skip if no sales and no inventory
    if (totalInventory === 0 && totalSales === 0) continue;

    const weeksInPeriod = periodDays / 7;
    const velocity = weeksInPeriod > 0 ? totalSales / weeksInPeriod : 0;
    const weeksLeft = velocity > 0 ? totalInventory / velocity : 999;

    const actualLastSaleDate = lastSaleMap.get(product.id);
    const daysSinceLastSale = actualLastSaleDate ? Math.floor((endDate - actualLastSaleDate) / (24 * 60 * 60 * 1000)) : null;

    const lastPOData = lastPOMap.get(product.id);
    const lastPODate = lastPOData ? (lastPOData.date instanceof Date ? lastPOData.date : new Date(lastPOData.date)) : null;
    const lastPOQty = lastPOData ? lastPOData.qty : null;
    const daysSinceLastPO = lastPODate && !isNaN(lastPODate.getTime()) ? Math.floor((endDate - lastPODate) / (24 * 60 * 60 * 1000)) : null;

    const twoWeekDemand = velocity * 2;
    const suggestedQty = Math.max(0, Math.ceil(twoWeekDemand - totalInventory));
    const caseSize = product.caseSize || 12;
    const suggestedCases = Math.ceil(suggestedQty / caseSize);

    const locationInventory = product.stockLevels.map(sl => ({
      storeId: sl.storeId,
      storeName: sl.store.name,
      quantity: sl.quantity
    }));

    const locationSales = Object.keys(productSales.locationSales).map(storeId => ({
      storeId: parseInt(storeId),
      units: productSales.locationSales[storeId]
    }));

    // Per-store last sale dates for CSV export
    const locationLastSale = storeIdList.map(sId => {
      const storeKey = `${product.id}:${sId}`;
      const date = lastSaleByStoreMap.get(storeKey);
      return {
        storeId: sId,
        daysSinceLastSale: date ? Math.floor((endDate - date) / (24 * 60 * 60 * 1000)) : null
      };
    });

    allProductMetrics.push({
      id: product.id,
      gtin: product.gtin,
      name: product.name,
      brand: product.brand,
      parentCategory: product.parentCategory,
      subcategory: product.subcategory,
      classificationId: product.classificationId,
      categoryDefinitionId: product.categoryDefinitionId,
      subcategoryId: product.subcategoryId,
      strainType: product.strainType,
      format: product.format,
      unitCount: product.unitCount,
      unitSize: product.unitSize,
      status: product.status,
      retailPrice: product.retailPrice,
      wholesaleCost: product.wholesaleCost,
      margin: product.margin,
      caseSize,
      totalInventory,
      locationInventory,
      locationSales,
      locationLastSale,
      totalSales,
      velocity,
      weeksLeft,
      daysSinceLastSale,
      daysSinceLastPO,
      lastPOQty,
      suggestedQty,
      suggestedCases
    });
  }

  // ============================================================================
  // Rankings, Sparklines, and Response Assembly
  // ============================================================================

  // Apply category rankings
  const rankingsMap = calculateCategoryRankings(allProductIdsForRankings, salesMap);
  const filteredProductMetrics = allProductMetrics;

  filteredProductMetrics.forEach(p => {
    const ranking = rankingsMap.get(p.id);
    if (ranking) {
      p.categoryRank = ranking.categoryRank;
      p.categoryTotal = ranking.categoryTotal;
      p.isTop10 = ranking.isTop10;
    }
  });

  filteredProductMetrics.sort((a, b) => b.velocity - a.velocity);

  const hasMore = loadAll ? false : offset + limit < totalCount;

  // Sparkline data
  const paginatedProductIds = filteredProductMetrics.map(p => p.id);
  const sparklineData = loadAll && paginatedProductIds.length > 0 ? await (async () => {
    const sparklineCacheKey = generateCacheKey('sparklines', {
      productIds: paginatedProductIds.sort((a, b) => a - b).join(','),
      storeIds: storeIdList.sort().join(','),
      date: twelveWeeksAgo.toISOString().split('T')[0]
    });
    let data = await getCached(sparklineCacheKey, 'sparklines');
    if (!data) {
      data = await timedQuery('sparklines', () =>
        context.entities.WeeklySalesSummary.findMany({
          where: {
            productId: { in: paginatedProductIds },
            storeId: { in: storeIdList },
            weekStart: { gte: twelveWeeksAgo }
          },
          select: {
            productId: true,
            weekStart: true,
            unitsSold: true
          },
          orderBy: { weekStart: 'asc' }
        }), { productIds: paginatedProductIds.length, stores: storeIdList.length }
      );
      setCached(sparklineCacheKey, data, 1800, 'sparklines').catch(() => {});
    }
    return data;
  })() : [];

  processSparklineData(sparklineData, filteredProductMetrics, loadAll);

  // Strain counts
  const { strainCounts, primaryStoreStrainCounts } = calculateStrainCounts(filteredProducts, primaryStore);

  // Location inventory counts
  const stockLevelCounts = locationCountsResult;
  const stockCountMap = new Map();
  stockLevelCounts.forEach(item => {
    stockCountMap.set(item.storeId, item._count.productId);
  });

  const locationInventoryCounts = stores.map(store => ({
    storeId: store.id,
    storeName: store.name,
    count: stockCountMap.get(store.id) || 0
  }));

  // Sales matrix, latest movement, brand-distributor mappings
  const [
    latestMovement,
    brandsWithDistributors,
    allDistributors
  ] = await Promise.all([
    context.entities.InventoryMovement.findFirst({
      where: { storeId: { in: storeIdList } },
      orderBy: { date: 'desc' },
      select: { date: true }
    }),
    (async () => {
      const brandsCacheKey = generateCacheKey('brands_distributors', {});
      let brands = await getCached(brandsCacheKey, 'brands_distributors');
      if (!brands) {
        brands = await timedQuery('brands_distributors', () =>
          context.entities.Brand.findMany({
            include: {
              distributors: {
                include: { distributor: true },
                orderBy: { isPrimary: 'desc' }
              }
            }
          }), {}
        );
        setCached(brandsCacheKey, brands, 3600, 'brands_distributors').catch(() => {});
      }
      return brands;
    })(),
    context.entities.Distributor.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' }
    })
  ]);

  // Build sales map for all filtered products (for sales matrix)
  const allFilteredSalesMap = new Map();
  let baseSalesMapForMatrix = null;
  if (cachedBaseSales) {
    baseSalesMapForMatrix = new Map();
    if (cachedBaseSales.salesMap) {
      Object.entries(cachedBaseSales.salesMap).forEach(([productId, sales]) => {
        baseSalesMapForMatrix.set(parseInt(productId), sales);
      });
    }
  } else {
    baseSalesMapForMatrix = salesMap || new Map();
  }

  allFilteredProductIds.forEach(productId => {
    if (baseSalesMapForMatrix.has(productId)) {
      allFilteredSalesMap.set(productId, baseSalesMapForMatrix.get(productId));
    }
  });

  // Top 20 products for sales matrix
  const topProductIds = Array.from(allFilteredSalesMap.entries())
    .sort((a, b) => b[1].totalSales - a[1].totalSales)
    .slice(0, 20)
    .map(([productId]) => productId);

  const topProducts = topProductIds.length > 0 ? await context.entities.ProductCatalog.findMany({
    where: { id: { in: topProductIds } },
    select: { id: true, name: true, brand: true, parentCategory: true }
  }) : [];

  const salesMatrix = topProducts.map(p => {
    const productSales = allFilteredSalesMap.get(p.id) || { totalSales: 0, locationSales: {} };
    const salesByLocation = {};
    stores.forEach(store => {
      salesByLocation[store.name] = productSales.locationSales[store.id] || 0;
    });
    return {
      productName: p.name,
      brand: p.brand,
      category: p.parentCategory,
      ...salesByLocation,
      total: productSales.totalSales
    };
  });

  const locationTotals = stores.map(store => ({
    storeName: store.name,
    productCount: stockCountMap.get(store.id) || 0
  }));

  const lastUpdate = latestMovement?.date || new Date();

  // Brand-distributor mapping
  const brandDistributorMap = buildBrandDistributorMap(brandsWithDistributors);
  filteredProductMetrics.forEach(product => {
    product.distributors = brandDistributorMap.get(product.brand) || [];
  });

  // Build filter options
  const filterOptions = buildFilterOptions(baseProducts, filters, includeHiddenCategories);

  // Calculate primary store category totals (if primary store exists) using database queries
  const primaryStoreCategoryTotals = { Uncategorized: 0 };
  filterOptions.categories.forEach(cat => {
    primaryStoreCategoryTotals[cat] = 0;
  });

  if (primaryStore) {
    const primaryStoreCategoryData = await context.entities.ProductCatalog.findMany({
      where: {
        ...productWhere,
        stockLevels: {
          some: {
            storeId: primaryStore.id,
            quantity: { gt: 0 }
          }
        }
      },
      select: { parentCategory: true }
    });
    primaryStoreCategoryData.forEach(p => {
      const cat = p.parentCategory || 'Uncategorized';
      primaryStoreCategoryTotals[cat] = (primaryStoreCategoryTotals[cat] || 0) + 1;
    });
  }

  // Calculate total category counts across all stores using database queries
  const totalCategoryTotals = { Uncategorized: 0 };
  filterOptions.categories.forEach(cat => {
    totalCategoryTotals[cat] = 0;
  });

  const totalCategoryData = await context.entities.ProductCatalog.findMany({
    where: {
      ...productWhere,
      stockLevels: {
        some: {
          storeId: { in: storeIdList },
          quantity: { gt: 0 }
        }
      }
    },
    select: { parentCategory: true }
  });

  totalCategoryData.forEach(p => {
    const cat = p.parentCategory || 'Uncategorized';
    totalCategoryTotals[cat] = (totalCategoryTotals[cat] || 0) + 1;
  });

  return {
    products: filteredProductMetrics,
    totalCount,
    hasMore,
    offset,
    limit,
    salesMatrix,
    locationTotals,
    stores: stores.map(s => ({ id: s.id, name: s.name, location: s.location })),
    primaryStore: primaryStore ? { id: primaryStore.id, name: primaryStore.name } : null,
    primaryStoreCategoryTotals: filterOptions.categories.length > 0 ? primaryStoreCategoryTotals : { Uncategorized: 0 },
    totalCategoryTotals: filterOptions.categories.length > 0 ? totalCategoryTotals : { Uncategorized: 0 },
    dateRange: { start: startDate.toISOString(), end: endDate.toISOString() },
    periodDays,
    lastUpdate: lastUpdate.toISOString(),
    strainCounts,
    primaryStoreStrainCounts,
    locationInventoryCounts,
    filterOptions
  };
};
