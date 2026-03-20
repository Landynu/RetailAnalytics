// Helper function to filter products in-memory
export function filterProductsInMemory(products, filters) {
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

/**
 * Calculate inclusive week boundaries (Monday 00:00 to Sunday 23:59:59.999).
 * Used for filtering movement/snapshot data within complete weeks.
 * Note: src/cache/warmCache.js has calculateWeekBucketBoundaries which
 * returns Monday-to-Monday boundaries for weekly bucket alignment.
 */
export function calculateWeekBoundaries(startDate, endDate) {
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
