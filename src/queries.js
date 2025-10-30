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

  // Get all user's stores
  const stores = await context.entities.Store.findMany({
    where: { userId: context.user.id },
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

  // Build where clause for stores
  const storeWhere = { userId: context.user.id };
  if (storeIds && storeIds.length > 0) {
    storeWhere.id = { in: storeIds.map(id => parseInt(id)) };
  }

  // Build where clause for products based on filters
  const productWhere = {};
  
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

  // Base where clause for movements
  const baseMovementWhere = {
    product: productWhere
  };

  if (storeIds && storeIds.length > 0) {
    baseMovementWhere.storeId = { in: storeIds.map(id => parseInt(id)) };
  }

  if (filters.dateRange) {
    baseMovementWhere.date = {
      gte: new Date(filters.dateRange.start),
      lte: new Date(filters.dateRange.end)
    };
  }

  // Fetch sales (type='sale') and refunds (type='refund') separately
  const [salesMovements, refundMovements, transferMovements, purchaseMovements, auditMovements] = await Promise.all([
    context.entities.InventoryMovement.findMany({
      where: { ...baseMovementWhere, type: 'sale' },
      include: {
        product: true,
        store: { select: { id: true, name: true, location: true } }
      },
      orderBy: { date: 'desc' }
    }),
    context.entities.InventoryMovement.findMany({
      where: { ...baseMovementWhere, type: 'refund' },
      include: {
        product: true,
        store: { select: { id: true, name: true, location: true } }
      }
    }),
    context.entities.InventoryMovement.findMany({
      where: { ...baseMovementWhere, type: 'transfer' },
      include: { product: true, store: { select: { id: true, name: true } } }
    }),
    context.entities.InventoryMovement.findMany({
      where: { ...baseMovementWhere, type: 'purchase order' },
      include: { product: true }
    }),
    context.entities.InventoryMovement.findMany({
      where: { ...baseMovementWhere, type: 'audit' },
      include: { product: true }
    })
  ]);

  // Aggregate sales data
  let grossSales = 0;
  let grossUnits = 0;
  let refundAmount = 0;
  let refundUnits = 0;
  const productSales = {};
  const brandSales = {};
  const categorySales = {};
  const storeSales = {};
  const dailySales = {};
  const strainSales = { Sativa: 0, Hybrid: 0, Indica: 0 };

  // Process sales
  salesMovements.forEach(movement => {
    const unitsSold = Math.abs(movement.changeQty);
    const revenue = unitsSold * (movement.product.retailPrice || 0);
    
    grossUnits += unitsSold;
    grossSales += revenue;

    // Product sales
    const productId = movement.product.id;
    if (!productSales[productId]) {
      productSales[productId] = {
        product: movement.product,
        unitsSold: 0,
        revenue: 0,
        refunds: 0,
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

    // Daily sales for trends (total and by store)
    const dateKey = movement.date.toISOString().split('T')[0];
    if (!dailySales[dateKey]) {
      dailySales[dateKey] = { 
        date: dateKey, 
        grossSales: 0, 
        refunds: 0, 
        netRevenue: 0, 
        unitsSold: 0,
        byStore: {}
      };
    }
    dailySales[dateKey].grossSales += revenue;
    dailySales[dateKey].unitsSold += unitsSold;

    // Track per-store daily sales
    if (movement.store) {
      const storeName = movement.store.name.substring(0, 12);
      if (!dailySales[dateKey].byStore[storeName]) {
        dailySales[dateKey].byStore[storeName] = { revenue: 0, units: 0 };
      }
      dailySales[dateKey].byStore[storeName].revenue += revenue;
      dailySales[dateKey].byStore[storeName].units += unitsSold;
    }

    // Strain sales
    const strain = movement.product.strainType;
    if (strain && strainSales[strain] !== undefined) {
      strainSales[strain] += unitsSold;
    }
  });

  // Process refunds
  refundMovements.forEach(movement => {
    const unitsRefunded = Math.abs(movement.changeQty);
    const refundValue = unitsRefunded * (movement.product.retailPrice || 0);
    
    refundUnits += unitsRefunded;
    refundAmount += refundValue;

    // Track refunds per product
    const productId = movement.product.id;
    if (productSales[productId]) {
      productSales[productId].refunds += refundValue;
    }

    // Daily refunds
    const dateKey = movement.date.toISOString().split('T')[0];
    if (dailySales[dateKey]) {
      dailySales[dateKey].refunds += refundValue;
    }
  });

  // Calculate net revenue for daily trends
  Object.values(dailySales).forEach(day => {
    day.netRevenue = day.grossSales - day.refunds;
  });

  const netRevenue = grossSales - refundAmount;
  const netUnits = grossUnits - refundUnits;

  // Prepare per-store breakdowns for products, categories, and brands
  const productsByStore = {};
  const categoriesByStore = {};
  const brandsByStore = {};

  salesMovements.forEach(movement => {
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

  // Sales trends (daily data sorted by date)
  const salesTrends = Object.values(dailySales)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // Calculate average transaction value (net)
  const avgTransactionValue = netUnits > 0 ? netRevenue / netUnits : 0;

  // Movement type summaries
  const movementSummary = {
    totalSales: salesMovements.length,
    totalRefunds: refundMovements.length,
    totalTransfers: transferMovements.length,
    totalPurchases: purchaseMovements.length,
    totalAudits: auditMovements.length
  };

  return {
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
    totalTransactions: salesMovements.length,
    hasData: salesMovements.length > 0
  };
};

export const getGlobalAnalyticsFiltered = async ({
  storeIds = null,
  filters = {}
}, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Build where clause for stores
  const storeWhere = { userId: context.user.id };
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
