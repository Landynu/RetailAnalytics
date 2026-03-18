import { HttpError } from 'wasp/server'

export const getStoreAnalytics = async ({ storeId, excludeCategories = ['Accessories', 'Accessory'] }, context) => {
  if (!context.user) { throw new HttpError(401) }

  const store = await context.entities.Store.findUnique({
    where: { id: parseInt(storeId) }
  });

  if (!store) {
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

export const getGlobalAnalyticsFiltered = async ({
  storeIds = null,
  filters = {}
}, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Build where clause for stores - only active stores
  const storeWhere = {
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

  // Get filtered stores with stock levels - optimized with selective fields
  const stores = await context.entities.Store.findMany({
    where: storeWhere,
    select: {
      id: true,
      name: true,
      location: true,
      stockLevels: {
        where: {
          product: productWhere,
          ...(filters.stockStatus === 'inStock' ? { quantity: { gt: 0 } } : {}),
          ...(filters.stockStatus === 'lowStock' ? { quantity: { gt: 0, lt: 5 } } : {}),
          ...(filters.stockStatus === 'outOfStock' ? { quantity: 0 } : {})
        },
        select: {
          quantity: true,
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
          }
        }
      }
    }
  });

  // Get movements for sales data (type='sale' only) - only if we have product filters
  const movementWhere = {
    type: 'sale', // Only actual sales
    ...(storeIds && storeIds.length > 0 ? { storeId: { in: storeIds.map(id => parseInt(id)) } } : {}),
    ...(Object.keys(productWhere).length > 0 ? { product: productWhere } : {})
  };

  if (filters.dateRange) {
    movementWhere.date = {
      gte: new Date(filters.dateRange.start),
      lte: new Date(filters.dateRange.end)
    };
  }

  // Fetch movements with minimal fields - only what we need for aggregation
  const movements = await context.entities.InventoryMovement.findMany({
    where: movementWhere,
    select: {
      id: true,
      changeQty: true,
      product: {
        select: {
          id: true,
          name: true,
          gtin: true,
          brand: true,
          strainType: true,
          retailPrice: true
        }
      }
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
