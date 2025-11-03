import { HttpError } from 'wasp/server'

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
  includeHiddenCategories = false
}, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Default to 14 days if no date range provided
  const endDate = dateRange?.end ? new Date(dateRange.end) : new Date();
  const startDate = dateRange?.start ? new Date(dateRange.start) : new Date(endDate.getTime() - 14 * 24 * 60 * 60 * 1000);
  const periodDays = Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000));

  // Build store filter
  const storeWhere = { userId: context.user.id, isActive: true };
  if (storeIds && storeIds.length > 0) {
    storeWhere.id = { in: storeIds.map(id => parseInt(id)) };
  }

  // Get user's active stores
  const stores = await context.entities.Store.findMany({
    where: storeWhere,
    select: { id: true, name: true, location: true }
  });

  const storeIdList = stores.map(s => s.id);

  // 30-day activity filter: Only show products with recent activity
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Calculate 12 weeks ago for sparkline data
  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84); // 12 weeks

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
          // OR has sales in last 30 days
          { movements: { some: {
            storeId: { in: storeIdList },
            type: 'sale',
            date: { gte: thirtyDaysAgo }
          }}}
        ]
      },
      // Exclude Accessories/VPT unless explicitly requested
      ...(includeHiddenCategories ? [] : [
        { parentCategory: { notIn: ['Accessories', 'Accessory', 'VPT'] } }
      ])
    ]
  };

  // Get all products with base filter only (for rankings and filter options)
  const allProducts = await context.entities.ProductCatalog.findMany({
    where: baseProductWhere,
    include: {
      stockLevels: {
        where: { storeId: { in: storeIdList } },
        include: { store: { select: { id: true, name: true } } }
      },
      movements: {
        where: {
          storeId: { in: storeIdList },
          OR: [
            // Get sales within the date range
            {
              type: 'sale',
              date: { gte: startDate, lte: endDate }
            },
            // Get ALL purchase order movements (not date filtered) for Days Since PO
            {
              type: 'purchase order'
            }
          ]
        },
        orderBy: { date: 'desc' }
      }
    }
  });

  // Calculate metrics for ALL products (for rankings)
  const allProductMetrics = [];
  
  for (const product of allProducts) {
    // Skip if no inventory across all locations
    const totalInventory = product.stockLevels.reduce((sum, sl) => sum + sl.quantity, 0);
    if (totalInventory === 0 && product.movements.length === 0) continue;

    // Calculate sales in period
    const salesMovements = product.movements.filter(m => m.type === 'sale');
    const totalSales = salesMovements.reduce((sum, m) => sum + Math.abs(m.changeQty), 0);
    
    // Calculate velocity (units per week)
    const weeksInPeriod = periodDays / 7;
    const velocity = weeksInPeriod > 0 ? totalSales / weeksInPeriod : 0;
    
    // Calculate weeks of inventory left
    const weeksLeft = velocity > 0 ? totalInventory / velocity : 999;
    
    // Days since last sale
    const lastSaleDate = salesMovements.length > 0 ? salesMovements[0].date : null;
    const daysSinceLastSale = lastSaleDate ? Math.floor((endDate - lastSaleDate) / (24 * 60 * 60 * 1000)) : null;
    
    // Days since last purchase order
    const poMovements = product.movements.filter(m => m.type === 'purchase order');
    const lastPO = poMovements.length > 0 ? poMovements[0] : null;
    const lastPODate = lastPO ? lastPO.date : null;
    const lastPOQty = lastPO ? Math.abs(lastPO.changeQty) : null;
    const daysSinceLastPO = lastPODate ? Math.floor((endDate - lastPODate) / (24 * 60 * 60 * 1000)) : null;
    
    // Debug logging for first 3 products to verify purchase movements
    if (allProductMetrics.length < 3 && poMovements.length > 0) {
      console.log(`📦 Product ${product.name}: Found ${poMovements.length} purchase movements`, {
        lastPODate,
        daysSinceLastPO,
        lastPOQty
      });
    }
    
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

    // Per-location sales (as array for serialization)
    const locationSales = [];
    const salesByStore = {};
    salesMovements.forEach(m => {
      if (!salesByStore[m.storeId]) {
        salesByStore[m.storeId] = 0;
      }
      salesByStore[m.storeId] += Math.abs(m.changeQty);
    });
    Object.keys(salesByStore).forEach(storeId => {
      locationSales.push({
        storeId: parseInt(storeId),
        units: salesByStore[storeId]
      });
    });

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

  // Calculate category rankings using ALL products (not filtered)
  const categoryGroups = {};
  allProductMetrics.forEach(p => {
    const cat = p.parentCategory || 'Uncategorized';
    if (!categoryGroups[cat]) categoryGroups[cat] = [];
    categoryGroups[cat].push(p);
  });

  // Assign ranks based on full dataset
  const rankingsMap = new Map();
  Object.keys(categoryGroups).forEach(cat => {
    categoryGroups[cat].sort((a, b) => b.totalSales - a.totalSales);
    categoryGroups[cat].forEach((p, idx) => {
      rankingsMap.set(p.id, {
        categoryRank: idx + 1,
        isTop10: idx < 10
      });
    });
  });

  // Now apply user filters to get the displayed products
  const filteredProducts = allProductMetrics.filter(p => {
    // Apply brand filter
    if (filters.brands && filters.brands.length > 0) {
      if (!filters.brands.includes(p.brand)) return false;
    }
    
    // Apply category filter
    if (filters.categories && filters.categories.length > 0) {
      if (!filters.categories.includes(p.parentCategory)) return false;
    }
    
    // Apply subcategory filter
    if (filters.subcategories && filters.subcategories.length > 0) {
      if (!filters.subcategories.includes(p.subcategory)) return false;
    }
    
    // Apply unit count filter
    if (filters.units && filters.units.length > 0) {
      if (!filters.units.includes(p.unitCount)) return false;
    }
    
    // Apply unit size filter
    if (filters.sizes && filters.sizes.length > 0) {
      if (!filters.sizes.includes(p.unitSize)) return false;
    }
    
    return true;
  });

  // Apply rankings to filtered products
  filteredProducts.forEach(p => {
    const ranking = rankingsMap.get(p.id);
    if (ranking) {
      p.categoryRank = ranking.categoryRank;
      p.isTop10 = ranking.isTop10;
    }
  });

  // Sort by velocity (fastest movers first)
  filteredProducts.sort((a, b) => b.velocity - a.velocity);

  // Calculate total count before pagination
  const totalCount = filteredProducts.length;
  const hasMore = offset + limit < totalCount;

  // Calculate strain counts from ALL filtered products (not just paginated)
  const strainCounts = { Hybrid: 0, Sativa: 0, Indica: 0 };
  filteredProducts.forEach(p => {
    const strain = p.strainType;
    if (strain && strain !== 'N/A' && strainCounts[strain] !== undefined) {
      strainCounts[strain]++;
    }
  });

  // Calculate per-location inventory counts from ALL filtered products
  const locationInventoryCounts = stores.map(store => {
    const productsWithInventory = filteredProducts.filter(p => 
      p.locationInventory.some(loc => loc.storeId === store.id && loc.quantity > 0)
    );
    return {
      storeId: store.id,
      storeName: store.name,
      count: productsWithInventory.length
    };
  });

  // Apply pagination FIRST
  const paginatedProducts = filteredProducts.slice(offset, offset + limit);

  // Fetch sparkline data for paginated products ONLY (performance optimization)
  const paginatedProductIds = paginatedProducts.map(p => p.id);
  
  // Get weekly sales summaries for sparklines (last 12 weeks)
  const sparklineData = await context.entities.WeeklySalesSummary.findMany({
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
  });

  // Organize sparkline data by product
  const sparklineByProduct = {};
  sparklineData.forEach(data => {
    if (!sparklineByProduct[data.productId]) {
      sparklineByProduct[data.productId] = [];
    }
    sparklineByProduct[data.productId].push({
      week: data.weekStart,
      units: data.unitsSold
    });
  });

  // Attach sparkline data to paginated products
  paginatedProducts.forEach(product => {
    const productSparkline = sparklineByProduct[product.id] || [];
    // Group by week and sum units across all stores
    const weeklyTotals = {};
    productSparkline.forEach(point => {
      const weekKey = point.week.toISOString().split('T')[0];
      weeklyTotals[weekKey] = (weeklyTotals[weekKey] || 0) + point.units;
    });
    // Convert to array of weekly values (last 12 weeks)
    product.sparklineData = Object.keys(weeklyTotals)
      .sort()
      .map(week => weeklyTotals[week]);
  });

  // Calculate sales matrix data (top 20 products by sales from ALL filtered products, not just paginated)
  const topProducts = [...filteredProducts]
    .sort((a, b) => b.totalSales - a.totalSales)
    .slice(0, 20);

  const salesMatrix = topProducts.map(p => {
    const salesByLocation = {};
    stores.forEach(store => {
      const locationSale = p.locationSales.find(s => s.storeId === store.id);
      salesByLocation[store.name] = locationSale ? locationSale.units : 0;
    });
    return {
      productName: p.name,
      brand: p.brand,
      category: p.parentCategory,
      ...salesByLocation,
      total: p.totalSales
    };
  });

  // Calculate location totals from all filtered products
  const locationTotals = stores.map(store => {
    const storeProducts = filteredProducts.filter(p => 
      p.locationInventory.find(l => l.storeId === store.id && l.quantity > 0)
    );
    return {
      storeName: store.name,
      productCount: storeProducts.length
    };
  });

  // Get the latest movement timestamp for display
  const latestMovement = await context.entities.InventoryMovement.findFirst({
    where: {
      storeId: { in: storeIdList }
    },
    orderBy: { date: 'desc' },
    select: { date: true }
  });

  const lastUpdate = latestMovement?.date || new Date();

  console.log('📦 Ordering analytics result:', {
    totalProducts: allProducts.length,
    filteredProducts: filteredProducts.length,
    paginatedProducts: paginatedProducts.length,
    offset,
    limit,
    totalCount,
    hasMore,
    periodDays,
    dateRange: `${startDate.toISOString()} to ${endDate.toISOString()}`,
    lastUpdate: lastUpdate.toISOString()
  });

  // Fetch brand-distributor mappings
  const brandsWithDistributors = await context.entities.Brand.findMany({
    include: {
      distributors: {
        include: { distributor: true },
        orderBy: { isPrimary: 'desc' }
      }
    }
  })

  const brandDistributorMap = new Map()
  brandsWithDistributors.forEach(brand => {
    brandDistributorMap.set(brand.name, brand.distributors.map(bd => ({
      id: bd.distributor.id,
      name: bd.distributor.name,
      isPrimary: bd.isPrimary
    })))
  })

  // Attach distributor data to paginated products
  paginatedProducts.forEach(product => {
    product.distributors = brandDistributorMap.get(product.brand) || []
  })

  // Get all distributors for filter
  const allDistributors = await context.entities.Distributor.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' }
  })

  // Build smart brand filter list from products matching NON-brand filters
  // This ensures brands are context-aware of other filters but not self-filtering
  const filterOptionsProducts = allProductMetrics.filter(p => {
    // Apply category filter
    if (filters.categories && filters.categories.length > 0) {
      if (!filters.categories.includes(p.parentCategory)) return false;
    }
    // Apply subcategory filter
    if (filters.subcategories && filters.subcategories.length > 0) {
      if (!filters.subcategories.includes(p.subcategory)) return false;
    }
    // Apply unit count filter
    if (filters.units && filters.units.length > 0) {
      if (!filters.units.includes(p.unitCount)) return false;
    }
    // Apply unit size filter
    if (filters.sizes && filters.sizes.length > 0) {
      if (!filters.sizes.includes(p.unitSize)) return false;
    }
    // NO brand filter applied here - that's the whole point!
    return true;
  });

  // Extract unique values for filters
  // Brands: Smart filter based on other filters (excludes brand filter itself)
  const smartBrands = [...new Set(filterOptionsProducts.map(p => p.brand).filter(Boolean))].sort();
  
  // Categories: Always show all available (including hidden ones for toggle)
  const allCategoriesSet = new Set(allProducts.map(p => p.parentCategory).filter(Boolean));
  // Add hidden categories to filter list even if not in results
  if (!includeHiddenCategories) {
    allCategoriesSet.add('Accessories');
    allCategoriesSet.add('VPT');
  }
  const allCategories = Array.from(allCategoriesSet).sort();
  
  // Subcategories: Content-aware based on category/brand/size/count filters (but not subcategory itself)
  const subcategoryProducts = allProductMetrics.filter(p => {
    if (filters.categories && filters.categories.length > 0) {
      if (!filters.categories.includes(p.parentCategory)) return false;
    }
    if (filters.brands && filters.brands.length > 0) {
      if (!filters.brands.includes(p.brand)) return false;
    }
    if (filters.units && filters.units.length > 0) {
      if (!filters.units.includes(p.unitCount)) return false;
    }
    if (filters.sizes && filters.sizes.length > 0) {
      if (!filters.sizes.includes(p.unitSize)) return false;
    }
    // NO subcategory filter applied here
    return true;
  });
  const allSubcategories = [...new Set(subcategoryProducts.map(p => p.subcategory).filter(Boolean))].sort();
  
  // Units (Count): Content-aware based on category/subcategory/brand/size filters (but not units itself)
  const unitsProducts = allProductMetrics.filter(p => {
    if (filters.categories && filters.categories.length > 0) {
      if (!filters.categories.includes(p.parentCategory)) return false;
    }
    if (filters.subcategories && filters.subcategories.length > 0) {
      if (!filters.subcategories.includes(p.subcategory)) return false;
    }
    if (filters.brands && filters.brands.length > 0) {
      if (!filters.brands.includes(p.brand)) return false;
    }
    if (filters.sizes && filters.sizes.length > 0) {
      if (!filters.sizes.includes(p.unitSize)) return false;
    }
    // NO units filter applied here - that's the whole point!
    return true;
  });
  const allUnits = [...new Set(unitsProducts.map(p => p.unitCount).filter(Boolean))].sort((a, b) => a - b);
  
  // Sizes: Content-aware based on category/subcategory/brand/count filters (but not sizes itself)
  const sizesProducts = allProductMetrics.filter(p => {
    if (filters.categories && filters.categories.length > 0) {
      if (!filters.categories.includes(p.parentCategory)) return false;
    }
    if (filters.subcategories && filters.subcategories.length > 0) {
      if (!filters.subcategories.includes(p.subcategory)) return false;
    }
    if (filters.brands && filters.brands.length > 0) {
      if (!filters.brands.includes(p.brand)) return false;
    }
    if (filters.units && filters.units.length > 0) {
      if (!filters.units.includes(p.unitCount)) return false;
    }
    // NO sizes filter applied here - that's the whole point!
    return true;
  });
  const allSizes = [...new Set(sizesProducts.map(p => p.unitSize).filter(Boolean))].sort();

  return {
    products: paginatedProducts,
    totalCount,
    hasMore,
    offset,
    limit,
    salesMatrix,
    locationTotals,
    stores: stores.map(s => ({ id: s.id, name: s.name, location: s.location })),
    dateRange: { start: startDate.toISOString(), end: endDate.toISOString() },
    periodDays,
    lastUpdate: lastUpdate.toISOString(),
    strainCounts, // Counts from ALL filtered products
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
