import React, { useState, useEffect } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getUserStores, getGlobalAnalyticsFiltered } from 'wasp/client/operations';
import { Link } from 'wasp/client/router';
import { CreateStoreModal } from '../components/CreateStoreModal';
import LocationSelector from '../components/LocationSelector';
import AdvancedFilterPanel from '../components/AdvancedFilterPanel';
import KPICard from '../components/KPICard';
import GlobalAnalyticsDashboard from '../components/GlobalAnalyticsDashboard';
import CompactStoreCard from '../components/CompactStoreCard';
import InPageStoreDetail from '../components/InPageStoreDetail';
import ExportButton from '../components/ExportButton';
import { Button } from '../components/ui/button';
import { Plus, Upload, Package, DollarSign, Store as StoreIcon, Leaf } from 'lucide-react';
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
  const [filters, setFilters] = useState(() => {
    // Load from localStorage
    const saved = localStorage.getItem('retailAnalyticsFilters');
    return saved ? JSON.parse(saved) : DEFAULT_FILTERS;
  });
  const [focusedStoreId, setFocusedStoreId] = useState(null);

  // Persist hideAccessories setting
  useEffect(() => {
    localStorage.setItem('hideAccessories', JSON.stringify(hideAccessories));
  }, [hideAccessories]);

  // Debounce filters for better performance
  const debouncedFilters = useDebounce(filters, 300);

  // Persist filters to localStorage
  useEffect(() => {
    localStorage.setItem('retailAnalyticsFilters', JSON.stringify(filters));
  }, [filters]);

  // Apply hideAccessories to filters
  const effectiveFilters = {
    ...debouncedFilters,
    excludeCategories: hideAccessories ? ['Accessories', 'Accessory'] : []
  };

  // Fetch analytics with filters
  const { data: analytics, isLoading: analyticsLoading } = useQuery(
    getGlobalAnalyticsFiltered,
    { storeIds: selectedStoreIds, filters: effectiveFilters },
    { enabled: !focusedStoreId } // Only fetch when not viewing store detail
  );

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

      {/* Advanced Filters */}
      <AdvancedFilterPanel
        filters={filters}
        onChange={setFilters}
        onClearAll={handleClearFilters}
        availableOptions={{
          availableCategories: analytics?.availableCategories || [],
          availableSubcategories: analytics?.availableSubcategories || [],
          availableBrands: analytics?.availableBrands || [],
          availableStrainTypes: ['Sativa', 'Hybrid', 'Indica', 'N/A']
        }}
      />

      {/* KPI Summary Cards */}
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
          title="Hybrid + Indica"
          value={(analytics?.strainBreakdown?.Hybrid || 0) + (analytics?.strainBreakdown?.Indica || 0)}
          description="units"
          icon={Leaf}
          iconColor="text-purple-600"
          bgColor="bg-purple-50"
          loading={analyticsLoading}
        />
      </div>

      {/* Analytics Dashboard */}
      <GlobalAnalyticsDashboard 
        analytics={analytics} 
        loading={analyticsLoading}
      />

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
