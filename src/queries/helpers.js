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

function getMondayStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function getSundayEnd(date) {
  const d = getMondayStart(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Calculate inclusive week boundaries (Monday 00:00 to Sunday 23:59:59.999).
 * Used for filtering movement/snapshot data within complete weeks.
 * Note: src/cache/warmCache.js has calculateWeekBucketBoundaries which
 * returns Monday-to-Monday boundaries for weekly bucket alignment.
 */
export function calculateWeekBoundaries(startDate, endDate) {
  return {
    start: getMondayStart(startDate),
    end: getSundayEnd(endDate)
  };
}

/**
 * Returns the range of full weeks that are fully contained in the selected
 * date range and safe to read from WeeklySalesSummary.
 *
 * Partial boundary weeks are intentionally excluded so callers can fall back
 * to InventoryMovement for exact-date math without overcounting.
 */
export function calculateCompleteSummaryWeekRange(startDate, endDate, currentDate = new Date()) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const currentWeekStart = getMondayStart(currentDate);

  let firstFullWeekStart = getMondayStart(start);
  if (start.getTime() > firstFullWeekStart.getTime()) {
    firstFullWeekStart.setDate(firstFullWeekStart.getDate() + 7);
  }

  let lastFullWeekStart = getMondayStart(end);
  if (end.getTime() < getSundayEnd(end).getTime()) {
    lastFullWeekStart.setDate(lastFullWeekStart.getDate() - 7);
  }

  if (lastFullWeekStart.getTime() >= currentWeekStart.getTime()) {
    lastFullWeekStart = new Date(currentWeekStart);
    lastFullWeekStart.setDate(lastFullWeekStart.getDate() - 7);
  }

  if (firstFullWeekStart.getTime() > lastFullWeekStart.getTime()) {
    return {
      start: null,
      endExclusive: null,
      currentWeekStart
    };
  }

  const endExclusive = new Date(lastFullWeekStart);
  endExclusive.setDate(endExclusive.getDate() + 7);

  return {
    start: firstFullWeekStart,
    endExclusive,
    currentWeekStart
  };
}
