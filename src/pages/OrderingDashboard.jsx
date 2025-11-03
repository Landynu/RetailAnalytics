import React, { useState, useEffect } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getOrderingAnalytics, getOrCreateOrderWorksheet, getUserStores } from 'wasp/client/operations';
import { addToOrderWorksheet, exportOrderWorksheet, clearOrderWorksheet, enrichProductFormats } from 'wasp/client/operations';
import { Button } from '../components/ui/button';
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
  
  const { 
    columnOrder, 
    setColumnOrder, 
    orderedColumns, 
    resetColumnOrder 
  } = useColumnOrdering(stores || []);
  
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
              <LocationSelector
                stores={stores || []}
                selectedIds={selectedStoreIds}
                onChange={setSelectedStoreIds}
              />
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

          <div className="overflow-x-auto">
            {analytics && (
              <table className="w-full border-collapse border">
                <OrderingTableHeader
                  orderedColumns={orderedColumns}
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
                      orderedColumns={orderedColumns}
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
