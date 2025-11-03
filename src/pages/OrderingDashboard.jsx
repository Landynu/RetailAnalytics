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
import { Package, Tag, RotateCcw } from 'lucide-react';
import { useDebounce } from '../lib/useDebounce';
import DataLoadingOverlay from '../components/DataLoadingOverlay';
import { formatRelativeTime } from '../lib/formatRelativeTime';
import { arrayMove } from '@dnd-kit/sortable';
import { useColumnOrdering } from '../lib/useColumnOrdering';
import OrderingFilters from '../components/OrderingFilters';
import OrderingTableHeader from '../components/OrderingTableHeader';
import ProductTableRow from '../components/ProductTableRow';
import SalesMatrix from '../components/SalesMatrix';

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
    resetColumnOrder 
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
    sizes: []
  });

  const [pagination, setPagination] = useState({
    offset: 0,
    limit: 100
  });

  const [allProducts, setAllProducts] = useState([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const debouncedFilters = useDebounce(filters, 300);

  const includeHiddenCategories = visibleHiddenCategories.size > 0;

  const { data: analytics, isLoading: analyticsLoading, refetch: refetchAnalytics } = useQuery(
    getOrderingAnalytics,
    { 
      storeIds: selectedStoreIds, 
      dateRange, 
      filters: debouncedFilters,
      limit: pagination.limit,
      offset: pagination.offset,
      includeHiddenCategories
    }
  );

  const { data: worksheet } = useQuery(getOrCreateOrderWorksheet);
  const { data: allDistributors } = useQuery(getDistributors);

  // Auto-deselect brands that are no longer in the eligible brand list
  useEffect(() => {
    if (analytics?.filterOptions?.brands) {
      const eligibleBrands = new Set(analytics.filterOptions.brands);
      const stillValid = filters.brands.filter(b => eligibleBrands.has(b));
      
      if (stillValid.length !== filters.brands.length) {
        setFilters(prev => ({ ...prev, brands: stillValid }));
      }
    }
  }, [analytics?.filterOptions?.brands]);

  // Reset pagination when filters change
  useEffect(() => {
    setPagination({ offset: 0, limit: 100 });
  }, [debouncedFilters, selectedStoreIds, dateRange, includeHiddenCategories]);

  // Accumulate products when pagination changes
  useEffect(() => {
    if (analytics?.products) {
      if (pagination.offset === 0) {
        setAllProducts(analytics.products);
      } else {
        setAllProducts(prev => [...prev, ...analytics.products]);
      }
      setIsLoadingMore(false);
    }
  }, [analytics?.products, pagination.offset]);

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

  const handleLoadMore = async () => {
    if (analytics?.hasMore && !isLoadingMore) {
      setIsLoadingMore(true);
      setPagination(prev => ({
        ...prev,
        offset: prev.offset + prev.limit
      }));
    }
  };

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

  const sortedProducts = React.useMemo(() => {
    if (!allProducts || allProducts.length === 0) return [];
    let sorted = [...allProducts];
    
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
        if (sortConfig.key === 'brand' || sortConfig.key === 'name') {
          aVal = (aVal || '').toLowerCase();
          bVal = (bVal || '').toLowerCase();
        }
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sorted;
  }, [allProducts, sortConfig, hiddenCategories]);

  const maxTotalSales = sortedProducts.length > 0 ? Math.max(...sortedProducts.map(p => p.totalSales || 0)) : 0;

  // Show skeleton loading only on initial page load
  const isInitialLoad = analyticsLoading && allProducts.length === 0;
  const isRefetching = analyticsLoading && allProducts.length > 0;

  if (isInitialLoad) {
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
        analytics={analytics}
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

      <div className="flex-1 overflow-y-auto min-w-0 relative">
        <DataLoadingOverlay 
          isLoading={isRefetching} 
          message="Applying filters..."
          productCount={analytics?.totalCount}
        />
        <div className="p-4 space-y-4 w-full">
          <div>
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h1 className="text-3xl font-bold text-emerald-800">Ordering Intelligence</h1>
                <p className="text-emerald-700 mt-1">
                  Analysis for {analytics?.periodDays || 14} days • Showing {sortedProducts.length} of {analytics?.totalCount || 0} products
                  {analytics?.hasMore && <span className="ml-2 text-sm">(Load more below)</span>}
                </p>
                {analytics?.lastUpdate && (
                  <p className="text-xs text-emerald-600 mt-1">
                    Last inventory update: {formatRelativeTime(analytics.lastUpdate)}
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
                  {analytics?.totalCount || 0} Products
                </Badge>
              </div>
              <DateRangeFilter dateRange={dateRange} onChange={setDateRange} />
              <FilterDropdown
                label="Units"
                options={analytics?.filterOptions?.units || []}
                selectedValues={filters.units}
                onChange={(values) => setFilters({ ...filters, units: values })}
                icon={Package}
              />
              <FilterDropdown
                label="Size"
                options={analytics?.filterOptions?.sizes || []}
                selectedValues={filters.sizes}
                onChange={(values) => setFilters({ ...filters, sizes: values })}
                icon={Tag}
              />
              <FilterDropdown
                label="Subcategories"
                options={analytics?.filterOptions?.subcategories || []}
                selectedValues={filters.subcategories}
                onChange={(values) => setFilters({ ...filters, subcategories: values })}
                icon={Package}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={resetColumnOrder}
                title="Reset column order to default"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset Columns
              </Button>
            </div>
          </div>

          {/* Strain Classification Cards */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
              <div className="text-center">
                <div className="text-purple-600 font-semibold text-sm mb-1">Hybrid</div>
                <div className="text-3xl font-bold text-purple-800">{analytics?.strainCounts?.Hybrid || 0}</div>
                <div className="text-purple-600 text-xs mt-1">products</div>
              </div>
            </Card>
            <Card className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
              <div className="text-center">
                <div className="text-emerald-600 font-semibold text-sm mb-1">Sativa</div>
                <div className="text-3xl font-bold text-emerald-800">{analytics?.strainCounts?.Sativa || 0}</div>
                <div className="text-emerald-600 text-xs mt-1">products</div>
              </div>
            </Card>
            <Card className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
              <div className="text-center">
                <div className="text-amber-600 font-semibold text-sm mb-1">Indica</div>
                <div className="text-3xl font-bold text-amber-800">{analytics?.strainCounts?.Indica || 0}</div>
                <div className="text-amber-600 text-xs mt-1">products</div>
              </div>
            </Card>
          </div>

          <div className="overflow-x-auto">
            {analytics && (
              <table className="w-full border-collapse border">
                <OrderingTableHeader
                  orderedColumns={orderedColumns.map(col => 
                    col.id === 'distributor' ? { ...col, allDistributors: allDistributors || [] } : col
                  )}
                  columnOrder={columnOrder}
                  onDragEnd={handleDragEnd}
                  onSort={handleSort}
                  sortConfig={sortConfig}
                  analytics={analytics}
                  periodDays={analytics?.periodDays || 14}
                />
                <tbody>
                  {sortedProducts.map((product) => (
                    <ProductTableRow
                      key={product.id}
                      product={product}
                      orderedColumns={orderedColumns.map(col => 
                        col.id === 'distributor' ? { ...col, allDistributors: allDistributors || [] } : col
                      )}
                      periodDays={analytics?.periodDays || 14}
                      maxTotalSales={maxTotalSales}
                      onAddToOrder={handleAddToOrder}
                    />
                  ))}
                </tbody>
              </table>
            )}
            
            {analytics?.hasMore && (
              <div className="flex justify-center py-6">
                <Button 
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  size="lg"
                  variant="outline"
                  className="w-64"
                >
                  {isLoadingMore ? (
                    <>
                      <span className="animate-spin mr-2">⏳</span>
                      Loading More...
                    </>
                  ) : (
                    <>
                      Load More Products ({analytics.totalCount - allProducts.length} remaining)
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          <SalesMatrix 
            salesMatrix={analytics?.salesMatrix} 
            stores={analytics?.stores || []} 
          />
        </div>
      </div>
    </div>
  );
};

export default OrderingDashboard;
