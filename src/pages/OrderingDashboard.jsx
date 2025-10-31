import React, { useState, useEffect } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getOrderingAnalytics, getOrCreateOrderWorksheet, getUserStores } from 'wasp/client/operations';
import { addToOrderWorksheet, exportOrderWorksheet, clearOrderWorksheet, enrichProductFormats } from 'wasp/client/operations';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import LocationSelector from '../components/LocationSelector';
import DateRangeFilter from '../components/DateRangeFilter';
import FilterDropdown from '../components/FilterDropdown';
import { ShoppingCart, Download, Trash2, ArrowUp, ArrowDown, Package, Tag, Eye, EyeOff } from 'lucide-react';
import { useDebounce } from '../lib/useDebounce';
import DataLoadingOverlay from '../components/DataLoadingOverlay';

const OrderingDashboard = () => {
  const { data: stores } = useQuery(getUserStores);
  const [selectedStoreIds, setSelectedStoreIds] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'desc' });
  const [hiddenCategories, setHiddenCategories] = useState(new Set(['Accessories', 'VPT']));
  const [visibleHiddenCategories, setVisibleHiddenCategories] = useState(new Set()); // Track which hidden categories are shown
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

  // Determine if we should include hidden categories in the query
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
      
      // Only update if something changed to avoid infinite loop
      if (stillValid.length !== filters.brands.length) {
        setFilters(prev => ({ ...prev, brands: stillValid }));
      }
    }
  }, [analytics?.filterOptions?.brands]);

  // Reset pagination when filters change (but keep existing data visible)
  useEffect(() => {
    setPagination({ offset: 0, limit: 100 });
    // Don't clear allProducts - keep existing data visible during refetch
  }, [debouncedFilters, selectedStoreIds, dateRange, includeHiddenCategories]);

  // Accumulate products when pagination changes
  useEffect(() => {
    if (analytics?.products) {
      if (pagination.offset === 0) {
        // First page - replace all products
        setAllProducts(analytics.products);
      } else {
        // Subsequent pages - append products
        setAllProducts(prev => [...prev, ...analytics.products]);
      }
      setIsLoadingMore(false);
    }
  }, [analytics?.products, pagination.offset]);

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

  const getLocationCellColor = (inventory, sales, weeksLeft) => {
    if (inventory === 0 && sales > 0) return 'bg-red-100';
    if (weeksLeft < 1) return 'bg-orange-100';
    if (weeksLeft < 2) return 'bg-yellow-100';
    if (inventory > 0 && sales > 0) return 'bg-green-50';
    if (inventory === 0 && sales === 0) return 'bg-gray-50 text-gray-400';
    return '';
  };

  const getHeatMapColor = (value, maxValue) => {
    if (!value || !maxValue || maxValue === 0) return 'bg-gray-100';
    const percentage = (value / maxValue) * 100;
    if (percentage >= 75) return 'bg-emerald-200 text-emerald-900';
    if (percentage >= 50) return 'bg-lime-200 text-lime-900';
    if (percentage >= 35) return 'bg-yellow-200 text-yellow-900';
    if (percentage >= 20) return 'bg-orange-200 text-orange-900';
    if (percentage >= 10) return 'bg-rose-200 text-rose-900';
    return 'bg-red-100 text-red-900';
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
      // Show the category
      newHidden.delete(category);
      if (isAccessoryLike) {
        // If it's Accessories/VPT, mark it as visible so we fetch the data
        newVisible.add(category);
      }
    } else {
      // Hide the category
      newHidden.add(category);
      if (isAccessoryLike) {
        // If hiding Accessories/VPT, remove from visible set
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

  const SortableHeader = ({ column, children, align = "left", width }) => (
    <th 
      onClick={() => handleSort(column)}
      className={`px-3 py-3 font-semibold border bg-background cursor-pointer hover:bg-muted/50 ${width} ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
      }`}
    >
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : ''}`}>
        <span className="break-words">{children}</span>
        {sortConfig.key === column && (
          sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3 flex-shrink-0" /> : <ArrowDown className="h-3 w-3 flex-shrink-0" />
        )}
      </div>
    </th>
  );

  const getStrainColor = (strainType) => {
    switch(strainType) {
      case 'Sativa': return 'bg-green-500';
      case 'Hybrid': return 'bg-purple-500';
      case 'Indica': return 'bg-blue-500';
      default: return 'bg-gray-400';
    }
  };

  const cleanText = (text) => {
    if (!text) return '';
    return text.replace(/\s*>\s*/g, ' ').trim();
  };

  // Show skeleton loading only on initial page load (no data yet)
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
      <div className="w-72 border-r bg-card p-4 overflow-y-auto flex-shrink-0">
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-emerald-800">Filters</h2>
          
          <div className="mb-4">
            <label className="text-sm font-medium mb-2 block text-emerald-800">Brands</label>
            <div className="border rounded-lg p-2 bg-background max-h-64 overflow-y-auto space-y-1">
              {(analytics?.filterOptions?.brands || []).map(brand => {
                const isSelected = filters.brands.includes(brand);
                return (
                  <div
                    key={brand}
                    onClick={(e) => {
                      if (e.ctrlKey || e.metaKey) {
                        // Ctrl+click: Toggle this brand (multi-select)
                        if (isSelected) {
                          setFilters({ ...filters, brands: filters.brands.filter(b => b !== brand) });
                        } else {
                          setFilters({ ...filters, brands: [...filters.brands, brand] });
                        }
                      } else {
                        // Normal click: Select only this brand (single-select)
                        setFilters({ ...filters, brands: [brand] });
                      }
                    }}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm ${
                      isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'
                    }`}
                  >
                    <span>{brand}</span>
                  </div>
                );
              })}
            </div>
            {filters.brands.length > 0 && (
              <div className="mt-2 text-xs text-muted-foreground">
                {filters.brands.length} selected
              </div>
            )}
          </div>

          <div className="mb-4">
            <label className="text-sm font-medium mb-2 block text-emerald-800">
              Categories
              <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                👁️ = show/hide • Click name = filter
              </span>
            </label>
            <div className="border rounded-lg p-2 bg-background max-h-64 overflow-y-auto space-y-1">
              {(analytics?.filterOptions?.categories || []).map(cat => {
                const isSelected = filters.categories.includes(cat);
                const isHidden = hiddenCategories.has(cat);
                
                return (
                  <div
                    key={cat}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
                      isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'
                    }`}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCategoryVisibilityToggle(cat);
                      }}
                      className={`flex-shrink-0 hover:scale-110 transition-transform ${
                        isHidden ? 'text-muted-foreground' : 'text-foreground'
                      }`}
                      title={isHidden ? 'Hidden - Click to show in table' : 'Visible - Click to hide from table'}
                    >
                      {isHidden ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                    <span
                      onClick={(e) => {
                        if (e.ctrlKey || e.metaKey) {
                          // Ctrl+click: Toggle this category (multi-select)
                          if (isSelected) {
                            setFilters({ ...filters, categories: filters.categories.filter(c => c !== cat) });
                          } else {
                            setFilters({ ...filters, categories: [...filters.categories, cat] });
                          }
                        } else {
                          // Normal click: Select only this category (single-select)
                          setFilters({ ...filters, categories: [cat] });
                        }
                      }}
                      className={`flex-1 cursor-pointer hover:underline ${
                        isHidden ? 'opacity-50 line-through' : ''
                      }`}
                      title="Click to filter by this category"
                    >
                      {cat}
                    </span>
                  </div>
                );
              })}
            </div>
            {filters.categories.length > 0 && (
              <div className="mt-2 text-xs text-muted-foreground">
                {filters.categories.length} selected for filtering
              </div>
            )}
            {hiddenCategories.size > 0 && (
              <div className="mt-1 text-xs text-muted-foreground">
                {hiddenCategories.size} hidden from view
              </div>
            )}
          </div>

          {(filters.brands.length > 0 || filters.categories.length > 0 || 
            filters.subcategories.length > 0 || filters.units.length > 0 || filters.sizes.length > 0) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilters({ brands: [], categories: [], subcategories: [], units: [], sizes: [] })}
              className="w-full"
            >
              Clear All Filters
            </Button>
          )}

          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-2 text-emerald-800">Order Summary</h3>
            <div className="text-sm text-muted-foreground mb-4">
              {worksheet?.items?.length || 0} items in order
            </div>
            <div className="space-y-2">
              <Button onClick={handleExportOrder} className="w-full" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export Order
              </Button>
              <Button variant="outline" onClick={handleClearOrder} className="w-full" size="sm">
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Order
              </Button>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-2 text-emerald-800">Admin Tools</h3>
            <div className="space-y-2">
              <Button variant="secondary" onClick={handleEnrichFormats} className="w-full" size="sm">
                🔄 Enrich Formats
              </Button>
              <p className="text-xs text-muted-foreground">
                Updates format data for all products (multipacks, etc.)
              </p>
            </div>
          </div>
        </div>
      </div>

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
            </div>
          </div>

          <div className="overflow-x-auto">
            {analytics && (
            <table className="w-full border-collapse border">
              <thead className="bg-background sticky top-0 z-10 border-b-2">
                <tr>
                  <SortableHeader column="name" width="w-64">Product</SortableHeader>
                  <SortableHeader column="brand" width="w-32">Brand</SortableHeader>
                  <SortableHeader column="strainType" width="w-24">Type</SortableHeader>
                  <SortableHeader column="format" width="w-24">Format</SortableHeader>
                  <SortableHeader column="parentCategory" width="w-32">Category</SortableHeader>
                  <SortableHeader column="wholesaleCost" align="right" width="w-24">Cost</SortableHeader>
                  <SortableHeader column="retailPrice" align="right" width="w-24">Retail</SortableHeader>
                  <SortableHeader column="margin" align="right" width="w-20">Margin</SortableHeader>
                  {analytics?.stores?.map(store => {
                    // Get total count from backend data (already accounts for all filtered products)
                    const locationTotal = analytics.locationTotals?.find(lt => lt.storeName === store.name);
                    const storeProductCount = locationTotal?.productCount || 0;
                    
                    return (
                      <th key={store.id} className="px-3 py-3 text-center font-semibold border bg-background w-28">
                        {storeProductCount > 0 && (
                          <Badge variant="secondary" className="mb-1 text-xs">{storeProductCount}</Badge>
                        )}
                        <div className="break-words">{store.name}</div>
                        <div className="text-xs font-normal text-muted-foreground">Inv/Sales</div>
                      </th>
                    );
                  })}
                  <SortableHeader column="totalInventory" align="right" width="w-24">Total Inv</SortableHeader>
                  <SortableHeader column="totalSales" align="right" width="w-24">Total Sales</SortableHeader>
                  <th className="px-3 py-3 text-center font-semibold border bg-background w-28">
                    <div className="break-words">Popularity</div>
                    <div className="text-xs font-normal text-muted-foreground">{analytics?.periodDays || 14} Days</div>
                  </th>
                  <SortableHeader column="weeksLeft" align="center" width="w-24">Wks Left</SortableHeader>
                  <SortableHeader column="daysSinceLastSale" align="right" width="w-28">Days Since Sale</SortableHeader>
                  <SortableHeader column="daysSinceLastPO" align="right" width="w-28">Days Since PO</SortableHeader>
                  <SortableHeader column="suggestedQty" align="right" width="w-28">Suggested</SortableHeader>
                  <th className="px-3 py-3 text-center font-semibold border bg-background w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-muted/30 border-b">
                    <td className="px-3 py-3 border w-64">
                      <div className="flex items-start gap-2">
                        {product.isTop10 && (
                          <Badge variant="default" className="text-xs shrink-0">
                            🏆 #{product.categoryRank}
                          </Badge>
                        )}
                        <span className="font-medium text-emerald-900 break-words line-clamp-3">{product.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 border text-emerald-800 font-medium w-32">
                      <div className="break-words text-base">{product.brand}</div>
                    </td>
                    <td className="px-3 py-3 border w-24">
                      {product.strainType && product.strainType !== 'N/A' ? (
                        <Badge className={`${getStrainColor(product.strainType)} text-white text-xs`}>
                          {product.strainType}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center border w-24">
                      <span className="text-base font-medium">{cleanText(product.format) || '-'}</span>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground border w-32">
                      <div className="break-words text-sm">
                        {product.parentCategory}
                        {product.subcategory && <><br/><span className="text-xs">› {cleanText(product.subcategory)}</span></>}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono border w-24 text-base">
                      ${(product.wholesaleCost || 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono border w-24 text-base">
                      ${(product.retailPrice || 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-3 text-right border w-20 text-base">
                      {((product.margin || 0) * 100).toFixed(0)}%
                    </td>
                    {(analytics?.stores || []).map(store => {
                      const inv = product.locationInventory.find(l => l.storeId === store.id);
                      const sale = product.locationSales.find(s => s.storeId === store.id);
                      const inventory = inv ? inv.quantity : 0;
                      const sales = sale ? sale.units : 0;
                      const localVelocity = sales / ((analytics?.periodDays || 14) / 7);
                      const localWeeksLeft = localVelocity > 0 ? inventory / localVelocity : 999;
                      
                      return (
                        <td 
                          key={store.id} 
                          className={`px-3 py-3 text-center border font-mono w-28 ${getLocationCellColor(inventory, sales, localWeeksLeft)}`}
                        >
                          <div className="font-semibold text-lg">{inventory}</div>
                          <div className="text-sm text-muted-foreground">/ {sales}</div>
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-right font-semibold border w-24 text-lg">
                      {product.totalInventory}
                    </td>
                    <td className={`px-3 py-3 text-right border w-24 font-semibold text-lg ${getHeatMapColor(product.totalSales, maxTotalSales)}`}>
                      {product.totalSales}
                    </td>
                    <td className={`px-3 py-3 text-center border w-28 ${getHeatMapColor(product.totalSales, maxTotalSales)}`}>
                      <div className="flex items-center justify-center gap-1">
                        <div className="text-base font-bold">
                          {maxTotalSales > 0 ? Math.round((product.totalSales / maxTotalSales) * 100) : 0}%
                        </div>
                        {product.totalSales > maxTotalSales * 0.75 ? '🔥' : 
                         product.totalSales > maxTotalSales * 0.5 ? '🌡️' : 
                         product.totalSales > maxTotalSales * 0.25 ? '❄️' : '🧊'}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center border w-24">
                      <Badge className={
                        product.weeksLeft < 2 ? 'bg-green-500' :
                        product.weeksLeft < 3 ? 'bg-yellow-500' : 'bg-red-500'
                      }>
                        {product.weeksLeft < 999 ? product.weeksLeft.toFixed(1) : '∞'}w
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-right border w-28 text-base">
                      {product.daysSinceLastSale !== null ? (
                        <span className={product.daysSinceLastSale > 30 ? 'text-red-600 font-semibold' : ''}>
                          {product.daysSinceLastSale}d
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right border w-28 text-base">
                      {product.daysSinceLastPO !== null ? (
                        <span className={product.daysSinceLastPO > 90 ? 'text-orange-600 font-semibold' : ''}>
                          {product.daysSinceLastPO}d
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right border w-28">
                      {product.suggestedQty > 0 ? (
                        <div>
                          <div className="font-semibold text-lg">{product.suggestedQty}</div>
                          <div className="text-sm text-muted-foreground">
                            ({product.suggestedCases} cases)
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center border w-28">
                      {product.suggestedQty > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAddToOrder(product)}
                        >
                          <ShoppingCart className="h-3 w-3 mr-1" />
                          Add
                        </Button>
                      )}
                    </td>
                  </tr>
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

          {analytics?.salesMatrix && analytics.salesMatrix.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xl font-semibold text-emerald-800 mb-3">Top Selling Products by Location</h2>
              <p className="text-sm text-emerald-700 mb-4">Units sold in the selected period</p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border">
                  <thead className="bg-background sticky top-0">
                    <tr>
                      <th className="px-3 py-3 text-left font-semibold border">Product</th>
                      <th className="px-3 py-3 text-left font-semibold border">Brand</th>
                      <th className="px-3 py-3 text-left font-semibold border">Category</th>
                      {(analytics?.stores || []).map(store => (
                        <th key={store.id} className="px-3 py-3 text-right font-semibold border">
                          {store.name}
                        </th>
                      ))}
                      <th className="px-3 py-3 text-right font-semibold border">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.salesMatrix.map((row, idx) => (
                      <tr key={idx} className="hover:bg-muted/30 border-b">
                        <td className="px-3 py-3 font-medium border">{row.productName}</td>
                        <td className="px-3 py-3 text-muted-foreground border">{row.brand}</td>
                        <td className="px-3 py-3 text-muted-foreground text-sm border">{row.category}</td>
                        {(analytics?.stores || []).map(store => (
                          <td key={store.id} className="px-3 py-3 text-right border text-base">
                            {row[store.name] || 0}
                          </td>
                        ))}
                        <td className="px-3 py-3 text-right font-semibold border text-base">{row.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderingDashboard;
