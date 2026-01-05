import React, { useState, useEffect } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getOrderingAnalytics, getOutOfStockProducts, getOrCreateOrderWorksheet, getUserStores, getDistributors, getClassifications, getCategoryDefinitions, getProductActions } from 'wasp/client/operations';
import { addToOrderWorksheet, exportOrderWorksheet, clearOrderWorksheet, enrichProductFormats, seedDistributors, syncBrands, clearAnalyticsCache } from 'wasp/client/operations';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import LocationSelector from '../components/LocationSelector';
import DateRangeFilter from '../components/DateRangeFilter';
import FilterDropdown from '../components/FilterDropdown';
import { Package, Tag, RotateCcw, Loader2, RefreshCw } from 'lucide-react';
import DataLoadingOverlay from '../components/DataLoadingOverlay';
import { formatRelativeTime } from '../lib/formatRelativeTime';
import { arrayMove } from '@dnd-kit/sortable';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useColumnOrdering } from '../lib/useColumnOrdering';
import OrderingFilters from '../components/OrderingFilters';
import OrderingTableHeader from '../components/OrderingTableHeader';
import ProductTableRow from '../components/ProductTableRow';
import StrainTypeCell from '../components/StrainTypeCell';
import CategoryCell from '../components/CategoryCell';
import SubcategoryCell from '../components/SubcategoryCell';
import SalesMatrix from '../components/SalesMatrix';
import ColumnVisibilityMenu from '../components/ColumnVisibilityMenu';
import InventoryMovementModal from '../components/InventoryMovementModal';

const OrderingDashboard = () => {
  const queryClient = useQueryClient();
  const { data: stores } = useQuery(getUserStores);
  const [selectedStoreIds, setSelectedStoreIds] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'desc' });
  const [hiddenCategories, setHiddenCategories] = useState(new Set(['Accessories', 'VPT']));
  const [visibleHiddenCategories, setVisibleHiddenCategories] = useState(new Set());
  
  // Filter stores based on selection (null = favourites, array = specific stores)
  const displayStores = React.useMemo(() => {
    if (!stores) return [];
    
    if (selectedStoreIds === null || selectedStoreIds === undefined) {
      // Default to favourites if available
      const favourites = stores.filter(s => s.isFavourite && s.isActive);
      return favourites.length > 0 ? favourites : stores.filter(s => s.isActive);
    }
    
    if (Array.isArray(selectedStoreIds) && selectedStoreIds.length === 0) {
      return []; // No stores selected
    }
    
    // Return selected stores
    return stores.filter(s => selectedStoreIds.includes(s.id));
  }, [stores, selectedStoreIds]);
  
  const { 
    columnOrder, 
    setColumnOrder, 
    orderedColumns,
    allColumnDefinitions,
    resetColumnOrder,
    resetColumnWidths,
    resetColumnVisibility,
    hiddenColumns,
    toggleColumnVisibility
  } = useColumnOrdering(displayStores);
  
  const [dateRange, setDateRange] = useState(() => {
    // Create dates in Central Time (UTC-6)
    // Get current time in Central Time
    const now = new Date();
    const centralNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));

    // Set end to end of current day in Central Time
    const end = new Date(centralNow);
    end.setHours(23, 59, 59, 999);

    // Set start to 14 days ago at start of day in Central Time
    const start = new Date(centralNow);
    start.setDate(start.getDate() - 14);
    start.setHours(0, 0, 0, 0);

    return { start: start.toISOString(), end: end.toISOString(), preset: 'last14' };
  });
  
  const [filters, setFilters] = useState({
    brands: [],
    categories: [],
    subcategories: [],
    units: [],
    sizes: [],
    distributors: []
  });

  // Stock status tab state: 'inStock' or 'outOfStock'
  const [stockTab, setStockTab] = useState('inStock');

  const [allProducts, setAllProducts] = useState([]);
  const [allAnalyticsData, setAllAnalyticsData] = useState(null);

  // Progressive loading state tracking
  const [hasInitialPageLoaded, setHasInitialPageLoaded] = useState(false);
  const [hasFullDataLoaded, setHasFullDataLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Inventory movement modal state
  const [selectedProductForMovements, setSelectedProductForMovements] = useState(null);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);

  const includeHiddenCategories = visibleHiddenCategories.size > 0;

  // Fast initial load: first 100 products with basic data
  const { 
    data: initialAnalytics, 
    isLoading: isLoadingInitialPage
  } = useQuery(
    getOrderingAnalytics,
    { 
      storeIds: selectedStoreIds, 
      dateRange, 
      filters: {}, // Empty filters - we'll filter client-side
      loadAll: false, // Fast path: only first page
      limit: 100,
      offset: 0,
      includeHiddenCategories
    }
  );

  // Background full load: all products with complete analytics
  // Start immediately in background (React Query will handle caching)
  const { 
    data: fullAnalytics, 
    isLoading: isLoadingFullData
  } = useQuery(
    getOrderingAnalytics,
    { 
      storeIds: selectedStoreIds, 
      dateRange, 
      filters: {}, // Empty filters - we'll filter client-side
      loadAll: true, // Complete analytics
      includeHiddenCategories
    }
  );

  const { data: worksheet } = useQuery(getOrCreateOrderWorksheet);
  const { data: allDistributors } = useQuery(getDistributors);
  const { data: classifications } = useQuery(getClassifications);
  const { data: categoryDefinitions } = useQuery(getCategoryDefinitions);

  // Fetch out-of-stock products only when that tab is selected (lazy loading)
  const {
    data: outOfStockData,
    isLoading: isLoadingOutOfStock
  } = useQuery(
    getOutOfStockProducts,
    {
      storeIds: selectedStoreIds,
      dateRange,
      includeHiddenCategories
    },
    { enabled: stockTab === 'outOfStock' } // Only fetch when tab is active
  );

  // Fetch active product actions for highlighting DO_NOT_REORDER items
  const { data: productActionsData } = useQuery(getProductActions, {
    status: 'ACTIVE'
  });

  // Create a set of product IDs that have DO_NOT_REORDER actions
  const doNotReorderProductIds = React.useMemo(() => {
    if (!productActionsData?.actions) return new Set();
    const ids = new Set();
    productActionsData.actions.forEach(action => {
      if (action.actionType === 'DO_NOT_REORDER') {
        ids.add(action.productId);
      }
    });
    return ids;
  }, [productActionsData]);

  // Create a map of productId -> active actions for displaying action symbols
  const productActionsMap = React.useMemo(() => {
    if (!productActionsData?.actions) return new Map();
    const map = new Map();
    productActionsData.actions.forEach(action => {
      if (!map.has(action.productId)) {
        map.set(action.productId, []);
      }
      map.get(action.productId).push(action);
    });
    return map;
  }, [productActionsData]);

  // Store initial page data when ready
  useEffect(() => {
    if (initialAnalytics && !hasInitialPageLoaded) {
      setAllAnalyticsData(initialAnalytics);
      setAllProducts(initialAnalytics.products || []);
      setHasInitialPageLoaded(true);
    }
  }, [initialAnalytics, hasInitialPageLoaded]);

  // Replace with full data when background load completes (but only if it has more data)
  useEffect(() => {
    if (fullAnalytics && !hasFullDataLoaded) {
      // Only replace if full data has more products or different data
      const fullProductCount = fullAnalytics.products?.length || 0;
      const currentProductCount = allProducts.length;

      // Replace if full data has more products or is complete
      if (fullProductCount > currentProductCount || fullAnalytics.totalCount !== undefined) {
        setAllAnalyticsData(fullAnalytics);
        setAllProducts(fullAnalytics.products || []);
        setHasFullDataLoaded(true);
      }
    }
  }, [fullAnalytics, hasFullDataLoaded, allProducts.length]);

  // Sync data when queries are refetched (after action invalidation)
  // This detects when the query data object reference changes (indicating a refetch)
  const prevFullAnalyticsRef = React.useRef(fullAnalytics);
  useEffect(() => {
    // Only run if we already loaded full data and the reference changed (indicating refetch)
    if (hasFullDataLoaded && fullAnalytics && fullAnalytics !== prevFullAnalyticsRef.current) {
      setAllAnalyticsData(fullAnalytics);
      setAllProducts(fullAnalytics.products || []);
    }
    prevFullAnalyticsRef.current = fullAnalytics;
  }, [fullAnalytics, hasFullDataLoaded]);

  // Reset loading flags when dependencies change
  useEffect(() => {
    setHasInitialPageLoaded(false);
    setHasFullDataLoaded(false);
  }, [selectedStoreIds, dateRange, includeHiddenCategories]);

  // Client-side filtering function (matches backend filterProductsInMemory logic)
  const filterProductsClientSide = React.useCallback((products, filters) => {
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
      if (filters.distributors && filters.distributors.length > 0) {
        const productDistributors = (product.distributors || []).map(d => d.name);
        const hasMatchingDistributor = filters.distributors.some(distName => 
          productDistributors.includes(distName)
        );
        if (!hasMatchingDistributor) return false;
      }
      return true;
    });
  }, []);

  // Apply client-side filtering
  const filteredProducts = React.useMemo(() => {
    if (!allProducts || allProducts.length === 0) return [];
    return filterProductsClientSide(allProducts, filters);
  }, [allProducts, filters, filterProductsClientSide]);

  // Filter products by stock status based on selected stores
  const filterByStockStatus = React.useCallback((products, tab, storesList) => {
    if (!storesList || storesList.length === 0) return [];
    const storeIdsToCheck = storesList.map(s => s.id);

    if (tab === 'inStock') {
      // In Stock: Product has inventory > 0 at ANY selected store
      return products.filter(product => {
        const hasInventoryAtSelectedStores = product.locationInventory?.some(
          loc => storeIdsToCheck.includes(loc.storeId) && loc.quantity > 0
        );
        return hasInventoryAtSelectedStores;
      });
    } else {
      // Out of Stock: Product has no inventory at ANY of the selected stores AND had sales in the period
      return products.filter(product => {
        // Must have had sales in the period
        if (!product.totalSales || product.totalSales === 0) return false;

        // Check if product has no inventory at any of the selected stores
        const hasInventoryAtSelectedStores = product.locationInventory?.some(
          loc => storeIdsToCheck.includes(loc.storeId) && loc.quantity > 0
        );
        return !hasInventoryAtSelectedStores;
      });
    }
  }, []);

  // Apply stock status filtering based on active tab
  const stockFilteredProducts = React.useMemo(() => {
    if (stockTab === 'outOfStock') {
      // Use dedicated out-of-stock query data (already filtered by the query)
      if (!outOfStockData?.products) return [];
      // Apply client-side filters to out-of-stock products
      return filterProductsClientSide(outOfStockData.products, filters);
    } else {
      // In stock: filter from main analytics data
      if (!filteredProducts || filteredProducts.length === 0) return [];
      return filterByStockStatus(filteredProducts, stockTab, displayStores);
    }
  }, [filteredProducts, stockTab, displayStores, filterByStockStatus, outOfStockData, filters, filterProductsClientSide]);

  // Calculate counts for tab badges
  const { inStockCount, outOfStockCount } = React.useMemo(() => {
    if (!displayStores || displayStores.length === 0) {
      return { inStockCount: 0, outOfStockCount: 0 };
    }

    // In stock count from main analytics
    let inStock = 0;
    if (filteredProducts && filteredProducts.length > 0) {
      const storeIdsToCheck = displayStores.map(s => s.id);
      filteredProducts.forEach(product => {
        const hasInventoryAtSelectedStores = product.locationInventory?.some(
          loc => storeIdsToCheck.includes(loc.storeId) && loc.quantity > 0
        );
        if (hasInventoryAtSelectedStores) {
          inStock++;
        }
      });
    }

    // Out of stock count from dedicated query
    const outOfStock = outOfStockData?.count || 0;

    return { inStockCount: inStock, outOfStockCount: outOfStock };
  }, [filteredProducts, displayStores, outOfStockData]);

  // DnD sensors for column reordering
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setColumnOrder((items) => {
        const oldIndex = items.indexOf(active.id);
        const newIndex = items.indexOf(over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleAddToOrder = async (product) => {
    try {
      await addToOrderWorksheet({
        productId: product.id,
        quantity: product.suggestedQty
      });
      alert(`Added ${product.name} to order (${product.suggestedCases} cases)`);
    } catch (error) {
      alert('Error adding to order: ' + error.message);
    }
  };

  const handleExportOrder = async () => {
    try {
      const result = await exportOrderWorksheet();
      const blob = new Blob([result.csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Error exporting order: ' + error.message);
    }
  };

  const handleClearOrder = async () => {
    if (confirm('Clear all items from order worksheet?')) {
      try {
        await clearOrderWorksheet();
        alert('Order worksheet cleared');
      } catch (error) {
        alert('Error clearing order: ' + error.message);
      }
    }
  };

  const handleEnrichFormats = async () => {
    if (confirm('This will update format data for all products. This may take a minute. Continue?')) {
      try {
        const result = await enrichProductFormats();
        alert(`Format enrichment complete!\n${result.updated} products updated\n${result.skipped} products skipped`);
        refetchAnalytics();
      } catch (error) {
        alert('Error enriching formats: ' + error.message);
      }
    }
  };

  const handleSeedDistributors = async () => {
    if (confirm('This will create the 7 default distributors (Direct, Open Fields, Legacy Supply, etc). Continue?')) {
      try {
        const result = await seedDistributors();
        alert(`Seed complete!\n${result.created} distributors created\n${result.total - result.created} already existed`);
        refetchAnalytics();
      } catch (error) {
        alert('Error seeding distributors: ' + error.message);
      }
    }
  };

  const handleSyncBrands = async () => {
    if (confirm('This will create Brand records from all products in your catalog. Continue?')) {
      try {
        const result = await syncBrands();
        alert(`Brand sync complete!\n${result.created} new brands created\n${result.totalBrands} total brands`);
        refetchAnalytics();
      } catch (error) {
        alert('Error syncing brands: ' + error.message);
      }
    }
  };

  const handleRefreshData = async () => {
    setIsRefreshing(true);
    try {
      // Clear server-side analytics caches first (rankings, sales totals, etc.)
      const result = await clearAnalyticsCache();
      console.log(`Cleared ${result.keysCleared} cache keys`);

      // Invalidate all React Query caches to force fresh data fetch
      await queryClient.invalidateQueries();
      // Reset loading flags to trigger fresh data load
      setHasInitialPageLoaded(false);
      setHasFullDataLoaded(false);
      setAllProducts([]);
      setAllAnalyticsData(null);

      // Wait a bit for queries to start refetching
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleProductRowClick = (product) => {
    setSelectedProductForMovements(product);
    setIsMovementModalOpen(true);
  };

  const handleCloseMovementModal = () => {
    setIsMovementModalOpen(false);
    setSelectedProductForMovements(null);
  };

  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  // Calculate filter options from all loaded products client-side
  const filterOptions = React.useMemo(() => {
    if (!allProducts || allProducts.length === 0) {
      return {
        brands: [],
        categories: [],
        subcategories: [],
        units: [],
        sizes: [],
        distributors: []
      };
    }

    // Start with all products, then apply filters one at a time to build context-aware options
    const baseProducts = allProducts;
    
    // Build brand options (excluding current brand filter)
    const brandFiltered = filterProductsClientSide(baseProducts, {
      categories: filters.categories,
      subcategories: filters.subcategories,
      units: filters.units,
      sizes: filters.sizes,
      distributors: filters.distributors
    });
    const brands = [...new Set(brandFiltered.map(p => p.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    // Build category options (from all products)
    const categories = [...new Set(baseProducts.map(p => p.parentCategory).filter(Boolean))].sort();

    // Build subcategory options (excluding current subcategory filter)
    const subcategoryFiltered = filterProductsClientSide(baseProducts, {
      categories: filters.categories,
      brands: filters.brands,
      units: filters.units,
      sizes: filters.sizes,
      distributors: filters.distributors
    });
    const subcategories = [...new Set(subcategoryFiltered.map(p => p.subcategory).filter(Boolean))].sort();

    // Build units options (excluding current units filter)
    const unitsFiltered = filterProductsClientSide(baseProducts, {
      categories: filters.categories,
      subcategories: filters.subcategories,
      brands: filters.brands,
      sizes: filters.sizes,
      distributors: filters.distributors
    });
    const units = [...new Set(unitsFiltered.map(p => p.unitCount).filter(Boolean))].sort((a, b) => a - b);

    // Build sizes options (excluding current sizes filter)
    const sizesFiltered = filterProductsClientSide(baseProducts, {
      categories: filters.categories,
      subcategories: filters.subcategories,
      brands: filters.brands,
      units: filters.units,
      distributors: filters.distributors
    });
    const sizes = [...new Set(sizesFiltered.map(p => p.unitSize).filter(Boolean))].sort();

    // Build distributors options from all products
    const allDistributors = new Set();
    baseProducts.forEach(product => {
      (product.distributors || []).forEach(dist => {
        allDistributors.add(dist.name);
      });
    });
    const distributors = Array.from(allDistributors).sort();

    return { brands, categories, subcategories, units, sizes, distributors };
  }, [allProducts, filters, filterProductsClientSide]);

  // Merge filter options with analytics filter options (for categories that need it)
  const mergedFilterOptions = React.useMemo(() => {
    if (!allAnalyticsData) return filterOptions;
    return {
      ...filterOptions,
      categories: allAnalyticsData.filterOptions?.categories || filterOptions.categories,
      distributors: allAnalyticsData.filterOptions?.distributors || filterOptions.distributors
    };
  }, [filterOptions, allAnalyticsData]);

  const handleCategoryVisibilityToggle = (category) => {
    const newHidden = new Set(hiddenCategories);
    const newVisible = new Set(visibleHiddenCategories);
    
    const isCurrentlyHidden = hiddenCategories.has(category);
    const isAccessoryLike = ['Accessories', 'Accessory', 'VPT'].includes(category);
    
    if (isCurrentlyHidden) {
      newHidden.delete(category);
      if (isAccessoryLike) {
        newVisible.add(category);
      }
    } else {
      newHidden.add(category);
      if (isAccessoryLike) {
        newVisible.delete(category);
      }
    }
    
    setHiddenCategories(newHidden);
    setVisibleHiddenCategories(newVisible);
  };

  // Preserve scroll position during filter changes
  const scrollContainerRef = React.useRef(null);
  const scrollPositionRef = React.useRef(0);

  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      scrollPositionRef.current = container.scrollTop;
    }
  }, [filters]);

  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (container && scrollPositionRef.current > 0) {
      // Restore scroll position after filtering
      requestAnimationFrame(() => {
        container.scrollTop = scrollPositionRef.current;
      });
    }
  }, [filteredProducts]);

  const sortedProducts = React.useMemo(() => {
    if (!stockFilteredProducts || stockFilteredProducts.length === 0) return [];
    let sorted = [...stockFilteredProducts];

    // Filter out products from hidden categories
    if (hiddenCategories.size > 0) {
      sorted = sorted.filter(product => {
        return !hiddenCategories.has(product.parentCategory);
      });
    }

    if (sortConfig.key) {
      sorted.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];

        // Special handling for distributor (which can be an array)
        if (sortConfig.key === 'distributor') {
          // Get first distributor alphabetically for products with multiple distributors
          const aDistributors = a.distributors || [];
          const bDistributors = b.distributors || [];
          aVal = aDistributors.length > 0 ?
            aDistributors.map(d => d.name).sort()[0].toLowerCase() : '';
          bVal = bDistributors.length > 0 ?
            bDistributors.map(d => d.name).sort()[0].toLowerCase() : '';
        } else if (sortConfig.key === 'brand' || sortConfig.key === 'name') {
          aVal = (aVal || '').toLowerCase();
          bVal = (bVal || '').toLowerCase();
        }

        if (aVal == null || aVal === '') return 1;
        if (bVal == null || bVal === '') return -1;
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sorted;
  }, [stockFilteredProducts, sortConfig, hiddenCategories]);

  // Calculate filtered salesMatrix from filtered products (respects client-side filters)
  const filteredSalesMatrix = React.useMemo(() => {
    if (!allAnalyticsData?.salesMatrix || !sortedProducts || sortedProducts.length === 0) {
      return null;
    }

    // Get stores from analytics
    const stores = allAnalyticsData.stores || [];
    
    // Create a map of product IDs to their sales data from the original salesMatrix
    const salesMatrixMap = new Map();
    allAnalyticsData.salesMatrix.forEach(row => {
      // Find the product ID by matching name (since we don't have ID in salesMatrix)
      const product = sortedProducts.find(p => p.name === row.productName);
      if (product) {
        salesMatrixMap.set(product.id, row);
      }
    });

    // Build sales matrix from filtered products only
    // Take top 20 by totalSales from filtered products
    const topFilteredProducts = sortedProducts
      .filter(p => p.totalSales > 0) // Only products with sales
      .sort((a, b) => b.totalSales - a.totalSales)
      .slice(0, 20);

    const filteredMatrix = topFilteredProducts.map(product => {
      // Get sales data from original matrix or use product's locationSales
      const matrixRow = salesMatrixMap.get(product.id);
      
      if (matrixRow) {
        // Use data from original salesMatrix
        return matrixRow;
      } else {
        // Build from product's locationSales data
        const salesByLocation = {};
        stores.forEach(store => {
          const locationSale = product.locationSales?.find(ls => ls.storeId === store.id);
          salesByLocation[store.name] = locationSale?.units || 0;
        });
        
        return {
          productName: product.name,
          brand: product.brand,
          category: product.parentCategory,
          ...salesByLocation,
          total: product.totalSales
        };
      }
    });

    return filteredMatrix.length > 0 ? filteredMatrix : null;
  }, [allAnalyticsData?.salesMatrix, allAnalyticsData?.stores, sortedProducts]);

  const maxTotalSales = sortedProducts.length > 0 ? Math.max(...sortedProducts.map(p => p.totalSales || 0)) : 0;

  // Calculate strain counts from filtered products with inventory at primary store
  const primaryStoreStrainCounts = React.useMemo(() => {
    const counts = { Hybrid: 0, Sativa: 0, Indica: 0 };
    const primaryStoreId = allAnalyticsData?.primaryStore?.id;
    
    if (!primaryStoreId) return counts;
    
    sortedProducts.forEach(product => {
      // Check if product has inventory at primary store
      const hasInventoryAtPrimary = product.locationInventory?.some(
        loc => loc.storeId === primaryStoreId && loc.quantity > 0
      );
      
      if (hasInventoryAtPrimary) {
        const strain = product.strainType;
        if (strain && strain !== 'N/A' && counts[strain] !== undefined) {
          counts[strain]++;
        }
      }
    });
    return counts;
  }, [sortedProducts, allAnalyticsData?.primaryStore?.id]);

  // Calculate total strain counts from filtered products with inventory at any location
  const totalStrainCounts = React.useMemo(() => {
    const counts = { Hybrid: 0, Sativa: 0, Indica: 0 };
    
    sortedProducts.forEach(product => {
      // Check if product has inventory at any location
      const hasInventory = product.locationInventory?.some(loc => loc.quantity > 0);
      
      if (hasInventory) {
        const strain = product.strainType;
        if (strain && strain !== 'N/A' && counts[strain] !== undefined) {
          counts[strain]++;
        }
      }
    });
    return counts;
  }, [sortedProducts]);

  // Calculate filtered location inventory counts (content-aware badges)
  const filteredLocationInventoryCounts = React.useMemo(() => {
    if (!displayStores || displayStores.length === 0 || !sortedProducts || sortedProducts.length === 0) {
      return [];
    }

    const counts = new Map();
    
    // Initialize all stores with 0
    displayStores.forEach(store => {
      counts.set(store.id, 0);
    });

    // Count products with inventory at each location
    sortedProducts.forEach(product => {
      if (product.locationInventory) {
        product.locationInventory.forEach(loc => {
          if (loc.quantity > 0 && counts.has(loc.storeId)) {
            counts.set(loc.storeId, counts.get(loc.storeId) + 1);
          }
        });
      }
    });

    // Convert to array format matching locationInventoryCounts structure
    return displayStores.map(store => ({
      storeId: store.id,
      storeName: store.name,
      count: counts.get(store.id) || 0
    }));
  }, [sortedProducts, displayStores]);

  // Determine loading states for progressive rendering
  const isInitialPageLoad = isLoadingInitialPage && allProducts.length === 0;
  const isShowingInitialPage = hasInitialPageLoaded && !hasFullDataLoaded && isLoadingFullData;
  const hasAnyData = allProducts.length > 0;

  // Show skeleton loading only on very first page load (no data at all)
  if (isInitialPageLoad) {
    return (
      <div className="flex h-screen">
        <div className="animate-pulse w-64 bg-muted"></div>
        <div className="flex-1 p-6 space-y-6">
          <div className="animate-pulse h-96 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden w-full bg-gradient-to-br from-[#f9fafb] via-white to-[#eef2f7]">
      <OrderingFilters
        analytics={allAnalyticsData ? { ...allAnalyticsData, filterOptions: mergedFilterOptions } : null}
        filters={filters}
        setFilters={setFilters}
        hiddenCategories={hiddenCategories}
        onCategoryVisibilityToggle={handleCategoryVisibilityToggle}
        worksheet={worksheet}
        onExportOrder={handleExportOrder}
        onClearOrder={handleClearOrder}
        onEnrichFormats={handleEnrichFormats}
        onSeedDistributors={handleSeedDistributors}
        onSyncBrands={handleSyncBrands}
      />

      <div className="flex-1 overflow-y-auto min-w-0 relative" ref={scrollContainerRef}>
        <div className="p-6 space-y-6 w-full">
          <div>
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-4xl font-semibold bg-gradient-to-r from-[#14b8a6] via-[#0ea5e9] to-[#2563eb] bg-clip-text text-transparent">
                    Ordering Intelligence
                  </h1>
                  {isRefreshing && (
                    <Badge variant="secondary" className="h-7 px-3 text-xs font-medium flex items-center gap-2 bg-green-50 text-green-700 border-green-200 shadow-sm rounded-lg">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Refreshing data...
                    </Badge>
                  )}
                  {!isRefreshing && isLoadingFullData && hasInitialPageLoaded && (
                    <Badge variant="secondary" className="h-7 px-3 text-xs font-medium flex items-center gap-2 bg-blue-50 text-blue-700 border-blue-200 shadow-sm rounded-lg">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading complete analytics...
                    </Badge>
                  )}
                </div>
                <p className="text-slate-700 mt-2 font-medium">
                  Analysis for {allAnalyticsData?.periodDays || 14} days ({new Date(dateRange.start).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' })} - {new Date(dateRange.end).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' })}) • {stockTab === 'outOfStock' ? (
                    <span className="text-red-600">Out of Stock: {sortedProducts.length} products</span>
                  ) : (
                    <>Showing {sortedProducts.length} of {allProducts.length} products</>
                  )}
                  {isLoadingFullData && hasInitialPageLoaded && (fullAnalytics?.totalCount || initialAnalytics?.totalCount) && (
                    <span className="text-blue-600 ml-2">
                      (Loading {(fullAnalytics?.totalCount || initialAnalytics?.totalCount)} total...)
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Timezone: Central Time (UTC-6) • {new Date(dateRange.start).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} to {new Date(dateRange.end).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                </p>
                {allAnalyticsData?.lastUpdate && (
                  <p className="text-xs text-slate-500 mt-1.5">
                    Last inventory update: {formatRelativeTime(allAnalyticsData.lastUpdate)}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Strain Classification Cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {/* Sativa */}
            <Card className="p-5 bg-gradient-to-br from-teal-50 via-teal-100/50 to-teal-100 border border-teal-200/50 shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-md transition-all duration-200 rounded-xl">
              <div className="text-center">
                <div className="text-teal-700 font-semibold text-sm mb-2 uppercase tracking-wide">Sativa</div>
                <div className="text-4xl font-bold text-teal-800">
                  {primaryStoreStrainCounts.Sativa}
                  {totalStrainCounts.Sativa > primaryStoreStrainCounts.Sativa && (
                    <span className="text-lg font-normal text-teal-700 ml-2">
                      ({totalStrainCounts.Sativa})
                    </span>
                  )}
                </div>
                <div className="text-teal-600 text-xs mt-2 font-medium">products</div>
              </div>
            </Card>
            {/* Hybrid */}
            <Card className="p-5 bg-gradient-to-br from-blue-50 via-blue-100/50 to-blue-100 border border-blue-200/50 shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-md transition-all duration-200 rounded-xl">
              <div className="text-center">
                <div className="text-blue-700 font-semibold text-sm mb-2 uppercase tracking-wide">Hybrid</div>
                <div className="text-4xl font-bold text-blue-800">
                  {primaryStoreStrainCounts.Hybrid}
                  {totalStrainCounts.Hybrid > primaryStoreStrainCounts.Hybrid && (
                    <span className="text-lg font-normal text-blue-700 ml-2">
                      ({totalStrainCounts.Hybrid})
                    </span>
                  )}
                </div>
                <div className="text-blue-600 text-xs mt-2 font-medium">products</div>
              </div>
            </Card>
            {/* Indica */}
            <Card className="p-5 bg-gradient-to-br from-amber-50 via-amber-100/50 to-amber-100 border border-amber-200/50 shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-md transition-all duration-200 rounded-xl">
              <div className="text-center">
                <div className="text-amber-700 font-semibold text-sm mb-2 uppercase tracking-wide">Indica</div>
                <div className="text-4xl font-bold text-amber-800">
                  {primaryStoreStrainCounts.Indica}
                  {totalStrainCounts.Indica > primaryStoreStrainCounts.Indica && (
                    <span className="text-lg font-normal text-amber-700 ml-2">
                      ({totalStrainCounts.Indica})
                    </span>
                  )}
                </div>
                <div className="text-amber-600 text-xs mt-2 font-medium">products</div>
              </div>
            </Card>
          </div>

          {/* Filters - Sticky */}
          <div className="sticky top-0 z-50 bg-white border-b border-slate-200/50 shadow-[0_1px_3px_rgba(0,0,0,0.05)] pb-4 pt-3 -mt-6 rounded-lg">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <LocationSelector
                  stores={stores || []}
                  selectedIds={selectedStoreIds}
                  onChange={setSelectedStoreIds}
                />
                {/* Stock Status Tabs */}
                <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                  <button
                    onClick={() => setStockTab('inStock')}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-2 ${
                      stockTab === 'inStock'
                        ? 'bg-gradient-to-r from-teal-500 to-blue-500 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    In Stock
                    <span className={`px-1.5 py-0.5 text-xs rounded-md font-semibold ${
                      stockTab === 'inStock'
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {inStockCount}
                    </span>
                  </button>
                  <button
                    onClick={() => setStockTab('outOfStock')}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-2 ${
                      stockTab === 'outOfStock'
                        ? 'bg-red-600 text-white'
                        : 'bg-white text-slate-600 hover:bg-red-50'
                    }`}
                  >
                    Out of Stock
                    <span className={`px-1.5 py-0.5 text-xs rounded-md font-semibold ${
                      stockTab === 'outOfStock'
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {stockTab === 'outOfStock' && isLoadingOutOfStock ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        outOfStockCount
                      )}
                    </span>
                  </button>
                </div>
              </div>
              <DateRangeFilter dateRange={dateRange} onChange={setDateRange} />
              <FilterDropdown
                label="Units"
                options={mergedFilterOptions.units || []}
                selectedValues={filters.units}
                onChange={(values) => setFilters(prev => ({ ...prev, units: values }))}
                icon={Package}
              />
              <FilterDropdown
                label="Size"
                options={mergedFilterOptions.sizes || []}
                selectedValues={filters.sizes}
                onChange={(values) => setFilters(prev => ({ ...prev, sizes: values }))}
                icon={Tag}
              />
              <FilterDropdown
                label="Subcategories"
                options={mergedFilterOptions.subcategories || []}
                selectedValues={filters.subcategories}
                onChange={(values) => setFilters(prev => ({ ...prev, subcategories: values }))}
                icon={Package}
              />
              <FilterDropdown
                label="Distributors"
                options={mergedFilterOptions.distributors || []}
                selectedValues={filters.distributors}
                onChange={(values) => setFilters(prev => ({ ...prev, distributors: values }))}
                icon={Package}
              />
              <ColumnVisibilityMenu
                allColumns={allColumnDefinitions}
                hiddenColumns={hiddenColumns}
                onToggleColumn={toggleColumnVisibility}
                onResetVisibility={resetColumnVisibility}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={resetColumnOrder}
                title="Reset column order to default"
                className="border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset Order
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={resetColumnWidths}
                title="Reset all column widths to default"
                className="border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset Widths
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshData}
                disabled={isRefreshing || isLoadingInitialPage}
                title="Refresh all data to get the latest inventory and sales information"
                className="border-green-300 hover:bg-green-50 text-green-700 hover:text-green-800 rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200/50 shadow-[0_1px_3px_rgba(0,0,0,0.05)] bg-white">
            {allAnalyticsData && (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
                  <div className="relative">
                    <table className="w-full border-collapse">
                      <OrderingTableHeader
                        orderedColumns={orderedColumns.map(col => 
                          col.id === 'distributor' ? { ...col, allDistributors: allDistributors || [] } : col
                        )}
                        columnOrder={columnOrder}
                        onSort={handleSort}
                        sortConfig={sortConfig}
                        analytics={allAnalyticsData}
                        periodDays={allAnalyticsData?.periodDays || 14}
                        filteredLocationCounts={filteredLocationInventoryCounts}
                      />
                      <tbody className="relative">
                        {sortedProducts.length === 0 && isInitialPageLoad ? (
                          <tr>
                            <td colSpan={orderedColumns.length} className="p-8 text-center relative" style={{ height: '400px' }}>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <DataLoadingOverlay 
                                  isLoading={true} 
                                  message="Loading products..."
                                  productCount={0}
                                />
                              </div>
                            </td>
                          </tr>
                        ) : (
                          sortedProducts.map((product, index) => (
                            <ProductTableRow
                              key={product.id}
                              product={product}
                              orderedColumns={orderedColumns.map(col => {
                                if (col.id === 'distributor') {
                                  return { ...col, allDistributors: allDistributors || [] };
                                }
                                if (col.id === 'classification') {
                                  return { ...col, classifications: classifications || [] };
                                }
                                if (col.id === 'category' || col.id === 'subcategory') {
                                  return { ...col, categoryDefinitions: categoryDefinitions || [] };
                                }
                                return col;
                              })}
                              periodDays={allAnalyticsData?.periodDays || 14}
                              maxTotalSales={maxTotalSales}
                              onAddToOrder={handleAddToOrder}
                              onRowClick={handleProductRowClick}
                              isLoadingTrends={isLoadingFullData && hasInitialPageLoaded}
                              rowIndex={index}
                              hasDoNotReorderAction={doNotReorderProductIds.has(product.id)}
                              activeActions={productActionsMap.get(product.id) || []}
                            />
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          <SalesMatrix
            salesMatrix={filteredSalesMatrix || allAnalyticsData?.salesMatrix}
            stores={allAnalyticsData?.stores || []}
            isLoading={isLoadingFullData && hasInitialPageLoaded && !allAnalyticsData?.salesMatrix}
          />
        </div>
      </div>

      {/* Inventory Movement Modal */}
      <InventoryMovementModal
        productId={selectedProductForMovements?.id}
        productName={selectedProductForMovements?.name}
        isOpen={isMovementModalOpen}
        onClose={handleCloseMovementModal}
        dateRange={dateRange}
        storeIds={selectedStoreIds}
      />
    </div>
  );
};

export default OrderingDashboard;
