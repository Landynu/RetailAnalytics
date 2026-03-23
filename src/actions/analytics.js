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
 * Clear ordering/analytics caches to force fresh data on next query.
 * Keep this aligned with the broader invalidation used after inventory uploads
 * so a manual refresh can recover from stale Redis state without a redeploy.
 */
export const clearAnalyticsCache = async (_args, context) => {
  if (!context.user) { throw new HttpError(401) }

  // Clear all analytics-related caches, including base datasets used by Ordering.
  const patterns = [
    'cache:base:*',                  // Base product, rankings, sales totals, purchase orders
    'cache:recent_sales:*',          // Recent weekly summary activity cache
    'cache:recent_sales_movements:*', // Recent raw movement cache
    'cache:older_sales:*',           // Historical weekly summary cache
    'cache:filter_options:*',        // Filter option cache
    'cache:sparklines:*',            // Trend sparklines
    'cache:sales_totals:*',          // Non-base sales aggregations
    'cache:products_paginated:*',    // Paginated product result caches
    'cache:purchase_orders:*',       // Purchase order caches
    'cache:rankings:*',              // Legacy/general ranking caches
    'cache:brands_distributors*'     // Brand/distributor lists
  ];

  let totalDeleted = 0;
  for (const pattern of patterns) {
    const deleted = await invalidateCachePattern(pattern);
    totalDeleted += deleted;
  }

  return { success: true, keysCleared: totalDeleted };
};
