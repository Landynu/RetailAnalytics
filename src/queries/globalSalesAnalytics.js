import { HttpError } from 'wasp/server'

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
