import React, { useState, useEffect } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getOrderingAnalytics, getOrCreateOrderWorksheet, getUserStores, getDistributors } from 'wasp/client/operations';
import { addToOrderWorksheet, exportOrderWorksheet, clearOrderWorksheet, enrichProductFormats, seedDistributors, syncBrands } from 'wasp/client/operations';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import LocationSelector from '../components/LocationSelector';
import DateRangeFilter from '../components/DateRangeFilter';
import FilterDropdown from '../components/FilterDropdown';
import { Package, Tag, RotateCcw, Loader2 } from 'lucide-react';
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
import SalesMatrix from '../components/SalesMatrix';
import ColumnVisibilityMenu from '../components/ColumnVisibilityMenu';

const OrderingDashboard = () => {
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
    updateColumnWidth,
    hiddenColumns,
    toggleColumnVisibility
  } = useColumnOrdering(displayStores);
  
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 14);
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

  const [allProducts, setAllProducts] = useState([]);
  const [allAnalyticsData, setAllAnalyticsData] = useState(null);
  
  // Progressive loading state tracking
  const [hasInitialPageLoaded, setHasInitialPageLoaded] = useState(false);
  const [hasFullDataLoaded, setHasFullDataLoaded] = useState(false);

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
    const brands = [...new Set(brandFiltered.map(p => p.brand).filter(Boolean))].sort();

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
    if (!filteredProducts || filteredProducts.length === 0) return [];
    let sorted = [...filteredProducts];
    
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
  }, [filteredProducts, sortConfig, hiddenCategories]);

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
    <div className="flex h-screen overflow-hidden w-full">
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
        <div className="p-4 space-y-4 w-full">
          <div>
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-bold text-emerald-800">Ordering Intelligence</h1>
                  {isLoadingFullData && hasInitialPageLoaded && (
                    <Badge variant="secondary" className="h-7 px-3 text-xs font-medium flex items-center gap-2 bg-blue-50 text-blue-700 border-blue-200">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading complete analytics...
                    </Badge>
                  )}
                </div>
                <p className="text-emerald-700 mt-1">
                  Analysis for {allAnalyticsData?.periodDays || 14} days • Showing {sortedProducts.length} of {allProducts.length} products
                  {isLoadingFullData && hasInitialPageLoaded && (fullAnalytics?.totalCount || initialAnalytics?.totalCount) && (
                    <span className="text-blue-600 ml-2">
                      (Loading {(fullAnalytics?.totalCount || initialAnalytics?.totalCount)} total...)
                    </span>
                  )}
                </p>
                {allAnalyticsData?.lastUpdate && (
                  <p className="text-xs text-emerald-600 mt-1">
                    Last inventory update: {formatRelativeTime(allAnalyticsData.lastUpdate)}
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <LocationSelector
                  stores={stores || []}
                  selectedIds={selectedStoreIds}
                  onChange={setSelectedStoreIds}
                />
                <Badge variant="secondary" className="h-8 px-3 text-sm font-semibold">
                  {sortedProducts.length} Products
                </Badge>
              </div>
              <DateRangeFilter dateRange={dateRange} onChange={setDateRange} />
              <FilterDropdown
                label="Units"
                options={mergedFilterOptions.units || []}
                selectedValues={filters.units}
                onChange={(values) => setFilters({ ...filters, units: values })}
                icon={Package}
              />
              <FilterDropdown
                label="Size"
                options={mergedFilterOptions.sizes || []}
                selectedValues={filters.sizes}
                onChange={(values) => setFilters({ ...filters, sizes: values })}
                icon={Tag}
              />
              <FilterDropdown
                label="Subcategories"
                options={mergedFilterOptions.subcategories || []}
                selectedValues={filters.subcategories}
                onChange={(values) => setFilters({ ...filters, subcategories: values })}
                icon={Package}
              />
              <FilterDropdown
                label="Distributors"
                options={mergedFilterOptions.distributors || []}
                selectedValues={filters.distributors}
                onChange={(values) => setFilters({ ...filters, distributors: values })}
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
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset Order
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={resetColumnWidths}
                title="Reset all column widths to default"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset Widths
              </Button>
            </div>
          </div>

          {/* Strain Classification Cards */}
          <div className="grid grid-cols-3 gap-4">
            {/* Sativa */}
            <Card className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
              <div className="text-center">
                <div className="text-emerald-600 font-semibold text-sm mb-1">Sativa</div>
                <div className="text-3xl font-bold text-emerald-800">
                  {primaryStoreStrainCounts.Sativa}
                  {totalStrainCounts.Sativa > primaryStoreStrainCounts.Sativa && (
                    <span className="text-base font-normal text-emerald-700 ml-2">
                      ({totalStrainCounts.Sativa})
                    </span>
                  )}
                </div>
                <div className="text-emerald-600 text-xs mt-1">products</div>
              </div>
            </Card>
            {/* Hybrid */}
            <Card className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
              <div className="text-center">
                <div className="text-purple-600 font-semibold text-sm mb-1">Hybrid</div>
                <div className="text-3xl font-bold text-purple-800">
                  {primaryStoreStrainCounts.Hybrid}
                  {totalStrainCounts.Hybrid > primaryStoreStrainCounts.Hybrid && (
                    <span className="text-base font-normal text-purple-700 ml-2">
                      ({totalStrainCounts.Hybrid})
                    </span>
                  )}
                </div>
                <div className="text-purple-600 text-xs mt-1">products</div>
              </div>
            </Card>
            {/* Indica */}
            <Card className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
              <div className="text-center">
                <div className="text-amber-600 font-semibold text-sm mb-1">Indica</div>
                <div className="text-3xl font-bold text-amber-800">
                  {primaryStoreStrainCounts.Indica}
                  {totalStrainCounts.Indica > primaryStoreStrainCounts.Indica && (
                    <span className="text-base font-normal text-amber-700 ml-2">
                      ({totalStrainCounts.Indica})
                    </span>
                  )}
                </div>
                <div className="text-amber-600 text-xs mt-1">products</div>
              </div>
            </Card>
          </div>

          <div className="overflow-x-auto">
            {allAnalyticsData && (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
                  <div className="relative">
                    <table className="w-full border-collapse border">
                      <OrderingTableHeader
                        orderedColumns={orderedColumns.map(col => 
                          col.id === 'distributor' ? { ...col, allDistributors: allDistributors || [] } : col
                        )}
                        columnOrder={columnOrder}
                        onSort={handleSort}
                        sortConfig={sortConfig}
                        analytics={allAnalyticsData}
                        periodDays={allAnalyticsData?.periodDays || 14}
                        onColumnResize={updateColumnWidth}
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
                          sortedProducts.map((product) => (
                            <ProductTableRow
                              key={product.id}
                              product={product}
                              orderedColumns={orderedColumns.map(col => 
                                col.id === 'distributor' ? { ...col, allDistributors: allDistributors || [] } : col
                              )}
                              periodDays={allAnalyticsData?.periodDays || 14}
                              maxTotalSales={maxTotalSales}
                              onAddToOrder={handleAddToOrder}
                              isLoadingTrends={isLoadingFullData && hasInitialPageLoaded}
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
            salesMatrix={allAnalyticsData?.salesMatrix} 
            stores={allAnalyticsData?.stores || []}
            isLoading={isLoadingFullData && hasInitialPageLoaded && !allAnalyticsData?.salesMatrix}
          />
        </div>
      </div>
    </div>
  );
};

export default OrderingDashboard;
