import React, { useState, useEffect } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getOrderingAnalytics, getOrCreateOrderWorksheet } from 'wasp/client/operations';
import { addToOrderWorksheet, exportOrderWorksheet, clearOrderWorksheet } from 'wasp/client/operations';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import LocationSelector from '../components/LocationSelector';
import FilterDropdown from '../components/FilterDropdown';
import DateRangeFilter from '../components/DateRangeFilter';
import { ShoppingCart, Download, Trash2, TrendingUp, Package } from 'lucide-react';
import { useDebounce } from '../lib/useDebounce';

const OrderingDashboard = () => {
  // State management
  const [selectedStoreIds, setSelectedStoreIds] = useState(null);
  const [dateRange, setDateRange] = useState(() => {
    // Default to 14 days
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 14);
    return { start: start.toISOString(), end: end.toISOString() };
  });
  const [filters, setFilters] = useState({
    brands: [],
    categories: [],
    subcategories: [],
    formats: []
  });

  // Debounce filters
  const debouncedFilters = useDebounce(filters, 300);

  // Fetch ordering analytics
  const { data: analytics, isLoading: analyticsLoading, refetch: refetchAnalytics } = useQuery(
    getOrderingAnalytics,
    { storeIds: selectedStoreIds, dateRange, filters: debouncedFilters }
  );

  // Fetch order worksheet
  const { data: worksheet, isLoading: worksheetLoading } = useQuery(getOrCreateOrderWorksheet);

  // Refetch when filters change
  useEffect(() => {
    refetchAnalytics();
  }, [debouncedFilters, selectedStoreIds, dateRange]);

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
      // Create and download CSV file
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

  // Helper function to get status color
  const getWeeksLeftColor = (weeksLeft) => {
    if (weeksLeft < 1) return 'bg-red-100 text-red-800';
    if (weeksLeft < 2) return 'bg-orange-100 text-orange-800';
    if (weeksLeft < 3) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
  };

  if (analyticsLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse h-12 bg-muted rounded"></div>
        <div className="animate-pulse h-96 bg-muted rounded"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Ordering Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Smart ordering intelligence for {analytics?.periodDays || 14} days
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleClearOrder}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clear Order
          </Button>
          <Button onClick={handleExportOrder}>
            <Download className="h-4 w-4 mr-2" />
            Export Order ({worksheet?.items?.length || 0})
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <DateRangeFilter
          dateRange={dateRange}
          onChange={setDateRange}
        />
        
        <LocationSelector
          stores={analytics?.stores || []}
          selectedIds={selectedStoreIds}
          onChange={setSelectedStoreIds}
        />

        <FilterDropdown
          label="Brands"
          options={analytics?.filterOptions?.brands || []}
          selectedValues={filters.brands}
          onChange={(values) => setFilters({ ...filters, brands: values })}
        />

        <FilterDropdown
          label="Categories"
          options={analytics?.filterOptions?.categories || []}
          selectedValues={filters.categories}
          onChange={(values) => setFilters({ ...filters, categories: values })}
        />

        <FilterDropdown
          label="Subcategories"
          options={analytics?.filterOptions?.subcategories || []}
          selectedValues={filters.subcategories}
          onChange={(values) => setFilters({ ...filters, subcategories: values })}
        />

        <FilterDropdown
          label="Formats"
          options={analytics?.filterOptions?.formats || []}
          selectedValues={filters.formats}
          onChange={(values) => setFilters({ ...filters, formats: values })}
        />

        {(filters.brands.length > 0 || filters.categories.length > 0 || 
          filters.subcategories.length > 0 || filters.formats.length > 0) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilters({ brands: [], categories: [], subcategories: [], formats: [] })}
          >
            Clear Filters
          </Button>
        )}
      </div>

      {/* Sales Matrix */}
      {analytics?.salesMatrix && analytics.salesMatrix.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Selling Products by Location</CardTitle>
            <CardDescription>Units sold in the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase bg-muted/50">
                  <tr>
                    <th className="px-3 py-3 text-left font-semibold">Product</th>
                    <th className="px-3 py-3 text-left font-semibold">Brand</th>
                    {analytics.stores.map(store => (
                      <th key={store.id} className="px-3 py-3 text-right font-semibold">
                        {store.name}
                      </th>
                    ))}
                    <th className="px-3 py-3 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {analytics.salesMatrix.map((row, idx) => (
                    <tr key={idx} className="hover:bg-muted/50">
                      <td className="px-3 py-3 font-medium">{row.productName}</td>
                      <td className="px-3 py-3 text-muted-foreground">{row.brand}</td>
                      {analytics.stores.map(store => (
                        <td key={store.id} className="px-3 py-3 text-right">
                          {row[store.name] || 0}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right font-semibold">{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Ordering Table */}
      <Card>
        <CardHeader>
          <CardTitle>Product Ordering Intelligence</CardTitle>
          <CardDescription>
            Showing {analytics?.products?.length || 0} products
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase bg-muted/50 sticky top-0">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold">Product</th>
                  <th className="px-3 py-3 text-left font-semibold">Brand</th>
                  <th className="px-3 py-3 text-left font-semibold">Category</th>
                  <th className="px-3 py-3 text-right font-semibold">Cost</th>
                  <th className="px-3 py-3 text-right font-semibold">Retail</th>
                  <th className="px-3 py-3 text-right font-semibold">Margin</th>
                  {analytics?.stores?.map(store => (
                    <th key={store.id} className="px-3 py-3 text-right font-semibold">
                      {store.name} Inv
                    </th>
                  ))}
                  <th className="px-3 py-3 text-right font-semibold">Total Inv</th>
                  <th className="px-3 py-3 text-right font-semibold">Sales</th>
                  <th className="px-3 py-3 text-right font-semibold">Wks Left</th>
                  <th className="px-3 py-3 text-right font-semibold">Suggested</th>
                  <th className="px-3 py-3 text-center font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {analytics?.products?.map((product) => (
                  <tr key={product.id} className="hover:bg-muted/50">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        {product.isTop10 && (
                          <Badge variant="default" className="text-xs">
                            🏆 #{product.categoryRank}
                          </Badge>
                        )}
                        <span className="font-medium">{product.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{product.brand}</td>
                    <td className="px-3 py-3 text-muted-foreground text-xs">
                      {product.parentCategory}
                      {product.subcategory && ` > ${product.subcategory}`}
                    </td>
                    <td className="px-3 py-3 text-right">${(product.wholesaleCost || 0).toFixed(2)}</td>
                    <td className="px-3 py-3 text-right">${(product.retailPrice || 0).toFixed(2)}</td>
                    <td className="px-3 py-3 text-right">
                      {((product.margin || 0) * 100).toFixed(0)}%
                    </td>
                    {analytics.stores.map(store => {
                      const inv = product.locationInventory.find(l => l.storeId === store.id);
                      return (
                        <td key={store.id} className="px-3 py-3 text-right">
                          {inv ? inv.quantity : 0}
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-right font-semibold">{product.totalInventory}</td>
                    <td className="px-3 py-3 text-right">{product.totalSales}</td>
                    <td className="px-3 py-3 text-right">
                      <Badge className={getWeeksLeftColor(product.weeksLeft)}>
                        {product.weeksLeft < 999 ? product.weeksLeft.toFixed(1) : '∞'}w
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {product.suggestedQty > 0 ? (
                        <div>
                          <div className="font-semibold">{product.suggestedQty} units</div>
                          <div className="text-xs text-muted-foreground">
                            ({product.suggestedCases} cases)
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
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
          </div>
        </CardContent>
      </Card>

      {/* Location Totals */}
      {analytics?.locationTotals && analytics.locationTotals.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          {analytics.locationTotals.map(location => (
            <Card key={location.storeName}>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{location.productCount}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Products at {location.storeName}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default OrderingDashboard;
