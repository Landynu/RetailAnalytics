import { HttpError } from 'wasp/server'

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

  // Fetch daily movements - optimized with minimal fields
  // Removed orderBy to let database optimize query execution
  const movements = await context.entities.InventoryMovement.findMany({
    where: movementWhere,
    select: {
      id: true,
      date: true,
      changeQty: true,
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
    }
    // Removed orderBy - sort in memory if needed for better query performance
  });

  console.log('📊 Daily movements fetched:', movements.length);

  // Sort movements by date for consistent processing (in-memory sort is fast)
  movements.sort((a, b) => a.date - b.date);

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
