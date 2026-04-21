// Categories excluded from analytics/ordering by default (non-cannabis products)
export const EXCLUDED_CATEGORIES = ['Accessories', 'Accessory', 'VPT'];

// Strain type color mapping for Recharts visualizations
export const STRAIN_COLORS = {
  Sativa: '#10b981',
  Hybrid: '#f59e0b',
  Indica: '#8b5cf6',
  'N/A': '#6b7280'
};

// localStorage key constants
export const LS_KEYS = {
  HIDE_ACCESSORIES: 'hideAccessories',
  HIDE_ZERO_INVENTORY: 'hideZeroInventory',
  FILTERS: 'retailAnalyticsFilters',
  FILTERS_VERSION: 'retailAnalyticsFiltersVersion',
  DASHBOARD_VIEW: 'dashboardView',
  SHOW_ONLY_FAVORITES: 'showOnlyFavorites',
};

export const CURRENT_FILTERS_VERSION = '2.0';

// Transfer planner defaults
export const TRANSFER_DEFAULTS = {
  TARGET_WEEKS: 2,
  TOP_SELLER_BONUS_WEEKS: 1,
  STALE_DAYS_THRESHOLD: 30,
  CATEGORY_GAP_THRESHOLD: 0.5,
};
