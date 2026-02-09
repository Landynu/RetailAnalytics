import { filterProductsInMemory } from './helpers.js'

/**
 * Generate a ranking group key based on Power BI conditional logic:
 * 1. Flower → Group by Format + Parent Category
 * 2. Other with subcategory → Group by Subcategory only
 * 3. Other without subcategory → Group by Parent Category
 */
export function getRankingGroupKey(product) {
  const parentCategory = product.parentCategory || '';
  const subcategory = product.subcategory || '';
  const format = product.format || '';
  const isFlower = parentCategory === 'Flower';
  const hasSubcategory = subcategory && subcategory.trim() !== '';

  if (isFlower) {
    return `${parentCategory}|${format}`;
  } else if (hasSubcategory) {
    return `subcat:${subcategory}`;
  } else {
    return `parent_no_subcat:${parentCategory}`;
  }
}

/**
 * Calculate category rankings for products using Power BI-style conditional grouping.
 * Only includes products with inventory > 0.
 * @returns {Map} productId -> { categoryRank, categoryTotal, isTop10 }
 */
export function calculateCategoryRankings(allProductIdsForRankings, salesMap) {
  const rankingGroups = {};
  allProductIdsForRankings.forEach(p => {
    if (p.totalInventory <= 0) return;

    const groupKey = getRankingGroupKey(p);
    if (!rankingGroups[groupKey]) rankingGroups[groupKey] = [];

    const productSales = salesMap.get(p.id);
    const totalSalesForRanking = productSales ? productSales.totalSales : 0;

    rankingGroups[groupKey].push({
      id: p.id,
      totalSales: totalSalesForRanking
    });
  });

  const rankingsMap = new Map();
  Object.keys(rankingGroups).forEach(groupKey => {
    rankingGroups[groupKey].sort((a, b) => b.totalSales - a.totalSales);
    const groupTotal = rankingGroups[groupKey].length;

    rankingGroups[groupKey].forEach((p, idx) => {
      rankingsMap.set(p.id, {
        categoryRank: idx + 1,
        categoryTotal: groupTotal,
        isTop10: idx < 10
      });
    });
  });

  return rankingsMap;
}

/**
 * Process sparkline data and attach to products.
 * Groups weekly sales by product and calculates totals per week.
 */
export function processSparklineData(sparklineData, products, loadAll) {
  if (!loadAll || !sparklineData || sparklineData.length === 0) {
    products.forEach(product => {
      product.sparklineData = [];
    });
    return;
  }

  const sparklineByProduct = {};
  sparklineData.forEach(data => {
    if (!sparklineByProduct[data.productId]) {
      sparklineByProduct[data.productId] = [];
    }
    const weekStartDate = data.weekStart instanceof Date
      ? data.weekStart
      : new Date(data.weekStart);
    sparklineByProduct[data.productId].push({
      week: weekStartDate,
      units: data.unitsSold
    });
  });

  products.forEach(product => {
    const productSparkline = sparklineByProduct[product.id] || [];
    const weeklyTotals = {};
    productSparkline.forEach(point => {
      const weekDate = point.week instanceof Date
        ? point.week
        : new Date(point.week);
      const weekKey = weekDate.toISOString().split('T')[0];
      weeklyTotals[weekKey] = (weeklyTotals[weekKey] || 0) + point.units;
    });
    product.sparklineData = Object.keys(weeklyTotals)
      .sort()
      .map(week => weeklyTotals[week]);
  });
}

/**
 * Build context-aware filter options from base products.
 * Each filter excludes itself from consideration to show available options.
 */
export function buildFilterOptions(baseProducts, filters, includeHiddenCategories) {
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

  const brandOptions = [...new Set(brandFiltered.map(p => p.brand).filter(Boolean))];
  const categoryOptions = [...new Set(baseProducts.map(p => p.parentCategory).filter(Boolean))];
  const subcategoryOptions = [...new Set(subcategoryFiltered.map(p => p.subcategory).filter(Boolean))];
  const unitsOptions = [...new Set(unitsFiltered.map(p => p.unitCount).filter(Boolean))];
  const sizesOptions = [...new Set(sizesFiltered.map(p => p.unitSize).filter(Boolean))];

  const smartBrands = brandOptions.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const allCategoriesSet = new Set(categoryOptions);
  if (!includeHiddenCategories) {
    allCategoriesSet.add('Accessories');
    allCategoriesSet.add('VPT');
  }

  return {
    brands: smartBrands,
    categories: Array.from(allCategoriesSet).sort(),
    subcategories: subcategoryOptions.sort(),
    units: unitsOptions.sort((a, b) => a - b),
    sizes: sizesOptions.sort()
  };
}

/**
 * Build brand-distributor mapping from brand entities.
 * @returns {Map} brandName -> [{ id, name, isPrimary }]
 */
export function buildBrandDistributorMap(brandsWithDistributors) {
  const brandDistributorMap = new Map();
  brandsWithDistributors.forEach(brand => {
    brandDistributorMap.set(brand.name, brand.distributors.map(bd => ({
      id: bd.distributor.id,
      name: bd.distributor.name,
      isPrimary: bd.isPrimary
    })));
  });
  return brandDistributorMap;
}

/**
 * Build sales matrix for top 20 products by sales.
 */
export function buildSalesMatrix(allFilteredSalesMap, stores, context) {
  const topProductIds = Array.from(allFilteredSalesMap.entries())
    .sort((a, b) => b[1].totalSales - a[1].totalSales)
    .slice(0, 20)
    .map(([productId]) => productId);

  return { topProductIds, stores };
}

/**
 * Calculate strain counts from filtered products.
 */
export function calculateStrainCounts(filteredProducts, primaryStore) {
  const strainCounts = { Hybrid: 0, Sativa: 0, Indica: 0 };
  filteredProducts.forEach(p => {
    const strain = p.strainType;
    if (strain && strain !== 'N/A' && strainCounts[strain] !== undefined) {
      strainCounts[strain]++;
    }
  });

  const primaryStoreStrainCounts = { Hybrid: 0, Sativa: 0, Indica: 0 };
  if (primaryStore) {
    filteredProducts.forEach(p => {
      const hasStock = p.stockLevels?.some(sl => sl.storeId === primaryStore.id && sl.quantity > 0);
      if (hasStock) {
        const strain = p.strainType;
        if (strain && strain !== 'N/A' && primaryStoreStrainCounts[strain] !== undefined) {
          primaryStoreStrainCounts[strain]++;
        }
      }
    });
  }

  return { strainCounts, primaryStoreStrainCounts };
}
