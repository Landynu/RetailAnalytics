import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getOrderingAnalytics, getUserStores } from 'wasp/client/operations';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Loader2, ArrowRightLeft, AlertTriangle, LayoutGrid, Package } from 'lucide-react';
import { computeTransferPlan, detectCategoryGaps, buildCategoryMatrix } from '../lib/transferEngine';
import TransferOverview from '../components/transfers/TransferOverview';
import TransferTable from '../components/transfers/TransferTable';
import StaleTable from '../components/transfers/StaleTable';
import GapTable from '../components/transfers/GapTable';
import TransferExportDropdown from '../components/transfers/TransferExportDropdown';
import CategoryThresholdEditor from '../components/transfers/CategoryThresholdEditor';
import DateRangeFilter from '../components/DateRangeFilter';
import LocationSelector from '../components/LocationSelector';

const THRESHOLDS_STORAGE_KEY = 'transferPlanner_categoryThresholds';

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'transfers', label: 'Transfers', icon: ArrowRightLeft },
  { id: 'stale', label: 'Stale Inventory', icon: AlertTriangle },
  { id: 'gaps', label: 'Category Gaps', icon: Package },
];

const TransferPlanner = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedStoreId, setSelectedStoreId] = useState(null); // null = all satellites (filter within tab)
  const [includedStoreIds, setIncludedStoreIds] = useState(null); // which stores to analyze (null = favourites/all)
  const [overrides, setOverrides] = useState({}); // "productId:storeId" -> qty
  const [categoryThresholds, setCategoryThresholds] = useState(() => {
    try {
      const saved = localStorage.getItem(THRESHOLDS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    const centralNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const end = new Date(centralNow);
    end.setHours(23, 59, 59, 999);
    const start = new Date(centralNow);
    start.setDate(start.getDate() - 14);
    start.setHours(0, 0, 0, 0);
    return { start: start.toISOString(), end: end.toISOString(), preset: 'last14' };
  });

  const { data: stores } = useQuery(getUserStores);

  // Resolve which stores are included in the analysis
  const allActiveStores = useMemo(() =>
    (stores || []).filter(s => s.isActive),
    [stores]
  );

  const includedStores = useMemo(() => {
    if (!allActiveStores.length) return [];
    if (includedStoreIds === null || includedStoreIds === undefined) {
      // Default: favourites if any, otherwise all active
      const favourites = allActiveStores.filter(s => s.isFavourite);
      return favourites.length > 0 ? favourites : allActiveStores;
    }
    return allActiveStores.filter(s => includedStoreIds.includes(s.id));
  }, [allActiveStores, includedStoreIds]);

  // Always include the hub store in the query even if not explicitly selected
  const hubStore = useMemo(() =>
    allActiveStores.find(s => s.isPrimary),
    [allActiveStores]
  );

  const queryStoreIds = useMemo(() => {
    if (!includedStores.length) return null;
    const ids = includedStores.map(s => s.id);
    // Ensure hub is always included so we have its inventory data
    if (hubStore && !ids.includes(hubStore.id)) {
      ids.push(hubStore.id);
    }
    return ids;
  }, [includedStores, hubStore]);

  const { data: analyticsData, isLoading } = useQuery(
    getOrderingAnalytics,
    {
      storeIds: queryStoreIds,
      dateRange,
      filters: {},
      loadAll: true,
      includeHiddenCategories: false,
    }
  );

  const satelliteStores = useMemo(() =>
    includedStores.filter(s => !s.isPrimary),
    [includedStores]
  );

  const products = analyticsData?.products || [];
  const periodDays = analyticsData?.periodDays || 14;

  // Compute transfer plan (re-runs when overrides change for auto-adjust)
  const transferPlan = useMemo(() => {
    if (!products.length || !hubStore) return null;
    return computeTransferPlan(products, includedStores, periodDays, {}, overrides);
  }, [products, includedStores, periodDays, overrides, hubStore]);

  // Build category matrix for threshold editor
  const categoryMatrix = useMemo(() => {
    if (!products.length || !includedStores.length) return null;
    return buildCategoryMatrix(products, includedStores);
  }, [products, includedStores]);

  // Compute category gaps using custom thresholds
  const categoryGaps = useMemo(() => {
    if (!products.length || !includedStores.length) return [];
    return detectCategoryGaps(products, includedStores, categoryThresholds);
  }, [products, includedStores, categoryThresholds]);

  // Add gap counts to store summaries
  const enrichedStoreSummaries = useMemo(() => {
    if (!transferPlan) return [];
    return transferPlan.storeSummaries.map(summary => ({
      ...summary,
      gapCount: categoryGaps.filter(g => g.storeId === summary.storeId).length,
    }));
  }, [transferPlan, categoryGaps]);

  const handleOverrideChange = (productId, storeId, qty) => {
    const key = `${productId}:${storeId}`;
    setOverrides(prev => {
      if (qty === null || qty === undefined) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: Math.max(0, qty) };
    });
  };

  // Threshold handlers — single cell or batch update
  const handleThresholdChange = useCallback((key, value, batchUpdate) => {
    setCategoryThresholds(prev => {
      let next;
      if (batchUpdate) {
        // Batch: replace entire thresholds object
        next = { ...batchUpdate };
      } else if (value === null || value === undefined) {
        next = { ...prev };
        delete next[key];
      } else {
        next = { ...prev, [key]: Math.max(0, value) };
      }
      localStorage.setItem(THRESHOLDS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const handleResetThresholds = useCallback(() => {
    setCategoryThresholds({});
    localStorage.removeItem(THRESHOLDS_STORAGE_KEY);
  }, []);

  const handleNavigateToStore = (storeId) => {
    setSelectedStoreId(storeId);
    setActiveTab('transfers');
  };

  if (!hubStore && stores && stores.length > 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-amber-800 mb-2">No Primary Store Set</h2>
          <p className="text-amber-700">
            The Transfer Planner needs a primary (hub) store to compute transfer recommendations.
            Go to <a href="/stores" className="underline font-medium">Stores</a> and set your hub store as primary.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-semibold bg-gradient-to-r from-[#14b8a6] via-[#0ea5e9] to-[#2563eb] bg-clip-text text-transparent">
              Transfer Planner
            </h1>
            {isLoading && (
              <Badge variant="secondary" className="h-7 px-3 text-xs font-medium flex items-center gap-2 bg-blue-50 text-blue-700 border-blue-200 shadow-sm rounded-lg">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading analytics...
              </Badge>
            )}
          </div>
          {hubStore && (
            <p className="text-slate-600 mt-1">
              Hub: <span className="font-medium">{hubStore.name}</span> {' '}
              {satelliteStores.length} satellite store{satelliteStores.length !== 1 ? 's' : ''}
              {transferPlan && (
                <span className="text-slate-500">
                  {' '} {transferPlan.transfers.length} transfer recommendations
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <LocationSelector
            stores={allActiveStores}
            selectedIds={includedStoreIds}
            onChange={(ids) => {
              setIncludedStoreIds(ids);
              setOverrides({}); // Reset overrides when stores change
            }}
          />
          <DateRangeFilter dateRange={dateRange} setDateRange={setDateRange} />
          {transferPlan && (
            <TransferExportDropdown
              transferPlan={transferPlan}
              categoryGaps={categoryGaps}
              satelliteStores={satelliteStores}
              overrides={overrides}
            />
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          let count = null;
          if (transferPlan) {
            if (tab.id === 'transfers') count = transferPlan.transfers.length;
            else if (tab.id === 'stale') count = transferPlan.staleFlags.length;
            else if (tab.id === 'gaps') count = categoryGaps.length;
          }
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {count != null && count > 0 && (
                <Badge variant={isActive ? 'default' : 'secondary'} className="text-xs px-1.5 py-0 min-w-[20px] justify-center">
                  {count}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {isLoading && !transferPlan ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-3" />
            <p className="text-slate-600">Computing transfer recommendations...</p>
          </div>
        </div>
      ) : transferPlan ? (
        <>
          {activeTab === 'overview' && (
            <TransferOverview
              transferPlan={transferPlan}
              categoryGaps={categoryGaps}
              storeSummaries={enrichedStoreSummaries}
              hubStore={hubStore}
              onNavigateToStore={handleNavigateToStore}
            />
          )}
          {activeTab === 'transfers' && (
            <TransferTable
              transfers={transferPlan.transfers}
              satelliteStores={satelliteStores}
              hubRemaining={transferPlan.hubRemaining}
              selectedStoreId={selectedStoreId}
              onStoreChange={setSelectedStoreId}
              overrides={overrides}
              onOverrideChange={handleOverrideChange}
            />
          )}
          {activeTab === 'stale' && (
            <StaleTable
              staleFlags={transferPlan.staleFlags}
              satelliteStores={satelliteStores}
              selectedStoreId={selectedStoreId}
              onStoreChange={setSelectedStoreId}
            />
          )}
          {activeTab === 'gaps' && (
            <div className="space-y-6">
              {categoryMatrix && (
                <CategoryThresholdEditor
                  categoryMatrix={categoryMatrix}
                  satelliteStores={satelliteStores}
                  hubStore={hubStore}
                  thresholds={categoryThresholds}
                  onThresholdsChange={handleThresholdChange}
                  onResetThresholds={handleResetThresholds}
                />
              )}
              <GapTable
                categoryGaps={categoryGaps}
                satelliteStores={satelliteStores}
                selectedStoreId={selectedStoreId}
                onStoreChange={setSelectedStoreId}
              />
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center justify-center h-64">
          <p className="text-slate-500">No data available. Load the Ordering page first to populate analytics.</p>
        </div>
      )}
    </div>
  );
};

export default TransferPlanner;
