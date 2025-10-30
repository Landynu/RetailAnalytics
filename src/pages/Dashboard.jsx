import React, { useState, useEffect } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getUserStores, getGlobalAnalyticsFiltered, getGlobalSalesAnalytics } from 'wasp/client/operations';
import { Link } from 'wasp/client/router';
import { CreateStoreModal } from '../components/CreateStoreModal';
import LocationSelector from '../components/LocationSelector';
import FilterDropdown from '../components/FilterDropdown';
import KPICard from '../components/KPICard';
import GlobalAnalyticsDashboard from '../components/GlobalAnalyticsDashboard';
import SalesAnalyticsDashboard from '../components/SalesAnalyticsDashboard';
import CompactStoreCard from '../components/CompactStoreCard';
import InPageStoreDetail from '../components/InPageStoreDetail';
import ExportButton from '../components/ExportButton';
import { Button } from '../components/ui/button';
import { Plus, Upload, Package, DollarSign, Store as StoreIcon, Leaf, TrendingUp } from 'lucide-react';
import { useDebounce } from '../lib/useDebounce';

const DEFAULT_FILTERS = {
  categories: [],
  subcategories: [],
  brands: [],
  strainTypes: [],
  priceRange: null,
  stockStatus: null,
  dateRange: null
};

const DashboardPage = () => {
  const { data: stores, isLoading: storesLoading, refetch: refetchStores } = useQuery(getUserStores);
  
  // State management
  const [selectedStoreIds, setSelectedStoreIds] = useState(null); // null = all stores
  const [hideAccessories, setHideAccessories] = useState(() => {
    const saved = localStorage.getItem('hideAccessories');
    return saved ? JSON.parse(saved) : true; // Default to hiding accessories
  });
  const [hideZeroInventory, setHideZeroInventory] = useState(() => {
    const saved = localStorage.getItem('hideZeroInventory');
    return saved ? JSON.parse(saved) : true; // Default to hiding zero inventory
  });
  const [filters, setFilters] = useState(() => {
    // Load from localStorage
    const saved = localStorage.getItem('retailAnalyticsFilters');
    return saved ? JSON.parse(saved) : DEFAULT_FILTERS;
  });
  const [focusedStoreId, setFocusedStoreId] = useState(null);
  const [activeView, setActiveView] = useState(() => {
    const saved = localStorage.getItem('dashboardView');
    return saved || 'inventory'; // 'inventory' or 'sales'
  });

  // Persist hideAccessories setting
  useEffect(() => {
    localStorage.setItem('hideAccessories', JSON.stringify(hideAccessories));
  }, [hideAccessories]);

  // Persist hideZeroInventory setting
  useEffect(() => {
    localStorage.setItem('hideZeroInventory', JSON.stringify(hideZeroInventory));
  }, [hideZeroInventory]);

  // Debounce filters for better performance
  const debouncedFilters = useDebounce(filters, 300);

  // Persist filters to localStorage
  useEffect(() => {
    localStorage.setItem('retailAnalyticsFilters', JSON.stringify(filters));
  }, [filters]);

  // Persist active view
  useEffect(() => {
    localStorage.setItem('dashboardView', activeView);
  }, [activeView]);

  // Apply hideAccessories and hideZeroInventory to filters
  const effectiveFilters = {
    ...debouncedFilters,
    excludeCategories: hideAccessories ? ['Accessories', 'Accessory'] : [],
    stockStatus: hideZeroInventory ? 'inStock' : debouncedFilters.stockStatus
  };

  // Fetch analytics with filters
  const { data: analytics, isLoading: analyticsLoading, refetch: refetchAnalytics } = useQuery(
    getGlobalAnalyticsFiltered,
    { storeIds: selectedStoreIds, filters: effectiveFilters },
    { enabled: !focusedStoreId } // Only fetch when not viewing store detail
  );

  // Fetch sales analytics with filters
  const { data: salesData, isLoading: salesLoading, refetch: refetchSales } = useQuery(
    getGlobalSalesAnalytics,
    { storeIds: selectedStoreIds, filters: effectiveFilters },
    { enabled: !focusedStoreId && activeView === 'sales' }
  );

  // Refetch analytics when effective filters change
  useEffect(() => {
    if (!focusedStoreId) {
      refetchAnalytics();
      if (activeView === 'sales') {
        refetchSales();
      }
    }
  }, [effectiveFilters, selectedStoreIds, focusedStoreId, activeView]);

  // Calculate store metrics for compact cards
  const storeMetrics = analytics?.storePerformance?.reduce((acc, store) => {
    acc[store.storeId] = {
      products: store.products,
      value: store.value
    };
    return acc;
  }, {}) || {};

  const handleClearFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  // If viewing store detail, show that instead
  if (focusedStoreId) {
    return (
      <div className="space-y-6">
        <InPageStoreDetail 
          storeId={focusedStoreId}
          onBack={() => setFocusedStoreId(null)}
        />
      </div>
    );
  }

  if (storesLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse h-12 bg-muted rounded"></div>
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="animate-pulse h-24 bg-muted rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Location Selector */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Analytics Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Multi-location inventory and sales analytics
            </p>
          </div>
          <LocationSelector
            stores={stores || []}
            selectedIds={selectedStoreIds}
            onChange={setSelectedStoreIds}
          />
          <Button
            variant={hideAccessories ? "default" : "outline"}
            size="sm"
            onClick={() => setHideAccessories(!hideAccessories)}
          >
            {hideAccessories ? "Accessories Hidden" : "Show Accessories"}
          </Button>
          <Button
            variant={hideZeroInventory ? "default" : "outline"}
            size="sm"
            onClick={() => setHideZeroInventory(!hideZeroInventory)}
          >
            {hideZeroInventory ? "Zero Stock Hidden" : "Show Zero Stock"}
          </Button>
        </div>
        <div className="flex gap-2">
          <ExportButton 
            storeIds={selectedStoreIds} 
            filters={debouncedFilters}
          />
          <Link to="/upload">
            <Button variant="outline">
              <Upload className="h-4 w-4 mr-2" />
              Upload Data
            </Button>
          </Link>
          <CreateStoreModal onStoreCreated={refetchStores}>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Store
            </Button>
          </CreateStoreModal>
        </div>
      </div>

      {/* Filter Dropdowns */}
      <div className="flex flex-wrap items-center gap-3">
        <FilterDropdown
          label="Categories"
          options={analytics?.availableCategories || []}
          selectedValues={filters.categories}
          onChange={(values) => setFilters({ ...filters, categories: values })}
          icon={Package}
        />
        
        <FilterDropdown
          label="Subcategories"
          options={analytics?.availableSubcategories || []}
          selectedValues={filters.subcategories}
          onChange={(values) => setFilters({ ...filters, subcategories: values })}
        />
        
        <FilterDropdown
          label="Brands"
          options={analytics?.availableBrands || []}
          selectedValues={filters.brands}
          onChange={(values) => setFilters({ ...filters, brands: values })}
        />
        
        <FilterDropdown
          label="Strains"
          options={['Sativa', 'Hybrid', 'Indica', 'N/A']}
          selectedValues={filters.strainTypes}
          onChange={(values) => setFilters({ ...filters, strainTypes: values })}
          icon={Leaf}
        />

        {(filters.categories.length > 0 || filters.subcategories.length > 0 || 
          filters.brands.length > 0 || filters.strainTypes.length > 0) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
          >
            Clear All Filters
          </Button>
        )}
      </div>

      {/* View Tabs */}
      <div className="flex items-center gap-2 border-b border-border">
        <Button
          variant={activeView === 'inventory' ? 'default' : 'ghost'}
          onClick={() => setActiveView('inventory')}
          className="rounded-b-none"
        >
          <Package className="h-4 w-4 mr-2" />
          Inventory
        </Button>
        <Button
          variant={activeView === 'sales' ? 'default' : 'ghost'}
          onClick={() => setActiveView('sales')}
          className="rounded-b-none"
        >
          <TrendingUp className="h-4 w-4 mr-2" />
          Sales Analytics
        </Button>
      </div>

      {/* KPI Summary Cards - Conditional based on view */}
      {activeView === 'inventory' ? (
        <>
          {/* Inventory KPIs - Row 1 */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <KPICard
              title="Total Stores"
              value={analytics?.totalStores || 0}
              description="Active locations"
              icon={StoreIcon}
              loading={analyticsLoading}
            />
            
            <KPICard
              title="Total Products"
              value={analytics?.totalProducts || 0}
              description="Across all stores"
              icon={Package}
              loading={analyticsLoading}
            />
            
            <KPICard
              title="Total Value"
              value={analytics ? `$${analytics.totalValue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}` : '$0'}
              description="Inventory value"
              icon={DollarSign}
              loading={analyticsLoading}
            />
            
            <KPICard
              title="Sativa"
              value={analytics?.strainBreakdown?.Sativa || 0}
              description="units"
              icon={Leaf}
              iconColor="text-green-600"
              bgColor="bg-green-50"
              loading={analyticsLoading}
            />
            
            <KPICard
              title="Hybrid"
              value={analytics?.strainBreakdown?.Hybrid || 0}
              description="units"
              icon={Leaf}
              iconColor="text-amber-600"
              bgColor="bg-amber-50"
              loading={analyticsLoading}
            />
          </div>

          {/* Inventory KPIs - Row 2 */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <KPICard
              title="Indica"
              value={analytics?.strainBreakdown?.Indica || 0}
              description="units"
              icon={Leaf}
              iconColor="text-purple-600"
              bgColor="bg-purple-50"
              loading={analyticsLoading}
            />
          </div>
        </>
      ) : (
        <>
          {/* Sales KPIs - Row 1 */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <KPICard
              title="Total Revenue"
              value={salesData ? `$${salesData.totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}` : '$0'}
              description="From sales"
              icon={DollarSign}
              loading={salesLoading}
            />
            
            <KPICard
              title="Units Sold"
              value={salesData?.totalUnitsSold || 0}
              description="Total units"
              icon={TrendingUp}
              loading={salesLoading}
            />
            
            <KPICard
              title="Avg Transaction"
              value={salesData ? `$${salesData.avgTransactionValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '$0'}
              description="Per unit"
              icon={DollarSign}
              loading={salesLoading}
            />
            
            <KPICard
              title="Sativa Sales"
              value={salesData?.strainSales?.Sativa || 0}
              description="units sold"
              icon={Leaf}
              iconColor="text-green-600"
              bgColor="bg-green-50"
              loading={salesLoading}
            />
            
            <KPICard
              title="Hybrid Sales"
              value={salesData?.strainSales?.Hybrid || 0}
              description="units sold"
              icon={Leaf}
              iconColor="text-amber-600"
              bgColor="bg-amber-50"
              loading={salesLoading}
            />
          </div>

          {/* Sales KPIs - Row 2 */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <KPICard
              title="Indica Sales"
              value={salesData?.strainSales?.Indica || 0}
              description="units sold"
              icon={Leaf}
              iconColor="text-purple-600"
              bgColor="bg-purple-50"
              loading={salesLoading}
            />
          </div>
        </>
      )}

      {/* Analytics Dashboard - Conditional based on view */}
      {activeView === 'inventory' ? (
        <GlobalAnalyticsDashboard 
          analytics={analytics} 
          loading={analyticsLoading}
        />
      ) : (
        <SalesAnalyticsDashboard 
          salesData={salesData} 
          loading={salesLoading}
        />
      )}

      {/* Store Cards Grid */}
      {stores && stores.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Your Stores</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {stores.map(store => (
              <CompactStoreCard
                key={store.id}
                store={store}
                metrics={storeMetrics[store.id]}
                onViewDetails={() => setFocusedStoreId(store.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty State for No Stores */}
      {stores && stores.length === 0 && (
        <div className="text-center py-12">
          <StoreIcon className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No Stores Found</h3>
          <p className="text-muted-foreground mb-6">
            Create your first store to start tracking inventory and analytics
          </p>
          <CreateStoreModal onStoreCreated={refetchStores}>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Store
            </Button>
          </CreateStoreModal>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
