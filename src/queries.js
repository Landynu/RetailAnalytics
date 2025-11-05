import { HttpError } from 'wasp/server'
import { getCached, getCachedBatch, setCached, generateCacheKey, timedQuery } from './cache.js'

// Helper function to filter products in-memory
function filterProductsInMemory(products, filters) {
  return products.filter(product => {
    if (filters.brands && filters.brands.length > 0) {
      if (!filters.brands.includes(product.brand)) return false;
    }
    if (filters.categories && filters.categories.length > 0) {
      if (!filters.categories.includes(product.parentCategory)) return false;
    }
    if (filters.subcategories && filters.subcategories.length > 0) {
      if (!filters.subcategories.includes(product.subcategory)) return false;
    }
    if (filters.units && filters.units.length > 0) {
      if (!filters.units.includes(product.unitCount)) return false;
    }
    if (filters.sizes && filters.sizes.length > 0) {
      if (!filters.sizes.includes(product.unitSize)) return false;
    }
    return true;
  });
}

// Helper function to calculate week boundaries (Monday-Sunday) for a date range
function calculateWeekBoundaries(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Get Monday of the week containing startDate
  const startDay = start.getDay();
  const startMonday = new Date(start);
  startMonday.setDate(start.getDate() - (startDay === 0 ? 6 : startDay - 1));
  startMonday.setHours(0, 0, 0, 0);
  
  // Get Sunday of the week containing endDate
  const endDay = end.getDay();
  const endSunday = new Date(end);
  endSunday.setDate(end.getDate() + (endDay === 0 ? 0 : 7 - endDay));
  endSunday.setHours(23, 59, 59, 999);
  
  return { start: startMonday, end: endSunday };
}

export const getSalesTrends = async ({ storeId }, context) => {
  if (!context.user) { throw new HttpError(401) }

  try {
    // Get stock levels with products for this store
    // Exclude description and imageUrl to avoid corrupt data issues
    const stockLevels = await context.entities.StockLevel.findMany({
      where: { 
        storeId: parseInt(storeId),
        quantity: { gt: 0 }
      },
      include: { 
        product: {
          select: {
            id: true,
            name: true,
            gtin: true,
            brand: true,
            category: true,
            retailPrice: true,
            wholesaleCost: true,
            format: true
          }
        },
        snapshot: {
          select: {
            id: true,
            uploadedAt: true
          }
        }
      },
      orderBy: { lastUpdated: 'desc' }
    });

    // Group by snapshot if available, otherwise group all together
    const snapshotGroups = new Map();
    
    stockLevels.forEach(stock => {
      const snapshotId = stock.snapshotId || 'current';
      if (!snapshotGroups.has(snapshotId)) {
        snapshotGroups.set(snapshotId, {
          inventoryId: snapshotId,
          snapshotDate: stock.snapshot?.uploadedAt || stock.lastUpdated,
          products: []
        });
      }
      
      snapshotGroups.get(snapshotId).products.push({
        name: stock.product.name || 'Unknown Product',
        gtin: stock.product.gtin || 'N/A',
        price: stock.product.retailPrice || 0,
        quantity: stock.quantity,
        brand: stock.product.brand || 'N/A',
        category: stock.product.category || 'Uncategorized'
      });
    });

    // Convert to array and sort by date
    const salesTrends = Array.from(snapshotGroups.values())
      .sort((a, b) => new Date(b.snapshotDate) - new Date(a.snapshotDate));

    return salesTrends;
  } catch (error) {
    console.error('Error in getSalesTrends:', error);
    // Return empty array on error to prevent complete failure
    return [];
  }
}

export const getUserStores = async (args, context) => {
  if (!context.user) { throw new HttpError(401) }; // If user needs to be authenticated.

  return context.entities.Store.findMany({
    where: { userId: context.user.id }
  });
}

export const getStoreById = async ({ storeId }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const store = await context.entities.Store.findUnique({
    where: { id: parseInt(storeId) }
  });

  if (!store || store.userId !== context.user.id) { 
    throw new HttpError(404) 
  }

  return store;
}

// New PRD Queries

export const getInventoryDashboard = async ({ storeId, dateRange }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const store = await context.entities.Store.findUnique({
    where: { id: parseInt(storeId) }
  });

  if (!store || store.userId !== context.user.id) {
    throw new HttpError(404);
  }

  // Get stock levels with products
  const stockLevels = await context.entities.StockLevel.findMany({
    where: { storeId: parseInt(storeId) },
    include: { product: true }
  });

  // Calculate totals
  const totalSKUs = stockLevels.length;
  const totalValue = stockLevels.reduce((sum, stock) => {
    return sum + (stock.quantity * (stock.product.retailPrice || 0));
  }, 0);

  // Category breakdown
  const categoryBreakdown = {};
  stockLevels.forEach(stock => {
    const category = stock.product.category || 'Uncategorized';
    if (!categoryBreakdown[category]) {
      categoryBreakdown[category] = { count: 0, value: 0 };
    }
    categoryBreakdown[category].count += stock.quantity;
    categoryBreakdown[category].value += stock.quantity * (stock.product.retailPrice || 0);
  });

  // Low stock alerts (quantity < 5)
  const lowStock = stockLevels.filter(stock => stock.quantity < 5);

  // Recent movements (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const recentMovements = await context.entities.InventoryMovement.findMany({
    where: {
      storeId: parseInt(storeId),
      date: { gte: sevenDaysAgo }
    },
    include: { product: true },
    orderBy: { date: 'desc' },
    take: 10
  });

  return {
    totalSKUs,
    totalValue,
    categoryBreakdown: Object.keys(categoryBreakdown).map(category => ({
      category,
      count: categoryBreakdown[category].count,
      value: categoryBreakdown[category].value
    })),
    lowStock: lowStock.map(stock => ({
      product: stock.product,
      quantity: stock.quantity
    })),
    recentMovements: recentMovements.map(movement => ({
      product: movement.product,
      type: movement.type,
      date: movement.date.toISOString(),
      change: movement.changeQty
    }))
  };
};

export const getTopProductsByCategory = async ({ storeId, limit = 10 }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const stockLevels = await context.entities.StockLevel.findMany({
    where: { storeId: parseInt(storeId) },
    include: { product: true }
  });

  // Group by category and get top products
  const categoryProducts = {};
  stockLevels.forEach(stock => {
    const category = stock.product.category || 'Uncategorized';
    if (!categoryProducts[category]) {
      categoryProducts[category] = [];
    }
    categoryProducts[category].push({
      product: stock.product,
      quantity: stock.quantity,
      value: stock.quantity * (stock.product.retailPrice || 0)
    });
  });

  // Sort and limit for each category
  const result = [];
  Object.keys(categoryProducts).forEach(category => {
    const sortedProducts = categoryProducts[category]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, limit);
    
    result.push({
      category,
      products: sortedProducts
    });
  });

  return result;
};

export const getInventoryMovements = async ({ storeId, dateRange, filters = {} }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const whereClause = {
    storeId: parseInt(storeId)
  };

  if (dateRange?.start && dateRange?.end) {
    whereClause.date = {
      gte: new Date(dateRange.start),
      lte: new Date(dateRange.end)
    };
  }

  if (filters.type) {
    whereClause.type = filters.type;
  }

  if (filters.employee) {
    whereClause.employee = { contains: filters.employee };
  }

  const movements = await context.entities.InventoryMovement.findMany({
    where: whereClause,
    include: { product: true },
    orderBy: { date: 'desc' }
  });

  return movements.map(movement => ({
    id: movement.id,
    product: movement.product,
    date: movement.date.toISOString(),
    type: movement.type,
    employee: movement.employee,
    openingQty: movement.openingQty,
    changeQty: movement.changeQty,
    closingQty: movement.closingQty,
    notes: movement.notes
  }));
};

export const getCategoryBreakdown = async ({ storeId }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const stockLevels = await context.entities.StockLevel.findMany({
    where: { storeId: parseInt(storeId) },
    include: { product: true }
  });

  const categoryData = {};
  stockLevels.forEach(stock => {
    const category = stock.product.category || 'Uncategorized';
    if (!categoryData[category]) {
      categoryData[category] = {
        count: 0,
        value: 0,
        products: 0
      };
    }
    categoryData[category].count += stock.quantity;
    categoryData[category].value += stock.quantity * (stock.product.retailPrice || 0);
    categoryData[category].products += 1;
  });

  return Object.keys(categoryData).map(category => ({
    category,
    count: categoryData[category].count,
    value: categoryData[category].value,
    products: categoryData[category].products
  }));
};

export const getMenuData = async ({ storeId }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const stockLevels = await context.entities.StockLevel.findMany({
    where: { 
      storeId: parseInt(storeId),
      quantity: { gt: 0 }
    },
    include: { product: true }
  });

  // Group by category
  const menuCategories = {};
  stockLevels.forEach(stock => {
    const category = stock.product.category || 'Uncategorized';
    if (!menuCategories[category]) {
      menuCategories[category] = [];
    }
    menuCategories[category].push({
      id: stock.product.id,
      name: stock.product.name,
      brand: stock.product.brand,
      price: stock.product.retailPrice || 0,
      quantity: stock.quantity,
      description: stock.product.description,
      imageUrl: stock.product.imageUrl
    });
  });

  // Sort products within each category by name
  Object.keys(menuCategories).forEach(category => {
    menuCategories[category].sort((a, b) => a.name.localeCompare(b.name));
  });

  return {
    categories: Object.keys(menuCategories).map(category => ({
      category,
      products: menuCategories[category]
    })),
    totalProducts: stockLevels.length
  };
};

// Analytics Queries

export const getStoreAnalytics = async ({ storeId, excludeCategories = ['Accessories', 'Accessory'] }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const store = await context.entities.Store.findUnique({
    where: { id: parseInt(storeId) }
  });

  if (!store || store.userId !== context.user.id) {
    throw new HttpError(404);
  }

  // Build where clause with category exclusions
  const whereClause = {
    storeId: parseInt(storeId)
  };

  // Add category filter if provided
  if (excludeCategories && excludeCategories.length > 0) {
    whereClause.product = {
      parentCategory: {
        notIn: excludeCategories
      }
    };
  }

  // Get all stock levels with products
  const stockLevels = await context.entities.StockLevel.findMany({
    where: whereClause,
    include: { 
      product: {
        select: {
          id: true,
          name: true,
          gtin: true,
          brand: true,
          category: true,
          parentCategory: true,
          subcategory: true,
          strainType: true,
          retailPrice: true,
          format: true
        }
      }
    }
  });

  // Strain type breakdown - only count flower products
  const strainBreakdown = {
    Sativa: 0,
    Hybrid: 0,
    Indica: 0
  };
  
  stockLevels.forEach(stock => {
    const strain = stock.product.strainType;
    // Only count actual strain types (Sativa, Hybrid, Indica)
    if (strain && strain !== 'N/A' && strainBreakdown[strain] !== undefined) {
      strainBreakdown[strain] += stock.quantity;
    }
  });

  // Top brands by inventory value
  const brandStats = {};
  stockLevels.forEach(stock => {
    const brand = stock.product.brand || 'Unknown';
    if (!brandStats[brand]) {
      brandStats[brand] = { value: 0, quantity: 0, products: 0 };
    }
    brandStats[brand].value += stock.quantity * (stock.product.retailPrice || 0);
    brandStats[brand].quantity += stock.quantity;
    brandStats[brand].products += 1;
  });

  const topBrands = Object.keys(brandStats)
    .map(brand => ({
      brand,
      value: brandStats[brand].value,
      quantity: brandStats[brand].quantity,
      products: brandStats[brand].products
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Get sales data from inventory movements (type='sale' only)
  const movementWhere = { 
    storeId: parseInt(storeId),
    type: 'sale' // Only actual sales, not refunds/transfers/etc
  };

  // Apply category filter to movements as well
  if (excludeCategories && excludeCategories.length > 0) {
    movementWhere.product = {
      parentCategory: {
        notIn: excludeCategories
      }
    };
  }

  const movements = await context.entities.InventoryMovement.findMany({
    where: movementWhere,
    include: {
      product: {
        select: {
          id: true,
          name: true,
          gtin: true,
          brand: true,
          parentCategory: true,
          retailPrice: true,
          strainType: true
        }
      }
    }
  });

  // Top 10 products by sales (both units and revenue)
  const productSales = {};
  movements.forEach(movement => {
    const productId = movement.product.id;
    if (!productSales[productId]) {
      productSales[productId] = {
        product: movement.product,
        unitsSold: 0,
        revenue: 0
      };
    }
    const unitsSold = Math.abs(movement.changeQty);
    productSales[productId].unitsSold += unitsSold;
    productSales[productId].revenue += unitsSold * (movement.product.retailPrice || 0);
  });

  const topProductsByRevenue = Object.values(productSales)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map(item => ({
      name: item.product.name,
      gtin: item.product.gtin,
      brand: item.product.brand,
      unitsSold: item.unitsSold,
      revenue: item.revenue,
      strainType: item.product.strainType
    }));

  const topProductsByUnits = Object.values(productSales)
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, 10)
    .map(item => ({
      name: item.product.name,
      gtin: item.product.gtin,
      brand: item.product.brand,
      unitsSold: item.unitsSold,
      revenue: item.revenue,
      strainType: item.product.strainType
    }));

  // Category performance
  const categoryStats = {};
  stockLevels.forEach(stock => {
    const category = stock.product.parentCategory || 'Uncategorized';
    if (!categoryStats[category]) {
      categoryStats[category] = { value: 0, quantity: 0, products: 0 };
    }
    categoryStats[category].value += stock.quantity * (stock.product.retailPrice || 0);
    categoryStats[category].quantity += stock.quantity;
    categoryStats[category].products += 1;
  });

  const categoryPerformance = Object.keys(categoryStats)
    .map(category => ({
      category,
      value: categoryStats[category].value,
      quantity: categoryStats[category].quantity,
      products: categoryStats[category].products
    }))
    .sort((a, b) => b.value - a.value);

  // Get all available categories for filter
  const allCategories = [...new Set(stockLevels.map(s => s.product.parentCategory).filter(Boolean))];

  return {
    strainBreakdown,
    topBrands,
    topProductsByRevenue,
    topProductsByUnits,
    categoryPerformance,
    totalProducts: stockLevels.length,
    totalValue: stockLevels.reduce((sum, stock) => sum + (stock.quantity * (stock.product.retailPrice || 0)), 0),
    availableCategories: allCategories,
    hasMovementData: movements.length > 0
  };
};

export const getGlobalAnalytics = async (args, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Get all user's active stores only
  const stores = await context.entities.Store.findMany({
    where: { 
      userId: context.user.id,
      isActive: true  // Only include active stores
    },
    include: {
      stockLevels: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              gtin: true,
              brand: true,
              category: true,
              parentCategory: true,
              strainType: true,
              retailPrice: true
            }
          }
        }
      }
    }
  });

  // Aggregate data across all stores
  const globalStats = {
    totalStores: stores.length,
    totalProducts: 0,
    totalValue: 0,
    strainBreakdown: { Sativa: 0, Hybrid: 0, Indica: 0, 'N/A': 0 },
    storePerformance: []
  };

  stores.forEach(store => {
    let storeValue = 0;
    let storeProducts = 0;

    store.stockLevels.forEach(stock => {
      storeProducts += 1;
      const value = stock.quantity * (stock.product.retailPrice || 0);
      storeValue += value;
      globalStats.totalValue += value;
      
      const strain = stock.product.strainType || 'N/A';
      if (globalStats.strainBreakdown[strain] !== undefined) {
        globalStats.strainBreakdown[strain] += stock.quantity;
      }
    });

    globalStats.totalProducts += storeProducts;
    globalStats.storePerformance.push({
      storeId: store.id,
      name: store.name,
      location: store.location,
      products: storeProducts,
      value: storeValue
    });
  });

  globalStats.storePerformance.sort((a, b) => b.value - a.value);

  return globalStats;
};

export const getGlobalSalesAnalytics = async ({ 
  storeIds = null,
  filters = {}
}, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Build where clause for summary query
  const summaryWhere = {};
  
  // Store filter
  if (storeIds && storeIds.length > 0) {
    summaryWhere.storeId = { in: storeIds.map(id => parseInt(id)) };
  }

  // Date range filter
  if (filters.dateRange) {
    summaryWhere.weekStart = {
      gte: new Date(filters.dateRange.start),
      lte: new Date(filters.dateRange.end)
    };
    console.log('📅 Date filter applied:', {
      start: filters.dateRange.start,
      end: filters.dateRange.end,
      whereClause: summaryWhere.weekStart
    });
  } else {
    console.warn('⚠️ No date range filter - loading all data!');
  }

  // Build product filter for summary query
  const productFilter = {};
  if (filters.excludeCategories && filters.excludeCategories.length > 0) {
    productFilter.parentCategory = { notIn: filters.excludeCategories };
  }
  if (filters.categories && filters.categories.length > 0) {
    productFilter.parentCategory = { in: filters.categories };
  }
  if (filters.subcategories && filters.subcategories.length > 0) {
    productFilter.subcategory = { in: filters.subcategories };
  }
  if (filters.brands && filters.brands.length > 0) {
    productFilter.brand = { in: filters.brands };
  }
  if (filters.strainTypes && filters.strainTypes.length > 0) {
    productFilter.strainType = { in: filters.strainTypes };
  }

  // Add product filter if any filters exist
  if (Object.keys(productFilter).length > 0) {
    summaryWhere.product = productFilter;
  }

  // Single query to fetch all weekly summaries
  const weeklySummaries = await context.entities.WeeklySalesSummary.findMany({
    where: summaryWhere,
    include: {
      product: {
        select: {
          id: true,
          name: true,
          gtin: true,
          brand: true,
          parentCategory: true,
          subcategory: true,
          strainType: true,
          retailPrice: true
        }
      },
      store: {
        select: {
          id: true,
          name: true,
          location: true
        }
      }
    },
    orderBy: { weekStart: 'desc' }
  });

  console.log('📊 Query results:', {
    summariesFetched: weeklySummaries.length,
    dateRange: filters.dateRange ? `${filters.dateRange.start} to ${filters.dateRange.end}` : 'ALL TIME',
    storeFilter: storeIds ? `${storeIds.length} stores` : 'all stores'
  });

  // Aggregate data from weekly summaries
  let grossSales = 0;
  let grossUnits = 0;
  let refundAmount = 0;
  let refundUnits = 0;
  const productSales = {};
  const brandSales = {};
  const categorySales = {};
  const storeSales = {};
  const weeklySalesData = {}; // Will convert to daily for trends
  const strainSales = { Sativa: 0, Hybrid: 0, Indica: 0 };

  // Process weekly summaries
  weeklySummaries.forEach(summary => {
    // Aggregate totals
    grossSales += summary.grossSales || 0;
    grossUnits += summary.unitsSold || 0;
    refundAmount += summary.refunds || 0;
    refundUnits += summary.refundUnits || 0;

    // Product sales
    const productId = summary.product.id;
    if (!productSales[productId]) {
      productSales[productId] = {
        product: summary.product,
        unitsSold: 0,
        revenue: 0,
        refunds: 0,
        lastSale: summary.weekStart
      };
    }
    productSales[productId].unitsSold += summary.unitsSold || 0;
    productSales[productId].revenue += summary.grossSales || 0;
    productSales[productId].refunds += summary.refunds || 0;
    if (summary.weekStart > productSales[productId].lastSale) {
      productSales[productId].lastSale = summary.weekStart;
    }

    // Brand sales
    const brand = summary.product.brand || 'Unknown';
    if (!brandSales[brand]) {
      brandSales[brand] = { revenue: 0, unitsSold: 0 };
    }
    brandSales[brand].revenue += summary.grossSales || 0;
    brandSales[brand].unitsSold += summary.unitsSold || 0;

    // Category sales
    const category = summary.product.parentCategory || 'Uncategorized';
    if (!categorySales[category]) {
      categorySales[category] = { revenue: 0, unitsSold: 0 };
    }
    categorySales[category].revenue += summary.grossSales || 0;
    categorySales[category].unitsSold += summary.unitsSold || 0;

    // Store sales
    if (summary.store) {
      const storeId = summary.store.id;
      if (!storeSales[storeId]) {
        storeSales[storeId] = {
          storeId,
          name: summary.store.name,
          location: summary.store.location,
          revenue: 0,
          unitsSold: 0
        };
      }
      storeSales[storeId].revenue += summary.grossSales || 0;
      storeSales[storeId].unitsSold += summary.unitsSold || 0;
    }

    // Weekly sales for trends (will be used as daily approximation)
    const weekKey = summary.weekStart.toISOString().split('T')[0];
    if (!weeklySalesData[weekKey]) {
      weeklySalesData[weekKey] = { 
        date: weekKey,
        weekStart: summary.weekStart,
        grossSales: 0, 
        refunds: 0, 
        netRevenue: 0, 
        unitsSold: 0,
        byStore: {}
      };
    }
    weeklySalesData[weekKey].grossSales += summary.grossSales || 0;
    weeklySalesData[weekKey].refunds += summary.refunds || 0;
    weeklySalesData[weekKey].netRevenue += summary.netRevenue || 0;
    weeklySalesData[weekKey].unitsSold += summary.unitsSold || 0;

    // Track per-store weekly sales
    if (summary.store) {
      const storeName = summary.store.name.substring(0, 12);
      if (!weeklySalesData[weekKey].byStore[storeName]) {
        weeklySalesData[weekKey].byStore[storeName] = { revenue: 0, units: 0 };
      }
      weeklySalesData[weekKey].byStore[storeName].revenue += summary.grossSales || 0;
      weeklySalesData[weekKey].byStore[storeName].units += summary.unitsSold || 0;
    }

    // Strain sales
    const strain = summary.product.strainType;
    if (strain && strainSales[strain] !== undefined) {
      strainSales[strain] += summary.unitsSold || 0;
    }
  });

  const netRevenue = grossSales - refundAmount;
  const netUnits = grossUnits - refundUnits;

  // Prepare per-store breakdowns for products, categories, and brands
  const productsByStore = {};
  const categoriesByStore = {};
  const brandsByStore = {};

  weeklySummaries.forEach(summary => {
    if (!summary.store) return;
    
    const storeName = summary.store.name.substring(0, 12);

    // Products by store
    const productKey = `${summary.product.id}_${storeName}`;
    if (!productsByStore[productKey]) {
      productsByStore[productKey] = {
        productId: summary.product.id,
        productName: summary.product.name,
        storeName,
        revenue: 0,
        units: 0
      };
    }
    productsByStore[productKey].revenue += summary.grossSales || 0;
    productsByStore[productKey].units += summary.unitsSold || 0;

    // Categories by store
    const category = summary.product.parentCategory || 'Uncategorized';
    const catKey = `${category}_${storeName}`;
    if (!categoriesByStore[catKey]) {
      categoriesByStore[catKey] = {
        category,
        storeName,
        revenue: 0,
        units: 0
      };
    }
    categoriesByStore[catKey].revenue += summary.grossSales || 0;
    categoriesByStore[catKey].units += summary.unitsSold || 0;

    // Brands by store
    const brand = summary.product.brand || 'Unknown';
    const brandKey = `${brand}_${storeName}`;
    if (!brandsByStore[brandKey]) {
      brandsByStore[brandKey] = {
        brand,
        storeName,
        revenue: 0,
        units: 0
      };
    }
    brandsByStore[brandKey].revenue += summary.grossSales || 0;
    brandsByStore[brandKey].units += summary.unitsSold || 0;
  });

  // Top products by net revenue
  const topProductsByRevenue = Object.values(productSales)
    .map(item => ({
      ...item,
      netRevenue: item.revenue - item.refunds
    }))
    .sort((a, b) => b.netRevenue - a.netRevenue)
    .slice(0, 10)
    .map(item => ({
      name: item.product.name,
      gtin: item.product.gtin,
      brand: item.product.brand,
      unitsSold: item.unitsSold,
      revenue: item.netRevenue,
      strainType: item.product.strainType,
      lastSale: item.lastSale.toISOString(),
      byStore: Object.values(productsByStore)
        .filter(p => p.productId === item.product.id)
        .reduce((acc, p) => {
          acc[p.storeName] = { revenue: p.revenue, units: p.units };
          return acc;
        }, {})
    }));

  const topProductsByUnits = Object.values(productSales)
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, 10)
    .map(item => ({
      name: item.product.name,
      gtin: item.product.gtin,
      brand: item.product.brand,
      unitsSold: item.unitsSold,
      revenue: item.revenue - item.refunds,
      strainType: item.product.strainType,
      lastSale: item.lastSale.toISOString()
    }));

  // Top brands with per-store breakdown
  const topBrands = Object.keys(brandSales)
    .map(brand => ({
      brand,
      revenue: brandSales[brand].revenue,
      unitsSold: brandSales[brand].unitsSold,
      byStore: Object.values(brandsByStore)
        .filter(b => b.brand === brand)
        .reduce((acc, b) => {
          acc[b.storeName] = { revenue: b.revenue, units: b.units };
          return acc;
        }, {})
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Category performance with per-store breakdown
  const categoryPerformance = Object.keys(categorySales)
    .map(category => ({
      category,
      revenue: categorySales[category].revenue,
      unitsSold: categorySales[category].unitsSold,
      byStore: Object.values(categoriesByStore)
        .filter(c => c.category === category)
        .reduce((acc, c) => {
          acc[c.storeName] = { revenue: c.revenue, units: c.units };
          return acc;
        }, {})
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Store performance
  const storePerformance = Object.values(storeSales)
    .sort((a, b) => b.revenue - a.revenue);

  // Sales trends (weekly data sorted by date)
  const salesTrends = Object.values(weeklySalesData)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // Calculate average transaction value (net)
  const avgTransactionValue = netUnits > 0 ? netRevenue / netUnits : 0;

  // Movement type summaries (from summaries)
  const movementSummary = {
    totalSales: weeklySummaries.reduce((sum, s) => sum + (s.saleTransactions || 0), 0),
    totalRefunds: weeklySummaries.reduce((sum, s) => sum + (s.refundTransactions || 0), 0),
    totalTransfers: 0, // Not tracked in summaries
    totalPurchases: 0, // Not tracked in summaries
    totalAudits: 0 // Not tracked in summaries
  };

  const result = {
    grossSales,
    refunds: refundAmount,
    netRevenue,
    totalRevenue: netRevenue, // For backward compatibility
    totalUnitsSold: netUnits,
    grossUnits,
    refundUnits,
    refundRate: grossSales > 0 ? (refundAmount / grossSales) * 100 : 0,
    avgTransactionValue,
    topProductsByRevenue,
    topProductsByUnits,
    topBrands,
    categoryPerformance,
    storePerformance,
    salesTrends,
    strainSales,
    movementSummary,
    totalTransactions: movementSummary.totalSales,
    hasData: weeklySummaries.length > 0
  };

  console.log('💰 Sales analytics summary:', {
    totalRevenue: result.totalRevenue,
    unitsSold: result.totalUnitsSold,
    avgTransaction: result.avgTransactionValue,
    topProducts: result.topProductsByRevenue.length,
    hasData: result.hasData
  });

  return result;
};

export const getDailySalesAnalytics = async ({
  storeIds = null,
  filters = {}
}, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Default to last 30 days for performance
  const endDate = filters.dateRange?.end ? new Date(filters.dateRange.end) : new Date();
  const startDate = filters.dateRange?.start ? new Date(filters.dateRange.start) : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

  console.log('📅 Daily sales query:', {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    storeFilter: storeIds ? `${storeIds.length} stores` : 'all stores'
  });

  // Build where clause for movements
  const movementWhere = {
    type: 'sale', // Only actual sales
    date: {
      gte: startDate,
      lte: endDate
    }
  };

  // Store filter
  if (storeIds && storeIds.length > 0) {
    movementWhere.storeId = { in: storeIds.map(id => parseInt(id)) };
  }

  // Build product filter
  const productFilter = {};
  if (filters.excludeCategories && filters.excludeCategories.length > 0) {
    productFilter.parentCategory = { notIn: filters.excludeCategories };
  }
  if (filters.categories && filters.categories.length > 0) {
    productFilter.parentCategory = { in: filters.categories };
  }
  if (filters.subcategories && filters.subcategories.length > 0) {
    productFilter.subcategory = { in: filters.subcategories };
  }
  if (filters.brands && filters.brands.length > 0) {
    productFilter.brand = { in: filters.brands };
  }
  if (filters.strainTypes && filters.strainTypes.length > 0) {
    productFilter.strainType = { in: filters.strainTypes };
  }

  // Add product filter if any filters exist
  if (Object.keys(productFilter).length > 0) {
    movementWhere.product = productFilter;
  }

  // Fetch daily movements
  const movements = await context.entities.InventoryMovement.findMany({
    where: movementWhere,
    include: {
      product: {
        select: {
          id: true,
          name: true,
          gtin: true,
          brand: true,
          parentCategory: true,
          subcategory: true,
          strainType: true,
          retailPrice: true
        }
      },
      store: {
        select: {
          id: true,
          name: true,
          location: true
        }
      }
    },
    orderBy: { date: 'asc' }
  });

  console.log('📊 Daily movements fetched:', movements.length);

  // Aggregate data by day
  let grossSales = 0;
  let grossUnits = 0;
  const productSales = {};
  const brandSales = {};
  const categorySales = {};
  const storeSales = {};
  const dailySalesData = {}; // Group by day
  const strainSales = { Sativa: 0, Hybrid: 0, Indica: 0 };

  movements.forEach(movement => {
    const unitsSold = Math.abs(movement.changeQty);
    const revenue = unitsSold * (movement.product.retailPrice || 0);
    
    // Totals
    grossSales += revenue;
    grossUnits += unitsSold;

    // Product sales
    const productId = movement.product.id;
    if (!productSales[productId]) {
      productSales[productId] = {
        product: movement.product,
        unitsSold: 0,
        revenue: 0,
        lastSale: movement.date
      };
    }
    productSales[productId].unitsSold += unitsSold;
    productSales[productId].revenue += revenue;
    if (movement.date > productSales[productId].lastSale) {
      productSales[productId].lastSale = movement.date;
    }

    // Brand sales
    const brand = movement.product.brand || 'Unknown';
    if (!brandSales[brand]) {
      brandSales[brand] = { revenue: 0, unitsSold: 0 };
    }
    brandSales[brand].revenue += revenue;
    brandSales[brand].unitsSold += unitsSold;

    // Category sales
    const category = movement.product.parentCategory || 'Uncategorized';
    if (!categorySales[category]) {
      categorySales[category] = { revenue: 0, unitsSold: 0 };
    }
    categorySales[category].revenue += revenue;
    categorySales[category].unitsSold += unitsSold;

    // Store sales
    if (movement.store) {
      const storeId = movement.store.id;
      if (!storeSales[storeId]) {
        storeSales[storeId] = {
          storeId,
          name: movement.store.name,
          location: movement.store.location,
          revenue: 0,
          unitsSold: 0
        };
      }
      storeSales[storeId].revenue += revenue;
      storeSales[storeId].unitsSold += unitsSold;
    }

    // Daily sales for trends
    const dateKey = movement.date.toISOString().split('T')[0];
    if (!dailySalesData[dateKey]) {
      dailySalesData[dateKey] = {
        date: dateKey,
        grossSales: 0,
        refunds: 0,
        netRevenue: 0,
        unitsSold: 0,
        byStore: {}
      };
    }
    dailySalesData[dateKey].grossSales += revenue;
    dailySalesData[dateKey].netRevenue += revenue;
    dailySalesData[dateKey].unitsSold += unitsSold;

    // Track per-store daily sales
    if (movement.store) {
      const storeName = movement.store.name.substring(0, 12);
      if (!dailySalesData[dateKey].byStore[storeName]) {
        dailySalesData[dateKey].byStore[storeName] = { revenue: 0, units: 0 };
      }
      dailySalesData[dateKey].byStore[storeName].revenue += revenue;
      dailySalesData[dateKey].byStore[storeName].units += unitsSold;
    }

    // Strain sales
    const strain = movement.product.strainType;
    if (strain && strainSales[strain] !== undefined) {
      strainSales[strain] += unitsSold;
    }
  });

  // Prepare per-store breakdowns for products, categories, and brands
  const productsByStore = {};
  const categoriesByStore = {};
  const brandsByStore = {};

  movements.forEach(movement => {
    if (!movement.store) return;
    
    const storeName = movement.store.name.substring(0, 12);
    const unitsSold = Math.abs(movement.changeQty);
    const revenue = unitsSold * (movement.product.retailPrice || 0);

    // Products by store
    const productKey = `${movement.product.id}_${storeName}`;
    if (!productsByStore[productKey]) {
      productsByStore[productKey] = {
        productId: movement.product.id,
        productName: movement.product.name,
        storeName,
        revenue: 0,
        units: 0
      };
    }
    productsByStore[productKey].revenue += revenue;
    productsByStore[productKey].units += unitsSold;

    // Categories by store
    const category = movement.product.parentCategory || 'Uncategorized';
    const catKey = `${category}_${storeName}`;
    if (!categoriesByStore[catKey]) {
      categoriesByStore[catKey] = {
        category,
        storeName,
        revenue: 0,
        units: 0
      };
    }
    categoriesByStore[catKey].revenue += revenue;
    categoriesByStore[catKey].units += unitsSold;

    // Brands by store
    const brand = movement.product.brand || 'Unknown';
    const brandKey = `${brand}_${storeName}`;
    if (!brandsByStore[brandKey]) {
      brandsByStore[brandKey] = {
        brand,
        storeName,
        revenue: 0,
        units: 0
      };
    }
    brandsByStore[brandKey].revenue += revenue;
    brandsByStore[brandKey].units += unitsSold;
  });

  // Top products by revenue
  const topProductsByRevenue = Object.values(productSales)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map(item => ({
      name: item.product.name,
      gtin: item.product.gtin,
      brand: item.product.brand,
      unitsSold: item.unitsSold,
      revenue: item.revenue,
      strainType: item.product.strainType,
      lastSale: item.lastSale.toISOString(),
      byStore: Object.values(productsByStore)
        .filter(p => p.productId === item.product.id)
        .reduce((acc, p) => {
          acc[p.storeName] = { revenue: p.revenue, units: p.units };
          return acc;
        }, {})
    }));

  const topProductsByUnits = Object.values(productSales)
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, 10)
    .map(item => ({
      name: item.product.name,
      gtin: item.product.gtin,
      brand: item.product.brand,
      unitsSold: item.unitsSold,
      revenue: item.revenue,
      strainType: item.product.strainType,
      lastSale: item.lastSale.toISOString()
    }));

  // Top brands with per-store breakdown
  const topBrands = Object.keys(brandSales)
    .map(brand => ({
      brand,
      revenue: brandSales[brand].revenue,
      unitsSold: brandSales[brand].unitsSold,
      byStore: Object.values(brandsByStore)
        .filter(b => b.brand === brand)
        .reduce((acc, b) => {
          acc[b.storeName] = { revenue: b.revenue, units: b.units };
          return acc;
        }, {})
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Category performance with per-store breakdown
  const categoryPerformance = Object.keys(categorySales)
    .map(category => ({
      category,
      revenue: categorySales[category].revenue,
      unitsSold: categorySales[category].unitsSold,
      byStore: Object.values(categoriesByStore)
        .filter(c => c.category === category)
        .reduce((acc, c) => {
          acc[c.storeName] = { revenue: c.revenue, units: c.units };
          return acc;
        }, {})
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Store performance
  const storePerformance = Object.values(storeSales)
    .sort((a, b) => b.revenue - a.revenue);

  // Sales trends (daily data sorted by date)
  const salesTrends = Object.values(dailySalesData)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const avgTransactionValue = grossUnits > 0 ? grossSales / grossUnits : 0;

  const result = {
    grossSales,
    refunds: 0, // Not tracking refunds in daily view
    netRevenue: grossSales,
    totalRevenue: grossSales,
    totalUnitsSold: grossUnits,
    grossUnits,
    refundUnits: 0,
    refundRate: 0,
    avgTransactionValue,
    topProductsByRevenue,
    topProductsByUnits,
    topBrands,
    categoryPerformance,
    storePerformance,
    salesTrends,
    strainSales,
    movementSummary: {
      totalSales: movements.length,
      totalRefunds: 0,
      totalTransfers: 0,
      totalPurchases: 0,
      totalAudits: 0
    },
    totalTransactions: movements.length,
    hasData: movements.length > 0
  };

  console.log('💰 Daily sales analytics summary:', {
    totalRevenue: result.totalRevenue,
    unitsSold: result.totalUnitsSold,
    avgTransaction: result.avgTransactionValue,
    dataPoints: salesTrends.length,
    hasData: result.hasData
  });

  return result;
};

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
  console.log(`[QUERY] getOrderingAnalytics | START | stores:${storeIds?.length || 'all'} filters:${Object.keys(filters).length} offset:${offset} limit:${limit}`);

  // Default to 14 days if no date range provided
  const endDate = dateRange?.end ? new Date(dateRange.end) : new Date();
  const startDate = dateRange?.start ? new Date(dateRange.start) : new Date(endDate.getTime() - 14 * 24 * 60 * 60 * 1000);
  const periodDays = Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000));

  // Build store filter
  const storeWhere = { userId: context.user.id, isActive: true };
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
    setCached(recentSalesCacheKey, productsWithRecentSales, 600, 'recent_sales').catch(err => 
      console.warn(`Cache write failed for recent_sales:`, err.message)
    );
  }
  
  const productIdsWithRecentSales = productsWithRecentSales.map(r => r.productId);

  // Base filter: Only date range, stores, and 30-day activity
  // Exclude Accessories/VPT by default for performance (unless explicitly requested)
  const baseProductWhere = {
    AND: [
      {
        OR: [
          // Has current inventory
          { stockLevels: { some: { 
            storeId: { in: storeIdList },
            quantity: { gt: 0 } 
          }}},
          // OR has sales in last 30 days (from WeeklySalesSummary)
          ...(productIdsWithRecentSales.length > 0 ? [{ id: { in: productIdsWithRecentSales } }] : [{ id: { in: [] } }])
        ]
      },
      // Exclude Accessories/VPT unless explicitly requested
      ...(includeHiddenCategories ? [] : [
        { parentCategory: { notIn: ['Accessories', 'Accessory', 'VPT'] } }
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

  // Calculate week boundaries for WeeklySalesSummary queries
  const weekBoundaries = calculateWeekBoundaries(startDate, endDate);

  // Base products and rankings products already loaded in parallel above
  
  let allProductIdsForRankings = null;
  
  if (baseProducts) {
    // Load from cache - rankings products already loaded in parallel
    allProductIdsForRankings = cachedRankingsProducts || baseProducts.map(p => ({ id: p.id, subcategory: p.subcategory }));
  } else {
    // Base cache miss - fetch all products (unfiltered) and cache them
    const dbResults = await Promise.all([
      timedQuery('all_product_ids_rankings', () =>
        context.entities.ProductCatalog.findMany({
          where: baseProductWhere,
          select: { id: true, subcategory: true }
        }), { stores: storeIdList.length }
      ),
      timedQuery('base_products', () =>
        context.entities.ProductCatalog.findMany({
    where: baseProductWhere,
    include: {
      stockLevels: {
        where: { storeId: { in: storeIdList } },
              select: { storeId: true, quantity: true, store: { select: { id: true, name: true } } }
            }
          }
        }), { stores: storeIdList.length }
      )
    ]);
    
    allProductIdsForRankings = dbResults[0];
    baseProducts = dbResults[1];
    
    // Cache base products for future use (non-blocking)
    setCached(baseProductsKey, baseProducts, 3600, 'base:products').catch(err => 
      console.warn(`Cache write failed for base:products:`, err.message)
    );
    const baseRankingsKey = generateCacheKey('base:rankings_products', {
      storeIds: storeIdsKey,
      includeHidden: includeHiddenCategories
    });
    setCached(baseRankingsKey, allProductIdsForRankings, 3600, 'base:rankings_products').catch(err => 
      console.warn(`Cache write failed for base:rankings_products:`, err.message)
    );
  }
  
  // Apply filters in-memory
  const filteredProducts = filterProductsInMemory(baseProducts, filters);
  const totalCount = filteredProducts.length;
  
  // Apply pagination in-memory (skip if loadAll is true)
  const paginatedProducts = loadAll ? filteredProducts : filteredProducts.slice(offset, offset + limit);
  const products = paginatedProducts;
  
  // When loadAll is true, use all filtered products for metrics calculation
  const productIds = loadAll ? filteredProducts.map(p => p.id) : products.map(p => p.id);
  const allFilteredProductIds = filteredProducts.map(p => p.id);

  // Get sales totals and purchase orders in parallel (both need productIds)
  // Calculate current week start (Monday) to exclude incomplete week from WeeklySalesSummary
  const today = new Date();
  const currentDay = today.getDay();
  const currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
  currentWeekStart.setHours(0, 0, 0, 0);

  // Cache key for sales totals (hash productIds if >100 to keep key manageable)
  const productIdsHash = productIds.length > 100 
    ? `${productIds.length}_${productIds.slice(0, 10).join(',')}`
    : productIds.sort((a, b) => a - b).join(',');
  const salesTotalsCacheKey = generateCacheKey('sales_totals', {
    storeIds: storeIdList.sort().join(','),
    productIds: productIdsHash,
    dateRange: `${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}`,
    weekStart: weekBoundaries.start.toISOString().split('T')[0],
    currentWeekStart: currentWeekStart.toISOString().split('T')[0]
  });

  // Prepare cache keys for parallel checks (base data, unfiltered)
  const dateRangeKey = `${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}`;
  const baseSalesTotalsKey = generateCacheKey('base:sales_totals', {
    storeIds: storeIdsKey,
    dateRange: dateRangeKey
  });
  const basePOsKey = generateCacheKey('base:purchase_orders', {
    storeIds: storeIdsKey
  });
  
  const baseRankingsKey = generateCacheKey('base:rankings', {
    storeIds: storeIdsKey,
    dateRange: `${weekBoundaries.start.toISOString().split('T')[0]}_${currentWeekStart.toISOString().split('T')[0]}`
  });

  // Parallelize cache checks for base sales_totals, purchase_orders, and rankings using batch
  const [cachedBaseSales, cachedBasePOs, cachedBaseRankings] = await getCachedBatch(
    [baseSalesTotalsKey, basePOsKey, baseRankingsKey],
    ['base:sales_totals', 'base:purchase_orders', 'base:rankings']
  );
  
  // If cached purchase orders exist but are empty, treat as cache miss to force refresh
  const hasValidPOCache = cachedBasePOs && cachedBasePOs.lastPOMap && Object.keys(cachedBasePOs.lastPOMap).length > 0;
  let salesMap = null;
  let completeWeeksSet = null;
  let weeklySalesData = null;
  let movementSalesTotals = null;
  let allPOs = null;
  let allRankingsSalesData = null;

  if (cachedBaseSales) {
    // Reconstruct base salesMap from cache, then filter to only include filtered products
    const baseSalesMap = new Map();
    if (cachedBaseSales.salesMap) {
      Object.entries(cachedBaseSales.salesMap).forEach(([productId, sales]) => {
        baseSalesMap.set(parseInt(productId), sales);
      });
    }
    completeWeeksSet = new Set(cachedBaseSales.completeWeeks || []);
    
    // Filter salesMap to only include products in filteredProductIds
    salesMap = new Map();
    allFilteredProductIds.forEach(productId => {
      if (baseSalesMap.has(productId)) {
        salesMap.set(productId, baseSalesMap.get(productId));
      }
    });
  }
  
  // Get all base product IDs (now that baseProducts is guaranteed to exist)
  const allBaseProductIds = baseProducts ? baseProducts.map(p => p.id) : [];
  
  // Always fetch purchase orders if cache is invalid or missing
  if (!hasValidPOCache && allBaseProductIds.length > 0) {
    console.log(`[QUERY] Purchase orders | Cache invalid or empty, fetching fresh data for ${allBaseProductIds.length} products`);
    allPOs = await timedQuery('purchase_orders', () =>
      context.entities.InventoryMovement.findMany({
        where: {
          storeId: { in: storeIdList },
          productId: { in: allBaseProductIds },
          type: 'purchase order'
        },
        select: { productId: true, date: true, changeQty: true },
        orderBy: { date: 'desc' }
      }), { productIds: allBaseProductIds.length, stores: storeIdList.length }
    );
    console.log(`[QUERY] Purchase orders | Fetched ${allPOs?.length || 0} PO records from DB`);
  }
  
  if (!cachedBaseSales) {
    // Need to fetch from database - but we need ALL products, not just filtered ones
    // Fetch base data for all products matching baseProductWhere
    
    // Parallelize ALL base data queries: sales, purchase orders, and rankings
    // Note: Purchase orders already fetched above if cache was invalid
    const [salesQueryResults, freshPOs, allRankingsSalesData] = await Promise.all([
      // Sales queries (weekly + movements)
      Promise.all([
        // Get sales totals from WeeklySalesSummary (complete weeks only, exclude current incomplete week)
        allBaseProductIds.length > 0 ? timedQuery('weekly_sales_totals', () => 
          context.entities.WeeklySalesSummary.findMany({
            where: {
              storeId: { in: storeIdList },
              productId: { in: allBaseProductIds },
              weekStart: { gte: weekBoundaries.start, lt: currentWeekStart }
            },
            select: {
              productId: true,
              storeId: true,
              weekStart: true,
              unitsSold: true
            }
          }), { productIds: allBaseProductIds.length, stores: storeIdList.length }
        ) : Promise.resolve([]),
        // Get sales from InventoryMovement for the exact date range (includes incomplete week)
        allBaseProductIds.length > 0 ? timedQuery('movement_sales', () =>
          context.entities.InventoryMovement.findMany({
          where: {
            storeId: { in: storeIdList },
              productId: { in: allBaseProductIds },
                type: 'sale',
                date: { gte: startDate, lte: endDate }
              },
            select: { productId: true, storeId: true, changeQty: true, date: true }
          }), { productIds: allBaseProductIds.length, stores: storeIdList.length, dateRange: `${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}` }
        ) : Promise.resolve([])
      ]),
      // Purchase orders (only fetch if not already fetched above)
      hasValidPOCache || allPOs ? Promise.resolve(allPOs || []) : (allBaseProductIds.length > 0 ? timedQuery('purchase_orders', () =>
        context.entities.InventoryMovement.findMany({
          where: {
            storeId: { in: storeIdList },
            productId: { in: allBaseProductIds },
            type: 'purchase order'
          },
          select: { productId: true, date: true, changeQty: true },
          orderBy: { date: 'desc' }
        }), { productIds: allBaseProductIds.length, stores: storeIdList.length }
      ) : Promise.resolve([])),
      // Rankings sales (independent, can run in parallel)
      allBaseProductIds.length > 0 ? timedQuery('rankings_sales', () =>
        context.entities.WeeklySalesSummary.groupBy({
          by: ['productId'],
          where: {
            storeId: { in: storeIdList },
            productId: { in: allBaseProductIds },
            weekStart: { gte: weekBoundaries.start, lt: currentWeekStart }
          },
          _sum: { unitsSold: true }
        }), { productIds: allBaseProductIds.length, stores: storeIdList.length }
      ) : Promise.resolve([])
    ]);
    
    // Destructure sales results
    [weeklySalesData, movementSalesTotals] = salesQueryResults;

    // Build map: productId -> { totalSales, locationSales: { storeId: units } }
    salesMap = new Map();
    completeWeeksSet = new Set();
    
    // Process weekly summary data and derive complete weeks in one pass (merged query optimization)
    // Aggregate by productId+storeId (like groupBy would) and track complete weeks
    const weeklySalesAggregated = new Map(); // productId_storeId -> unitsSold
    if (weeklySalesData && weeklySalesData.length > 0) {
      weeklySalesData.forEach(item => {
        // Aggregate sales totals by productId+storeId
        const key = `${item.productId}_${item.storeId}`;
        weeklySalesAggregated.set(key, (weeklySalesAggregated.get(key) || 0) + (item.unitsSold || 0));
        
        // Track complete weeks (from weekStart field)
        const weekStart = item.weekStart instanceof Date ? item.weekStart : new Date(item.weekStart);
        completeWeeksSet.add(weekStart.getTime());
      });
      
      // Build salesMap from aggregated data
      weeklySalesAggregated.forEach((unitsSold, key) => {
        const [productId, storeId] = key.split('_').map(Number);
        if (!salesMap.has(productId)) {
          salesMap.set(productId, { totalSales: 0, locationSales: {} });
        }
        const productSales = salesMap.get(productId);
        productSales.totalSales += unitsSold;
        productSales.locationSales[storeId] = (productSales.locationSales[storeId] || 0) + unitsSold;
      });
    }

    // Add movement data for the date range (includes incomplete week)
    // Only include movements from weeks that are NOT in WeeklySalesSummary (incomplete/current week)
    (movementSalesTotals || []).forEach(movement => {
    const movementDate = new Date(movement.date);
    // Determine which week this movement belongs to (Monday of that week)
    const movementDay = movementDate.getDay();
    const movementWeekStart = new Date(movementDate);
    movementWeekStart.setDate(movementDate.getDate() - (movementDay === 0 ? 6 : movementDay - 1));
    movementWeekStart.setHours(0, 0, 0, 0);
    const movementWeekStartTime = movementWeekStart.getTime();
    
    // Only include movements from:
    // 1. Current incomplete week (movementWeekStart >= currentWeekStart)
    // 2. Weeks NOT in WeeklySalesSummary (to avoid double-counting complete weeks)
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

    // Cache the base salesMap (all products) for future requests (non-blocking)
    const baseSalesMapToCache = {
      salesMap: Object.fromEntries(salesMap), // This is the full map for all base products
      completeWeeks: Array.from(completeWeeksSet)
    };
    setCached(baseSalesTotalsKey, baseSalesMapToCache, 3600, 'base:sales_totals').catch(err => 
      console.warn(`Cache write failed for base:sales_totals:`, err.message)
    );
    
    // Filter salesMap to only include filtered products
    const filteredSalesMap = new Map();
    allFilteredProductIds.forEach(productId => {
      if (salesMap.has(productId)) {
        filteredSalesMap.set(productId, salesMap.get(productId));
      }
    });
    salesMap = filteredSalesMap;
  }

  // Get purchase orders (base cache - already checked above)
  let lastPOMap = new Map();
  let baseLastPOMap = new Map();
  
  // Check if we should use cached PO data or fetch fresh
  const useCachedPOs = cachedBasePOs && cachedBasePOs.lastPOMap && Object.keys(cachedBasePOs.lastPOMap).length > 0;
  
  if (useCachedPOs) {
    // Reconstruct base lastPOMap from cache, then filter to filtered products
    if (cachedBasePOs.lastPOMap) {
      Object.entries(cachedBasePOs.lastPOMap).forEach(([productId, poData]) => {
        const pid = parseInt(productId);
        baseLastPOMap.set(pid, {
          date: new Date(poData.date),
          qty: poData.qty
        });
      });
    }
    
    console.log(`[QUERY] Purchase orders | Cached base POs: ${baseLastPOMap.size} | Sample product IDs in cache: ${Array.from(baseLastPOMap.keys()).slice(0, 5).join(', ')}`);
    console.log(`[QUERY] Purchase orders | Sample filtered product IDs: ${allFilteredProductIds.slice(0, 5).join(', ')}`);
    
    // Filter to only include filtered products (when loadAll=true, this includes all filtered products)
    // Ensure product IDs are integers for comparison
    allFilteredProductIds.forEach(productId => {
      const pid = parseInt(productId);
      if (baseLastPOMap.has(pid)) {
        lastPOMap.set(pid, baseLastPOMap.get(pid));
      }
    });
  } else {
    // Purchase orders already fetched in parallel above with sales queries
    // Build base purchase order map (all products)
    if (allPOs && Array.isArray(allPOs)) {
      allPOs.forEach(po => {
        // Keep only the most recent purchase order per product (already ordered by date desc)
        const pid = parseInt(po.productId);
        if (!baseLastPOMap.has(pid)) {
          baseLastPOMap.set(pid, {
            date: po.date instanceof Date ? po.date : new Date(po.date),
            qty: Math.abs(po.changeQty)
          });
        }
      });
    }

    console.log(`[QUERY] Purchase orders | Fresh POs from DB: ${baseLastPOMap.size} | Sample product IDs: ${Array.from(baseLastPOMap.keys()).slice(0, 5).join(', ')}`);
    console.log(`[QUERY] Purchase orders | Sample filtered product IDs: ${allFilteredProductIds.slice(0, 5).join(', ')}`);

    // Cache the base lastPOMap (non-blocking)
    const basePOsToCache = {
      lastPOMap: Object.fromEntries(
        Array.from(baseLastPOMap.entries()).map(([productId, poData]) => [
          productId,
          { date: poData.date.toISOString(), qty: poData.qty }
        ])
      )
    };
    setCached(basePOsKey, basePOsToCache, 3600, 'base:purchase_orders').catch(err => 
      console.warn(`Cache write failed for base:purchase_orders:`, err.message)
    );
    
    // Filter to only include filtered products (when loadAll=true, this includes all filtered products)
    // Ensure product IDs are integers for comparison
    allFilteredProductIds.forEach(productId => {
      const pid = parseInt(productId);
      if (baseLastPOMap.has(pid)) {
        lastPOMap.set(pid, baseLastPOMap.get(pid));
      }
    });
  }
  
  console.log(`[QUERY] Purchase orders | Final lastPOMap size: ${lastPOMap.size} | filtered products: ${allFilteredProductIds.length} | Base PO map size: ${baseLastPOMap.size}`);

  // Get recent sales and location counts in parallel
  // Note: Purchase orders are already handled above via base cache (cachedBasePOs)
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  
  // Start location_counts query early (independent, can run in parallel with other processing)
  // OPTIMIZED: Filter by allFilteredProductIds instead of baseProductWhere
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
  
  // Cache key for recent sales movements (by productIds + stores + date)
  const recentSalesMovementsCacheKey = productIds.length > 0 ? generateCacheKey('recent_sales_movements', {
    productIds: productIds.sort((a, b) => a - b).join(','),
    storeIds: storeIdList.sort().join(','),
    date: fourteenDaysAgo.toISOString().split('T')[0]
  }) : null;
  
  // Start recent sales cache check and location counts in parallel
  const [cachedRecentSales, locationCountsResult] = await Promise.all([
    // Try to get recent sales from cache first
    recentSalesMovementsCacheKey ? getCached(recentSalesMovementsCacheKey, 'recent_sales_movements') : Promise.resolve(null),
    // Location counts query (optimized to filter by allFilteredProductIds)
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
        select: { productId: true, date: true },
        orderBy: { date: 'desc' }
      }), { productIds: productIds.length, stores: storeIdList.length }
    );
    // Cache for 10 minutes (data changes frequently but not every request)
    if (recentSales && recentSales.length > 0 && recentSalesMovementsCacheKey) {
      setCached(recentSalesMovementsCacheKey, recentSales, 600, 'recent_sales_movements').catch(err => 
        console.warn(`Cache write failed for recent_sales_movements:`, err.message)
      );
    }
  }
  recentSales = recentSales || [];

  // Build map of product -> most recent sale date from movements
  // Convert dates from cache (strings) back to Date objects
  const lastSaleMap = new Map();
  recentSales.forEach(movement => {
    if (!lastSaleMap.has(movement.productId)) {
      // Convert date from cache (string) to Date object if needed
      const saleDate = movement.date instanceof Date ? movement.date : new Date(movement.date);
      lastSaleMap.set(movement.productId, saleDate);
    }
  });

  // Get older sales from weekly summaries (for filtered products not in recent sales) - CACHED
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
          weekStart: true
        },
        orderBy: { weekStart: 'desc' }
      }), { productIds: remainingProductIds.length, stores: storeIdList.length }
    );
    // Cache for 30 minutes (historical data doesn't change)
    if (olderSaleData && olderSaleData.length > 0 && olderSalesCacheKey) {
      setCached(olderSalesCacheKey, olderSaleData, 1800, 'older_sales').catch(err => 
        console.warn(`Cache write failed for older_sales:`, err.message)
      );
    }
  }
  olderSaleData = olderSaleData || [];
  
  // Process rankings data (from base cache)
  let rankingsSalesMap = new Map();
  
  if (cachedBaseRankings) {
    // Reconstruct base rankingsSalesMap from cache, then filter to filtered products
    const baseRankingsSalesMap = new Map();
    if (cachedBaseRankings.rankingsSalesMap) {
      Object.entries(cachedBaseRankings.rankingsSalesMap).forEach(([productId, sales]) => {
        baseRankingsSalesMap.set(parseInt(productId), sales);
      });
    }
    
    // Filter to only include filtered products
    allFilteredProductIds.forEach(productId => {
      if (baseRankingsSalesMap.has(productId)) {
        rankingsSalesMap.set(productId, baseRankingsSalesMap.get(productId));
      }
    });
  } else {
    // Build rankings from base salesMap we already have (much faster than querying DB)
    // The salesMap contains all base products with their sales totals
    const baseRankingsSalesMap = new Map();
    
    // Reconstruct base salesMap from cache if available, otherwise use what we built
    let fullBaseSalesMap = null;
    if (cachedBaseSales && cachedBaseSales.salesMap) {
      fullBaseSalesMap = new Map();
      Object.entries(cachedBaseSales.salesMap).forEach(([productId, sales]) => {
        fullBaseSalesMap.set(parseInt(productId), sales);
      });
    } else if (salesMap) {
      // Rankings sales data already fetched in parallel above with sales queries
      // Use the data we already have

      allRankingsSalesData.forEach(item => {
        baseRankingsSalesMap.set(item.productId, item._sum.unitsSold || 0);
      });
    }
    
    // If we have fullBaseSalesMap from cache, use it
    if (fullBaseSalesMap) {
      fullBaseSalesMap.forEach((sales, productId) => {
        baseRankingsSalesMap.set(productId, sales.totalSales || 0);
      });
    }

    // Cache the base rankingsSalesMap (non-blocking)
    if (baseRankingsSalesMap.size > 0) {
      const baseRankingsToCache = {
        rankingsSalesMap: Object.fromEntries(baseRankingsSalesMap)
      };
      setCached(baseRankingsKey, baseRankingsToCache, 3600, 'base:rankings').catch(err => 
        console.warn(`Cache write failed for base:rankings:`, err.message)
      );
    }
    
    // Filter to only include filtered products
    allFilteredProductIds.forEach(productId => {
      if (baseRankingsSalesMap.has(productId)) {
        rankingsSalesMap.set(productId, baseRankingsSalesMap.get(productId));
      }
    });
  }

    olderSaleData.forEach(summary => {
      if (!lastSaleMap.has(summary.productId)) {
        // Convert weekStart from cache (string) to Date object if needed
        const weekStartDate = summary.weekStart instanceof Date ? summary.weekStart : new Date(summary.weekStart);
        lastSaleMap.set(summary.productId, weekStartDate);
      }
    });

  // Calculate metrics for paginated products using pre-aggregated WeeklySalesSummary data
  const allProductMetrics = [];
  
  for (const product of products) {
    // Skip if no inventory across all locations
    const totalInventory = product.stockLevels.reduce((sum, sl) => sum + sl.quantity, 0);
    
    // Get sales from WeeklySalesSummary aggregation (not from movements)
    const productSales = salesMap.get(product.id) || { totalSales: 0, locationSales: {} };
    const totalSales = productSales.totalSales;
    
    // Skip if no sales and no inventory
    if (totalInventory === 0 && totalSales === 0) continue;
    
    // Calculate velocity (units per week) from aggregated sales
    const weeksInPeriod = periodDays / 7;
    const velocity = weeksInPeriod > 0 ? totalSales / weeksInPeriod : 0;
    
    // Calculate weeks of inventory left
    const weeksLeft = velocity > 0 ? totalInventory / velocity : 999;
    
    // Days since last sale - use unfiltered last sale data from summary table
    const actualLastSaleDate = lastSaleMap.get(product.id);
    const daysSinceLastSale = actualLastSaleDate ? Math.floor((endDate - actualLastSaleDate) / (24 * 60 * 60 * 1000)) : null;
    
    // Days since last purchase order (from separate PO query)
    const lastPOData = lastPOMap.get(product.id);
    const lastPODate = lastPOData ? (lastPOData.date instanceof Date ? lastPOData.date : new Date(lastPOData.date)) : null;
    const lastPOQty = lastPOData ? lastPOData.qty : null;
    const daysSinceLastPO = lastPODate && !isNaN(lastPODate.getTime()) ? Math.floor((endDate - lastPODate) / (24 * 60 * 60 * 1000)) : null;
    
    // Suggested order quantity (2-week buffer)
    const twoWeekDemand = velocity * 2;
    const suggestedQty = Math.max(0, Math.ceil(twoWeekDemand - totalInventory));
    const caseSize = product.caseSize || 12;
    const suggestedCases = Math.ceil(suggestedQty / caseSize);
    
    // Per-location inventory (as array for serialization)
    const locationInventory = product.stockLevels.map(sl => ({
      storeId: sl.storeId,
      storeName: sl.store.name,
      quantity: sl.quantity
    }));

    // Per-location sales (from WeeklySalesSummary aggregation)
    const locationSales = Object.keys(productSales.locationSales).map(storeId => ({
        storeId: parseInt(storeId),
      units: productSales.locationSales[storeId]
    }));

    allProductMetrics.push({
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
      caseSize,
      totalInventory,
      locationInventory,
      locationSales,
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


  // rankingsSalesMap already built above (from cache or database)

  // Calculate subcategory rankings using ALL products (base filter only)
  const subcategoryGroups = {};
  allProductIdsForRankings.forEach(p => {
    const subcat = p.subcategory || 'Uncategorized';
    if (!subcategoryGroups[subcat]) subcategoryGroups[subcat] = [];
    subcategoryGroups[subcat].push({
      id: p.id,
      totalSales: rankingsSalesMap.get(p.id) || 0
    });
  });

  // Assign ranks based on full dataset (by subcategory)
  const rankingsMap = new Map();
  Object.keys(subcategoryGroups).forEach(subcat => {
    subcategoryGroups[subcat].sort((a, b) => b.totalSales - a.totalSales);
    const subcategoryTotal = subcategoryGroups[subcat].length;
    subcategoryGroups[subcat].forEach((p, idx) => {
      rankingsMap.set(p.id, {
        categoryRank: idx + 1,
        categoryTotal: subcategoryTotal,
        isTop10: idx < 10
      });
    });
  });

  // Products are already filtered at database level, so allProductMetrics are the filtered products
  const filteredProductMetrics = allProductMetrics;

  // Apply rankings to filtered products
  filteredProductMetrics.forEach(p => {
    const ranking = rankingsMap.get(p.id);
    if (ranking) {
      p.categoryRank = ranking.categoryRank;
      p.categoryTotal = ranking.categoryTotal;
      p.isTop10 = ranking.isTop10;
    }
  });

  // Sort by velocity (fastest movers first)
  filteredProductMetrics.sort((a, b) => b.velocity - a.velocity);

  // Total count already calculated at database level
  const hasMore = loadAll ? false : offset + limit < totalCount;

  // Fast path: Skip expensive sparkline calculations for initial page load
  // Sparklines can be loaded later when full data is requested
  const paginatedProductIds = filteredProductMetrics.map(p => p.id);
  const allFilteredProductIdsList = allFilteredProductIds;
  
  // Only calculate sparklines if loadAll is true (full data load)
  // For initial page load (loadAll: false), skip sparklines for faster response
  const sparklineData = loadAll && paginatedProductIds.length > 0 ? await (async () => {
    const sparklineCacheKey = generateCacheKey('sparklines', {
      productIds: paginatedProductIds.sort((a, b) => a - b).join(','),
      storeIds: storeIdList.sort().join(','),
      date: twelveWeeksAgo.toISOString().split('T')[0]
    });
    let sparklineData = await getCached(sparklineCacheKey, 'sparklines');
    if (!sparklineData) {
      sparklineData = await timedQuery('sparklines', () =>
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
      // Cache for 30 minutes (historical data doesn't change) - non-blocking
      setCached(sparklineCacheKey, sparklineData, 1800, 'sparklines').catch(err => 
        console.warn(`Cache write failed for sparklines:`, err.message)
      );
    }
    return sparklineData;
  })() : [];

  // Calculate strain counts from filtered products in memory (already loaded, no DB query needed)
  const strainCounts = { Hybrid: 0, Sativa: 0, Indica: 0 };
  filteredProducts.forEach(p => {
    const strain = p.strainType;
    if (strain && strain !== 'N/A' && strainCounts[strain] !== undefined) {
      strainCounts[strain]++;
    }
  });

  // Calculate primary store strain counts from filtered products in memory
  const primaryStoreStrainCounts = { Hybrid: 0, Sativa: 0, Indica: 0 };
  if (primaryStore) {
    filteredProducts.forEach(p => {
      // Check if product has stock at primary store
      const hasStock = p.stockLevels?.some(sl => sl.storeId === primaryStore.id && sl.quantity > 0);
      if (hasStock) {
        const strain = p.strainType;
        if (strain && strain !== 'N/A' && primaryStoreStrainCounts[strain] !== undefined) {
          primaryStoreStrainCounts[strain]++;
        }
      }
    });
  }

  // Get location counts (already fetched in parallel above)
  const stockLevelCounts = locationCountsResult;

  // Build map of storeId -> count
  const stockCountMap = new Map();
  stockLevelCounts.forEach(item => {
    stockCountMap.set(item.storeId, item._count.productId);
  });

  // Build locationInventoryCounts from the aggregated data
  const locationInventoryCounts = stores.map(store => ({
      storeId: store.id,
      storeName: store.name,
    count: stockCountMap.get(store.id) || 0
  }));

  // Products are already paginated - use filteredProductMetrics
  const paginatedProductsForSparklines = filteredProductMetrics;

  // Organize sparkline data by product (only if sparklines were loaded)
  const sparklineByProduct = {};
  if (sparklineData.length > 0) {
    sparklineData.forEach(data => {
      if (!sparklineByProduct[data.productId]) {
        sparklineByProduct[data.productId] = [];
      }
      // Convert weekStart to Date if it's a string (from cache)
      const weekStartDate = data.weekStart instanceof Date 
        ? data.weekStart 
        : new Date(data.weekStart);
      sparklineByProduct[data.productId].push({
        week: weekStartDate,
        units: data.unitsSold
      });
    });
  }

  // Attach sparkline data to paginated products (only if sparklines were loaded)
  if (loadAll && sparklineData.length > 0) {
    paginatedProductsForSparklines.forEach(product => {
      const productSparkline = sparklineByProduct[product.id] || [];
      // Group by week and sum units across all stores
      const weeklyTotals = {};
      productSparkline.forEach(point => {
        // Ensure week is a Date object
        const weekDate = point.week instanceof Date 
          ? point.week 
          : new Date(point.week);
        const weekKey = weekDate.toISOString().split('T')[0];
        weeklyTotals[weekKey] = (weeklyTotals[weekKey] || 0) + point.units;
      });
      // Convert to array of weekly values (last 12 weeks)
      product.sparklineData = Object.keys(weeklyTotals)
        .sort()
        .map(week => weeklyTotals[week]);
    });
  } else {
    // For fast path, set empty sparkline data
    paginatedProductsForSparklines.forEach(product => {
      product.sparklineData = [];
    });
  }

  // Calculate sales matrix data, location totals, latest movement, and brand-distributor mappings in parallel
  // Note: allFilteredProductIds is already defined above (line 1514), so we don't need to query again
  const [
    latestMovement,
    brandsWithDistributors,
    allDistributors
  ] = await Promise.all([
    // Get the latest movement timestamp for display
    // Get the latest movement timestamp for display
    context.entities.InventoryMovement.findFirst({
      where: {
        storeId: { in: storeIdList }
      },
      orderBy: { date: 'desc' },
      select: { date: true }
    }),
    // Fetch brand-distributor mappings (cached - rarely changes)
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
        // Cache for 1 hour (rarely changes) - non-blocking
        setCached(brandsCacheKey, brands, 3600, 'brands_distributors').catch(err => 
          console.warn(`Cache write failed for brands_distributors:`, err.message)
        );
      }
      return brands;
    })(),
    // Get all distributors for filter
    context.entities.Distributor.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' }
    })
  ]);

  // Build sales map for all filtered products (for rankings and sales matrix)
  // Use base salesMap (already loaded from cache or DB) and filter to allFilteredProductIds
  const allFilteredSalesMap = new Map();
  
  // Get base sales map - reconstruct from cache if needed, or use the one we already built
  let baseSalesMapForMatrix = null;
  if (cachedBaseSales) {
    baseSalesMapForMatrix = new Map();
    if (cachedBaseSales.salesMap) {
      Object.entries(cachedBaseSales.salesMap).forEach(([productId, sales]) => {
        baseSalesMapForMatrix.set(parseInt(productId), sales);
      });
    }
  } else {
    // Use the salesMap we built earlier (which contains all base products)
    // We need to rebuild it from the full data we fetched
    baseSalesMapForMatrix = salesMap || new Map();
  }
  
  // Filter to only include filtered products
  allFilteredProductIds.forEach(productId => {
    if (baseSalesMapForMatrix.has(productId)) {
      allFilteredSalesMap.set(productId, baseSalesMapForMatrix.get(productId));
    }
  });

  // Get top 20 product IDs by sales
  const topProductIds = Array.from(allFilteredSalesMap.entries())
    .sort((a, b) => b[1].totalSales - a[1].totalSales)
    .slice(0, 20)
    .map(([productId]) => productId);

  // Get product details for top 20
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

  // Calculate location totals from the same aggregated data (reuse stockCountMap from earlier)
  const locationTotals = stores.map(store => ({
      storeName: store.name,
    productCount: stockCountMap.get(store.id) || 0
  }));

  const lastUpdate = latestMovement?.date || new Date();

  // Build brand-distributor map
  const brandDistributorMap = new Map();
  brandsWithDistributors.forEach(brand => {
    brandDistributorMap.set(brand.name, brand.distributors.map(bd => ({
      id: bd.distributor.id,
      name: bd.distributor.name,
      isPrimary: bd.isPrimary
    })));
  });

  // Attach distributor data to filtered products
  filteredProductMetrics.forEach(product => {
    product.distributors = brandDistributorMap.get(product.brand) || [];
  });

  const queryDuration = Date.now() - queryStartTime;
  console.log(`[QUERY] getOrderingAnalytics | COMPLETE | ${queryDuration}ms | products:${filteredProductMetrics.length}/${totalCount} hasMore:${hasMore}`);

  console.log('📦 Ordering analytics result:', {
    totalProducts: totalCount,
    filteredProducts: filteredProductMetrics.length,
    paginatedProducts: filteredProductMetrics.length,
    offset,
    limit,
    totalCount,
    hasMore,
    periodDays,
    dateRange: `${startDate.toISOString()} to ${endDate.toISOString()}`,
    lastUpdate: lastUpdate.toISOString()
  });

  // Build filter options from base products (in-memory filtering)
  // Filter options are context-aware: exclude the filter being built from consideration
  const brandFiltered = filterProductsInMemory(baseProducts, {
    categories: filters.categories,
    subcategories: filters.subcategories,
    units: filters.units,
    sizes: filters.sizes
  });
  const subcategoryFiltered = filterProductsInMemory(baseProducts, {
    categories: filters.categories,
    brands: filters.brands,
    units: filters.units,
    sizes: filters.sizes
  });
  const unitsFiltered = filterProductsInMemory(baseProducts, {
    categories: filters.categories,
    subcategories: filters.subcategories,
    brands: filters.brands,
    sizes: filters.sizes
  });
  const sizesFiltered = filterProductsInMemory(baseProducts, {
    categories: filters.categories,
    subcategories: filters.subcategories,
    brands: filters.brands,
    units: filters.units
  });
  
  // Extract distinct values
  const brandOptions = [...new Set(brandFiltered.map(p => p.brand).filter(Boolean))];
  const categoryOptions = [...new Set(baseProducts.map(p => p.parentCategory).filter(Boolean))];
  const subcategoryOptions = [...new Set(subcategoryFiltered.map(p => p.subcategory).filter(Boolean))];
  const unitsOptions = [...new Set(unitsFiltered.map(p => p.unitCount).filter(Boolean))];
  const sizesOptions = [...new Set(sizesFiltered.map(p => p.unitSize).filter(Boolean))];

  const smartBrands = brandOptions.sort();
  const allCategoriesSet = new Set(categoryOptions);
  if (!includeHiddenCategories) {
    allCategoriesSet.add('Accessories');
    allCategoriesSet.add('VPT');
  }
  const allCategories = Array.from(allCategoriesSet).sort();
  const allSubcategories = subcategoryOptions.sort();
  const allUnits = unitsOptions.sort((a, b) => a - b);
  const allSizes = sizesOptions.sort();

  // Calculate primary store category totals (if primary store exists) using database queries
  const primaryStoreCategoryTotals = { Uncategorized: 0 };
  allCategories.forEach(cat => {
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
  allCategories.forEach(cat => {
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
    primaryStoreCategoryTotals: allCategories.length > 0 ? primaryStoreCategoryTotals : { Uncategorized: 0 },
    totalCategoryTotals: allCategories.length > 0 ? totalCategoryTotals : { Uncategorized: 0 },
    dateRange: { start: startDate.toISOString(), end: endDate.toISOString() },
    periodDays,
    lastUpdate: lastUpdate.toISOString(),
    strainCounts, // Counts from ALL filtered products
    primaryStoreStrainCounts, // Primary store strain counts
    locationInventoryCounts, // Per-location inventory counts from ALL filtered products
    filterOptions: {
      brands: smartBrands, // Smart brand list based on other filters
      categories: allCategories,
      subcategories: allSubcategories,
      units: allUnits,
      sizes: allSizes
    }
  };
};

export const getBrandDistributors = async (args, context) => {
  if (!context.user) { throw new HttpError(401) }
  
  const brands = await context.entities.Brand.findMany({
    include: {
      distributors: {
        include: {
          distributor: true
        },
        orderBy: { isPrimary: 'desc' }
      }
    },
    orderBy: { name: 'asc' }
  })
  
  // Get last movement date for each brand
  const brandNames = brands.map(b => b.name)
  const movements = await context.entities.InventoryMovement.findMany({
    where: {
      product: {
        brand: { in: brandNames }
      }
    },
    select: {
      product: {
        select: {
          brand: true
        }
      },
      date: true
    },
    orderBy: { date: 'desc' }
  })
  
  // Find most recent movement per brand
  const brandLastActivity = new Map()
  movements.forEach(m => {
    const brand = m.product.brand
    if (brand && !brandLastActivity.has(brand)) {
      brandLastActivity.set(brand, m.date)
    }
  })
  
  return brands.map(brand => ({
    brandName: brand.name,
    distributors: brand.distributors.map(bd => ({
      id: bd.distributor.id,
      name: bd.distributor.name,
      isPrimary: bd.isPrimary
    })),
    lastActivity: brandLastActivity.get(brand.name) || null,
    hasDistributors: brand.distributors.length > 0
  }))
}

export const getDistributors = async (args, context) => {
  if (!context.user) { throw new HttpError(401) }
  
  return context.entities.Distributor.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' }
  })
}

export const getProductCatalog = async (args, context) => {
  if (!context.user) { throw new HttpError(401) }
  
  const { filters = {}, limit, offset = 0 } = args || {}
  
  const where = {}
  
  if (filters.brands && filters.brands.length > 0) {
    where.brand = { in: filters.brands }
  }
  
  if (filters.categories && filters.categories.length > 0) {
    where.parentCategory = { in: filters.categories }
  }
  
  if (filters.strainTypes && filters.strainTypes.length > 0) {
    where.strainType = { in: filters.strainTypes }
  }
  
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { brand: { contains: filters.search, mode: 'insensitive' } },
      { gtin: { contains: filters.search, mode: 'insensitive' } }
    ]
  }
  
  // Filter by in-stock status
  if (filters.inStock === true) {
    // Get user's stores
    const userStores = await context.entities.Store.findMany({
      where: { userId: context.user.id, isActive: true },
      select: { id: true }
    })
    const storeIds = userStores.map(s => s.id)
    
    // Get product IDs that have stock > 0 in any store
    const stockLevels = await context.entities.StockLevel.findMany({
      where: {
        storeId: { in: storeIds },
        quantity: { gt: 0 }
      },
      select: { productId: true },
      distinct: ['productId']
    })
    
    const inStockProductIds = stockLevels.map(s => s.productId)
    
    if (inStockProductIds.length === 0) {
      // No products in stock, return empty result
      return {
        products: [],
        total: 0,
        limit,
        offset
      }
    }
    
    where.id = { in: inStockProductIds }
  }
  
  const [products, total] = await Promise.all([
    context.entities.ProductCatalog.findMany({
      where,
      include: {
        classification: true,
        categoryDefinition: {
          include: {
            subcategories: true
          }
        },
        subcategoryDef: true,
        distributor: true,
        stockLevels: {
          where: {
            store: {
              userId: context.user.id,
              isActive: true
            }
          },
          include: {
            store: {
              select: {
                id: true,
                name: true,
                friendlyName: true
              }
            }
          }
        }
      },
      orderBy: { name: 'asc' },
      take: limit,
      skip: offset
    }),
    context.entities.ProductCatalog.count({ where })
  ])
  
  return {
    products,
    total,
    limit,
    offset
  }
}

export const getClassifications = async (args, context) => {
  if (!context.user) { throw new HttpError(401) }
  
  return await context.entities.Classification.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: 'asc' }
  })
}

export const getCategoryDefinitions = async (args, context) => {
  if (!context.user) { throw new HttpError(401) }
  
  return await context.entities.CategoryDefinition.findMany({
    where: { isActive: true },
    include: {
      subcategories: {
        where: { isActive: true },
        orderBy: { displayOrder: 'asc' }
      }
    },
    orderBy: { displayOrder: 'asc' }
  })
}

export const getProductById = async ({ productId }, context) => {
  if (!context.user) { throw new HttpError(401) }
  
  // Get user's stores for stock level filtering
  const userStores = await context.entities.Store.findMany({
    where: { userId: context.user.id, isActive: true },
    select: { id: true }
  })
  const storeIds = userStores.map(s => s.id)
  
  return await context.entities.ProductCatalog.findUnique({
    where: { id: productId },
    include: {
      classification: true,
      categoryDefinition: {
        include: {
          subcategories: true
        }
      },
      subcategoryDef: true,
      distributor: true,
      stockLevels: {
        where: {
          storeId: { in: storeIds }
        },
        include: {
          store: {
            select: {
              id: true,
              name: true,
              friendlyName: true,
              location: true
            }
          }
        },
        orderBy: {
          quantity: 'desc'
        }
      },
      movements: {
        where: {
          storeId: { in: storeIds }
        },
        orderBy: {
          date: 'desc'
        },
        take: 20
      },
      enrichments: {
        orderBy: { enrichedAt: 'desc' },
        take: 20
      }
    }
  })
}

export const getGlobalAnalyticsFiltered = async ({
  storeIds = null,
  filters = {}
}, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Build where clause for stores - only active stores
  const storeWhere = { 
    userId: context.user.id,
    isActive: true  // Only include active stores
  };
  if (storeIds && storeIds.length > 0) {
    storeWhere.id = { in: storeIds.map(id => parseInt(id)) };
  }

  // Build where clause for products based on filters
  const productWhere = {};
  
  // Exclude categories (e.g., Accessories)
  if (filters.excludeCategories && filters.excludeCategories.length > 0) {
    productWhere.parentCategory = { notIn: filters.excludeCategories };
  }
  
  if (filters.categories && filters.categories.length > 0) {
    productWhere.parentCategory = { in: filters.categories };
  }
  
  if (filters.subcategories && filters.subcategories.length > 0) {
    productWhere.subcategory = { in: filters.subcategories };
  }
  
  if (filters.brands && filters.brands.length > 0) {
    productWhere.brand = { in: filters.brands };
  }
  
  if (filters.strainTypes && filters.strainTypes.length > 0) {
    productWhere.strainType = { in: filters.strainTypes };
  }
  
  if (filters.priceRange) {
    productWhere.retailPrice = {
      gte: filters.priceRange.min || 0,
      lte: filters.priceRange.max || 999999
    };
  }

  // Get filtered stores with stock levels
  const stores = await context.entities.Store.findMany({
    where: storeWhere,
    include: {
      stockLevels: {
        where: {
          product: productWhere,
          ...(filters.stockStatus === 'inStock' ? { quantity: { gt: 0 } } : {}),
          ...(filters.stockStatus === 'lowStock' ? { quantity: { gt: 0, lt: 5 } } : {}),
          ...(filters.stockStatus === 'outOfStock' ? { quantity: 0 } : {})
        },
        include: {
          product: true
        }
      }
    }
  });

  // Get movements for sales data (type='sale' only)
  const movementWhere = {
    storeId: storeIds && storeIds.length > 0 ? { in: storeIds.map(id => parseInt(id)) } : undefined,
    type: 'sale', // Only actual sales
    product: productWhere
  };

  if (filters.dateRange) {
    movementWhere.date = {
      gte: new Date(filters.dateRange.start),
      lte: new Date(filters.dateRange.end)
    };
  }

  const movements = await context.entities.InventoryMovement.findMany({
    where: movementWhere,
    include: {
      product: true
    }
  });

  // Aggregate data
  const strainBreakdown = { Sativa: 0, Hybrid: 0, Indica: 0, 'N/A': 0 };
  const brandStats = {};
  const categoryStats = {};
  const productSales = {};
  let totalProducts = 0;
  let totalValue = 0;
  const storePerformance = [];

  // Collect all categories and brands for filter options
  const allCategories = new Set();
  const allSubcategories = new Set();
  const allBrands = new Set();

  stores.forEach(store => {
    let storeValue = 0;
    let storeProducts = 0;

    store.stockLevels.forEach(stock => {
      const product = stock.product;
      storeProducts += 1;
      totalProducts += 1;
      const value = stock.quantity * (product.retailPrice || 0);
      storeValue += value;
      totalValue += value;

      // Strain breakdown
      const strain = product.strainType || 'N/A';
      if (strainBreakdown[strain] !== undefined) {
        strainBreakdown[strain] += stock.quantity;
      }

      // Brand stats
      const brand = product.brand || 'Unknown';
      if (!brandStats[brand]) {
        brandStats[brand] = { value: 0, quantity: 0, products: 0 };
      }
      brandStats[brand].value += value;
      brandStats[brand].quantity += stock.quantity;
      brandStats[brand].products += 1;

      // Category stats
      const category = product.parentCategory || 'Uncategorized';
      if (!categoryStats[category]) {
        categoryStats[category] = { value: 0, quantity: 0, products: 0 };
      }
      categoryStats[category].value += value;
      categoryStats[category].quantity += stock.quantity;
      categoryStats[category].products += 1;

      // Collect filter options
      if (product.parentCategory) allCategories.add(product.parentCategory);
      if (product.subcategory) allSubcategories.add(product.subcategory);
      if (product.brand) allBrands.add(product.brand);
    });

    storePerformance.push({
      storeId: store.id,
      name: store.name,
      location: store.location,
      products: storeProducts,
      value: storeValue
    });
  });

  // Process sales movements
  movements.forEach(movement => {
    const productId = movement.product.id;
    if (!productSales[productId]) {
      productSales[productId] = {
        product: movement.product,
        unitsSold: 0,
        revenue: 0
      };
    }
    const unitsSold = Math.abs(movement.changeQty);
    productSales[productId].unitsSold += unitsSold;
    productSales[productId].revenue += unitsSold * (movement.product.retailPrice || 0);
  });

  // Top products
  const topProductsByRevenue = Object.values(productSales)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map(item => ({
      name: item.product.name,
      gtin: item.product.gtin,
      brand: item.product.brand,
      unitsSold: item.unitsSold,
      revenue: item.revenue,
      strainType: item.product.strainType
    }));

  const topProductsByUnits = Object.values(productSales)
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, 10)
    .map(item => ({
      name: item.product.name,
      gtin: item.product.gtin,
      brand: item.product.brand,
      unitsSold: item.unitsSold,
      revenue: item.revenue,
      strainType: item.product.strainType
    }));

  // Top brands
  const topBrands = Object.keys(brandStats)
    .map(brand => ({
      brand,
      value: brandStats[brand].value,
      quantity: brandStats[brand].quantity,
      products: brandStats[brand].products
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Category performance
  const categoryPerformance = Object.keys(categoryStats)
    .map(category => ({
      category,
      value: categoryStats[category].value,
      quantity: categoryStats[category].quantity,
      products: categoryStats[category].products
    }))
    .sort((a, b) => b.value - a.value);

  storePerformance.sort((a, b) => b.value - a.value);

  return {
    totalStores: stores.length,
    totalProducts,
    totalValue,
    strainBreakdown,
    topBrands,
    topProductsByRevenue,
    topProductsByUnits,
    categoryPerformance,
    storePerformance,
    hasMovementData: movements.length > 0,
    // Filter options for UI
    availableCategories: Array.from(allCategories).sort(),
    availableSubcategories: Array.from(allSubcategories).sort(),
    availableBrands: Array.from(allBrands).sort()
  };
};
