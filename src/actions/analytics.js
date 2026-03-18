import { HttpError } from 'wasp/server';
import { invalidateCachePattern } from '../cache.js';

export const exportAnalyticsData = async ({ storeIds, filters }, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Get the filtered analytics data using the query logic
  const analyticsData = await context.entities.Store.findMany({
    where: {
      ...(storeIds && storeIds.length > 0 ? { id: { in: storeIds.map(id => parseInt(id)) } } : {})
    },
    include: {
      stockLevels: {
        include: {
          product: true
        }
      }
    }
  });

  // Format data for CSV export
  const csvRows = [];
  csvRows.push(['Store', 'Product', 'GTIN', 'Brand', 'Category', 'Subcategory', 'Strain Type', 'Quantity', 'Retail Price', 'Total Value']);

  analyticsData.forEach(store => {
    store.stockLevels.forEach(stock => {
      const product = stock.product;

      // Apply filters if provided
      if (filters) {
        if (filters.categories && filters.categories.length > 0 && !filters.categories.includes(product.parentCategory)) {
          return;
        }
        if (filters.subcategories && filters.subcategories.length > 0 && !filters.subcategories.includes(product.subcategory)) {
          return;
        }
        if (filters.brands && filters.brands.length > 0 && !filters.brands.includes(product.brand)) {
          return;
        }
        if (filters.strainTypes && filters.strainTypes.length > 0 && !filters.strainTypes.includes(product.strainType)) {
          return;
        }
      }

      const totalValue = stock.quantity * (product.retailPrice || 0);
      csvRows.push([
        store.name,
        product.name,
        product.gtin,
        product.brand || '',
        product.parentCategory || '',
        product.subcategory || '',
        product.strainType || '',
        stock.quantity,
        product.retailPrice || 0,
        totalValue.toFixed(2)
      ]);
    });
  });

  // Convert to CSV string
  const csvContent = csvRows.map(row =>
    row.map(cell => {
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      const cellStr = String(cell);
      if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
        return `"${cellStr.replace(/"/g, '""')}"`;
      }
      return cellStr;
    }).join(',')
  ).join('\n');

  return {
    csv: csvContent,
    filename: `analytics-export-${new Date().toISOString().split('T')[0]}.csv`,
    rowCount: csvRows.length - 1 // Exclude header
  };
};

/**
 * Clear analytics-related caches to force fresh data on next query
 * This clears: rankings, sales totals, sparklines, and other computed metrics
 * Does NOT clear base product data or historical imports
 */
export const clearAnalyticsCache = async (_args, context) => {
  if (!context.user) { throw new HttpError(401) }

  console.log(`[CACHE] Clearing analytics caches for user ${context.user.id}`);

  // Clear all analytics-related caches
  const patterns = [
    'cache:base:rankings*',      // 14-day rankings data
    'cache:base:sales_totals*',  // Sales aggregations
    'cache:sparklines*',         // Trend sparklines
    'cache:recent_sales*',       // Recent sales movements
    'cache:older_sales*',        // Historical sales data
    'cache:brands_distributors*' // Brand/distributor lists
  ];

  let totalDeleted = 0;
  for (const pattern of patterns) {
    const deleted = await invalidateCachePattern(pattern);
    totalDeleted += deleted;
    console.log(`[CACHE] Cleared ${deleted} keys matching: ${pattern}`);
  }

  console.log(`[CACHE] Total analytics cache keys cleared: ${totalDeleted}`);

  return { success: true, keysCleared: totalDeleted };
};
