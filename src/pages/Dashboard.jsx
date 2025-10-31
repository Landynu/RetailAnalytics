import React, { useState, useEffect } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getUserStores, getGlobalAnalyticsFiltered, getGlobalSalesAnalytics, getDailySalesAnalytics } from 'wasp/client/operations';
import { Link } from 'wasp/client/router';
import { CreateStoreModal } from '../components/CreateStoreModal';
import LocationSelector from '../components/LocationSelector';
import FilterDropdown from '../components/FilterDropdown';
import DateRangeFilter from '../components/DateRangeFilter';
import KPICard from '../components/KPICard';
import GlobalAnalyticsDashboard from '../components/GlobalAnalyticsDashboard';
import SalesAnalyticsDashboard from '../components/SalesAnalyticsDashboard';
import CompactStoreCard from '../components/CompactStoreCard';
import InPageStoreDetail from '../components/InPageStoreDetail';
import ExportButton from '../components/ExportButton';
import { Button } from '../components/ui/button';
import { Plus, Upload, Package, DollarSign, Store as StoreIcon, Leaf, TrendingUp, Star } from 'lucide-react';
import { useDebounce } from '../lib/useDebounce';

// Default to last 14 days for performance
const getDefault14DayRange = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 14);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0]
  };
};

const DEFAULT_FILTERS = {
  categories: [],
  subcategories: [],
  brands: [],
  strainTypes: [],
  priceRange: null,
  stockStatus: null,
  dateRange: getDefault14DayRange() // Default to last 14 days
};

// Version for localStorage - increment when DEFAULT_FILTERS structure changes
const FILTERS_VERSION = '2.0';

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
    // Check version and clear if outdated
    const savedVersion = localStorage.getItem('retailAnalyticsFiltersVersion');
    if (savedVersion !== FILTERS_VERSION) {
      // Clear old filters and set new version
      localStorage.removeItem('retailAnalyticsFilters');
      localStorage.setItem('retailAnalyticsFiltersVersion', FILTERS_VERSION);
      console.log('🔄 Filters reset due to version update');
      return DEFAULT_FILTERS;
    }
    
    // Load from localStorage only if version matches
    const saved = localStorage.getItem('retailAnalyticsFilters');
    const loadedFilters = saved ? JSON.parse(saved) : DEFAULT_FILTERS;
    
    // Ensure dateRange exists (backward compatibility)
    if (!loadedFilters.dateRange) {
      loadedFilters.dateRange = getDefault14DayRange();
    }
    
    return loadedFilters;
  });
  const [focusedStoreId, setFocusedStoreId] = useState(null);
  const [activeView, setActiveView] = useState(() => {
    const saved = localStorage.getItem('dashboardView');
    return saved || 'inventory'; // 'inventory' or 'sales'
  });
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(() => {
    const saved = localStorage.getItem('showOnlyFavorites');
    return saved ? JSON.parse(saved) : false;
  });
  const [showDailyTrends, setShowDailyTrends] = useState(false); // Default to weekly view

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

  // Persist filters to localStorage with version
  useEffect(() => {
    localStorage.setItem('retailAnalyticsFilters', JSON.stringify(filters));
    localStorage.setItem('retailAnalyticsFiltersVersion', FILTERS_VERSION);
  }, [filters]);

  // Persist active view
  useEffect(() => {
    localStorage.setItem('dashboardView', activeView);
  }, [activeView]);

  // Persist favorite filter setting
  useEffect(() => {
    localStorage.setItem('showOnlyFavorites', JSON.stringify(showOnlyFavorites));
  }, [showOnlyFavorites]);

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

  // Fetch sales analytics with filters (weekly by default)
  const { data: salesData, isLoading: salesLoading, refetch: refetchSales } = useQuery(
    getGlobalSalesAnalytics,
    { storeIds: selectedStoreIds, filters: effectiveFilters },
    { enabled: !focusedStoreId && activeView === 'sales' && !showDailyTrends }
  );

  // Fetch daily sales analytics when daily view is active
  const { data: dailySalesData, isLoading: dailySalesLoading } = useQuery(
    getDailySalesAnalytics,
    { storeIds: selectedStoreIds, filters: effectiveFilters },
    { enabled: !focusedStoreId && activeView === 'sales' && showDailyTrends }
  );

  // React Query automatically refetches when parameters change, so we don't need manual refetch
  // Removed aggressive polling that was causing performance issues

  // Calculate store metrics for compact cards
  const storeMetrics = analytics?.storePerformance?.reduce((acc, store) => {
    acc[store.storeId] = {
      products: store.products,
      value: store.value
    };
    return acc;
  }, {}) || {};

  // Filter and sort stores: favorite filter + sorting by favorite > active > disabled
  const displayStores = React.useMemo(() => {
    if (!stores) return [];
    
    // Apply favorite filter if enabled
    let filtered = showOnlyFavorites 
      ? stores.filter(s => s.isFavourite)
      : stores;
    
    // Sort by: favorite first, then active, then disabled
    return filtered.sort((a, b) => {
      // First priority: favorites
      if (a.isFavourite !== b.isFavourite) {
        return a.isFavourite ? -1 : 1;
      }
      // Second priority: active status
      if (a.isActive !== b.isActive) {
        return a.isActive ? -1 : 1;
      }
      // Default: alphabetical by name
      return a.name.localeCompare(b.name);
    });
  }, [stores, showOnlyFavorites]);

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

        <DateRangeFilter
          dateRange={filters.dateRange}
          onChange={(range) => setFilters({ ...filters, dateRange: range })}
        />

        {(filters.categories.length > 0 || filters.subcategories.length > 0 || 
          filters.brands.length > 0 || filters.strainTypes.length > 0 || filters.dateRange) && (
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
          salesData={showDailyTrends ? dailySalesData : salesData} 
          loading={showDailyTrends ? dailySalesLoading : salesLoading}
          showDaily={showDailyTrends}
          onToggleDaily={() => setShowDailyTrends(!showDailyTrends)}
        />
      )}

      {/* Store Cards Grid */}
      {stores && stores.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">Your Stores</h2>
              <Button
                variant={showOnlyFavorites ? "default" : "outline"}
                size="sm"
                onClick={() => setShowOnlyFavorites(!showOnlyFavorites)}
              >
                <Star className={`h-4 w-4 mr-1 ${showOnlyFavorites ? 'fill-current' : ''}`} />
                {showOnlyFavorites ? 'Showing Favorites' : 'Show Favorites'}
              </Button>
            </div>
            <div className="flex gap-2 text-sm text-muted-foreground">
              <span>{stores.filter(s => s.isActive).length} active</span>
              <span>•</span>
              <span>{stores.filter(s => s.isFavourite).length} favourites</span>
              {showOnlyFavorites && (
                <>
                  <span>•</span>
                  <span>{displayStores.length} shown</span>
                </>
              )}
            </div>
          </div>
          {displayStores.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {displayStores.map(store => (
                <CompactStoreCard
                  key={store.id}
                  store={store}
                  metrics={storeMetrics[store.id]}
                  onViewDetails={() => setFocusedStoreId(store.id)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Star className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No favorite stores yet. Click the star on a store card to mark it as a favorite.</p>
            </div>
          )}
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
