import { HttpError } from 'wasp/server'
import { calculateCompleteSummaryWeekRange } from './helpers.js'
import { EXCLUDED_CATEGORIES } from '../lib/constants.js'

// Lightweight query for out-of-stock products (products with sales but zero inventory)
export const getOutOfStockProducts = async ({
  storeIds = null,
  dateRange = null,
  includeHiddenCategories = false
}, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Get user's stores
  const stores = await context.entities.Store.findMany({
    where: {
      isActive: true,
      ...(storeIds && storeIds.length > 0 ? { id: { in: storeIds } } : {})
    },
    select: { id: true, name: true, isFavourite: true }
  });

  // If no specific stores selected, use favourites or all active stores
  let selectedStores = stores;
  if (!storeIds || storeIds.length === 0) {
    const favourites = stores.filter(s => s.isFavourite);
    selectedStores = favourites.length > 0 ? favourites : stores;
  }

  const storeIdList = selectedStores.map(s => s.id);
  if (storeIdList.length === 0) {
    return { products: [], count: 0 };
  }

  // Calculate date range
  const endDate = dateRange?.end ? new Date(dateRange.end) : new Date();
  const startDate = dateRange?.start ? new Date(dateRange.start) : new Date(endDate.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Only use weekly summaries for full weeks fully inside the selected range.
  const summaryWeekRange = calculateCompleteSummaryWeekRange(startDate, endDate);
  const currentWeekStart = summaryWeekRange.currentWeekStart;

  // Query both data sources in parallel:
  // 1. WeeklySalesSummary for complete weeks
  // 2. InventoryMovement for exact date range (catches current incomplete week)
  const [weeklySalesData, movementSalesData] = await Promise.all([
    // WeeklySalesSummary: use week-aligned boundaries, exclude current incomplete week
    summaryWeekRange.start ? context.entities.WeeklySalesSummary.findMany({
      where: {
        storeId: { in: storeIdList },
        weekStart: {
          gte: summaryWeekRange.start,
          lt: summaryWeekRange.endExclusive
        },
        unitsSold: { gt: 0 }
      },
      select: {
        productId: true,
        unitsSold: true,
        storeId: true,
        weekStart: true
      }
    }) : Promise.resolve([]),
    // InventoryMovement: exact date range for current/incomplete week data
    context.entities.InventoryMovement.findMany({
      where: {
        storeId: { in: storeIdList },
        type: 'sale',
        date: { gte: startDate, lte: endDate }
      },
      select: {
        productId: true,
        storeId: true,
        changeQty: true,
        date: true
      }
    })
  ]);

  // Build set of complete weeks from WeeklySalesSummary
  const completeWeeksSet = new Set();
  weeklySalesData.forEach(item => {
    const weekStart = item.weekStart instanceof Date ? item.weekStart : new Date(item.weekStart);
    completeWeeksSet.add(weekStart.getTime());
  });

  // Aggregate sales by product from both sources
  const productSalesMap = new Map();

  // Add WeeklySalesSummary data
  weeklySalesData.forEach(sale => {
    const existing = productSalesMap.get(sale.productId) || { totalSales: 0, locationSales: {} };
    existing.totalSales += sale.unitsSold;
    existing.locationSales[sale.storeId] = (existing.locationSales[sale.storeId] || 0) + sale.unitsSold;
    productSalesMap.set(sale.productId, existing);
  });

  // Add InventoryMovement data (only from weeks NOT already in WeeklySalesSummary to avoid double-counting)
  movementSalesData.forEach(movement => {
    const movementDate = new Date(movement.date);
    // Determine which week this movement belongs to (Monday of that week)
    const movementDay = movementDate.getDay();
    const movementWeekStart = new Date(movementDate);
    movementWeekStart.setDate(movementDate.getDate() - (movementDay === 0 ? 6 : movementDay - 1));
    movementWeekStart.setHours(0, 0, 0, 0);
    const movementWeekStartTime = movementWeekStart.getTime();

    // Only include if this week is NOT in the complete weeks set (to avoid double-counting)
    const isCurrentIncompleteWeek = movementWeekStartTime >= currentWeekStart.getTime();
    const isNotInCompleteWeeks = !completeWeeksSet.has(movementWeekStartTime);

    if (isCurrentIncompleteWeek || isNotInCompleteWeeks) {
      const existing = productSalesMap.get(movement.productId) || { totalSales: 0, locationSales: {} };
      const unitsSold = Math.abs(movement.changeQty);
      existing.totalSales += unitsSold;
      existing.locationSales[movement.storeId] = (existing.locationSales[movement.storeId] || 0) + unitsSold;
      productSalesMap.set(movement.productId, existing);
    }
  });

  const productIdsWithSales = Array.from(productSalesMap.keys());


  if (productIdsWithSales.length === 0) {
    return { products: [], count: 0 };
  }

  // Get these products with their current stock levels
  const products = await context.entities.ProductCatalog.findMany({
    where: {
      id: { in: productIdsWithSales },
      ...(includeHiddenCategories ? {} : {
        parentCategory: { notIn: EXCLUDED_CATEGORIES }
      })
    },
    include: {
      stockLevels: {
        where: { storeId: { in: storeIdList } },
        select: { storeId: true, quantity: true, store: { select: { id: true, name: true } } }
      },
      distributor: {
        select: { id: true, name: true }
      }
    }
  });

  // Filter to only products with zero inventory at ALL selected stores
  const outOfStockProducts = products.filter(product => {
    const totalInventory = product.stockLevels.reduce((sum, sl) => sum + sl.quantity, 0);
    return totalInventory === 0;
  });

  // Calculate period days for velocity
  const periodDays = Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000));
  const weeksInPeriod = periodDays / 7;

  const outOfStockProductIds = outOfStockProducts.map(p => p.id);

  // Fetch last sale dates and last PO dates for out-of-stock products in parallel
  const [recentSalesOOS, olderSalesOOS, purchaseOrdersOOS] = await Promise.all([
    // Recent sales from InventoryMovement (most accurate dates)
    outOfStockProductIds.length > 0 ? context.entities.InventoryMovement.findMany({
      where: {
        storeId: { in: storeIdList },
        productId: { in: outOfStockProductIds },
        type: 'sale'
      },
      select: { productId: true, date: true },
      orderBy: { date: 'desc' }
    }) : Promise.resolve([]),
    // Older sales from WeeklySalesSummary (fallback for products not in recent movements)
    outOfStockProductIds.length > 0 ? context.entities.WeeklySalesSummary.findMany({
      where: {
        storeId: { in: storeIdList },
        productId: { in: outOfStockProductIds },
        unitsSold: { gt: 0 }
      },
      select: { productId: true, weekStart: true },
      orderBy: { weekStart: 'desc' }
    }) : Promise.resolve([]),
    // Purchase orders
    outOfStockProductIds.length > 0 ? context.entities.InventoryMovement.findMany({
      where: {
        storeId: { in: storeIdList },
        productId: { in: outOfStockProductIds },
        type: 'purchase order'
      },
      select: { productId: true, date: true, changeQty: true },
      orderBy: { date: 'desc' }
    }) : Promise.resolve([])
  ]);

  // Build last sale map from recent movements first, then fill from weekly summaries
  const lastSaleMapOOS = new Map();
  recentSalesOOS.forEach(movement => {
    if (!lastSaleMapOOS.has(movement.productId)) {
      const saleDate = movement.date instanceof Date ? movement.date : new Date(movement.date);
      lastSaleMapOOS.set(movement.productId, saleDate);
    }
  });
  olderSalesOOS.forEach(summary => {
    if (!lastSaleMapOOS.has(summary.productId)) {
      const weekStartDate = summary.weekStart instanceof Date ? summary.weekStart : new Date(summary.weekStart);
      lastSaleMapOOS.set(summary.productId, weekStartDate);
    }
  });

  // Build last PO map
  const lastPOMapOOS = new Map();
  purchaseOrdersOOS.forEach(po => {
    if (!lastPOMapOOS.has(po.productId)) {
      lastPOMapOOS.set(po.productId, {
        date: po.date instanceof Date ? po.date : new Date(po.date),
        qty: Math.abs(po.changeQty)
      });
    }
  });

  // Build response with sales data
  const result = outOfStockProducts.map(product => {
    const sales = productSalesMap.get(product.id) || { totalSales: 0, locationSales: {} };
    const velocity = weeksInPeriod > 0 ? sales.totalSales / weeksInPeriod : 0;

    // Days since last sale
    const lastSaleDate = lastSaleMapOOS.get(product.id);
    const daysSinceLastSale = lastSaleDate ? Math.floor((endDate - lastSaleDate) / (24 * 60 * 60 * 1000)) : null;

    // Days since last purchase order
    const lastPOData = lastPOMapOOS.get(product.id);
    const lastPODate = lastPOData ? lastPOData.date : null;
    const lastPOQty = lastPOData ? lastPOData.qty : null;
    const daysSinceLastPO = lastPODate && !isNaN(lastPODate.getTime()) ? Math.floor((endDate - lastPODate) / (24 * 60 * 60 * 1000)) : null;

    return {
      id: product.id,
      gtin: product.gtin,
      name: product.name,
      brand: product.brand,
      parentCategory: product.parentCategory,
      subcategory: product.subcategory,
      strainType: product.strainType,
      format: product.format,
      unitCount: product.unitCount,
      unitSize: product.unitSize,
      status: product.status,
      retailPrice: product.retailPrice,
      wholesaleCost: product.wholesaleCost,
      margin: product.margin,
      caseSize: product.caseSize || 12,
      totalInventory: 0,
      locationInventory: product.stockLevels.map(sl => ({
        storeId: sl.storeId,
        storeName: sl.store.name,
        quantity: sl.quantity
      })),
      totalSales: sales.totalSales,
      locationSales: Object.entries(sales.locationSales).map(([storeId, units]) => ({
        storeId: parseInt(storeId),
        units
      })),
      velocity,
      weeksLeft: 0,
      daysSinceLastSale,
      daysSinceLastPO,
      lastPOQty,
      distributors: product.distributor ? [{ id: product.distributor.id, name: product.distributor.name }] : []
    };
  });

  return {
    products: result,
    count: result.length
  };
};
