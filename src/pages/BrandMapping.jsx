import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getBrandDistributors, getDistributors } from 'wasp/client/operations';
import { updateBrandDistributors, createDistributor, seedDistributors, syncBrands } from 'wasp/client/operations';
import { toast } from 'sonner';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { Check, Plus, Search, RefreshCw, Filter, X, Building2 } from 'lucide-react';
import { cn } from '../lib/utils';
import KPICard from '../components/KPICard';

const BrandMapping = () => {
  const { data: brandMappings, refetch: refetchMappings, isLoading: isLoadingMappings } = useQuery(getBrandDistributors);
  const { data: distributors, refetch: refetchDistributors } = useQuery(getDistributors);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingBrand, setEditingBrand] = useState(null);
  const [selectedDistributors, setSelectedDistributors] = useState([]);
  const [newDistributorName, setNewDistributorName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  
  // Filter states
  const [filterDistributors, setFilterDistributors] = useState([]);
  const [mappingStatusFilter, setMappingStatusFilter] = useState('all'); // 'all' | 'mapped' | 'unmapped'
  const [showFilters, setShowFilters] = useState(false);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  const [hasAutoSynced, setHasAutoSynced] = useState(false);
  const [confirmState, setConfirmState] = useState({ open: false, title: '', description: '', action: null });

  // Auto-sync brands on page load if no brands exist
  useEffect(() => {
    if (!brandMappings && !isLoadingMappings && !hasAutoSynced && !isAutoSyncing) {
      setHasAutoSynced(true);
      setIsAutoSyncing(true);
      syncBrands()
        .then(() => {
          refetchMappings();
        })
        .catch((error) => {
          console.error('Auto-sync error:', error);
        })
        .finally(() => {
          setIsAutoSyncing(false);
        });
    }
  }, [brandMappings, isLoadingMappings, hasAutoSynced, isAutoSyncing, refetchMappings]);

  // Calculate brand counts per distributor
  const distributorBrandCounts = useMemo(() => {
    const counts = {};
    brandMappings?.forEach(brand => {
      brand.distributors.forEach(dist => {
        counts[dist.id] = (counts[dist.id] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .map(([id, count]) => ({
        id: parseInt(id),
        name: distributors?.find(d => d.id === parseInt(id))?.name || 'Unknown',
        count
      }))
      .sort((a, b) => b.count - a.count);
  }, [brandMappings, distributors]);

  // Filter and sort brands
  const filteredBrands = useMemo(() => {
    let filtered = (brandMappings || []);

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(b => 
        b.brandName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Mapping status filter
    if (mappingStatusFilter === 'mapped') {
      filtered = filtered.filter(b => b.hasDistributors);
    } else if (mappingStatusFilter === 'unmapped') {
      filtered = filtered.filter(b => !b.hasDistributors);
    }

    // Distributor filter
    if (filterDistributors.length > 0) {
      filtered = filtered.filter(b => 
        b.distributors.some(d => filterDistributors.includes(d.id))
      );
    }

    // Sort: unmapped first, then by most recent activity
    return filtered.sort((a, b) => {
      // Priority 1: Unmapped brands first
      if (!a.hasDistributors && b.hasDistributors) return -1;
      if (a.hasDistributors && !b.hasDistributors) return 1;
      
      // Priority 2: Most recent activity
      if (a.lastActivity && b.lastActivity) {
        return new Date(b.lastActivity) - new Date(a.lastActivity);
      }
      if (a.lastActivity && !b.lastActivity) return -1;
      if (!a.lastActivity && b.lastActivity) return 1;
      
      // Priority 3: Alphabetical
      return a.brandName.localeCompare(b.brandName);
    });
  }, [brandMappings, searchTerm, mappingStatusFilter, filterDistributors]);

  const handleToggleFilterDistributor = (distId) => {
    if (filterDistributors.includes(distId)) {
      setFilterDistributors(filterDistributors.filter(id => id !== distId));
    } else {
      setFilterDistributors([...filterDistributors, distId]);
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setFilterDistributors([]);
    setMappingStatusFilter('all');
  };

  const hasActiveFilters = searchTerm || filterDistributors.length > 0 || mappingStatusFilter !== 'all';

  const handleEdit = (brand) => {
    setEditingBrand(brand.brandName);
    setSelectedDistributors(brand.distributors.map(d => d.id));
  };

  const handleToggleDistributor = (distId) => {
    if (selectedDistributors.includes(distId)) {
      setSelectedDistributors(selectedDistributors.filter(id => id !== distId));
    } else {
      setSelectedDistributors([...selectedDistributors, distId]);
    }
  };

  const handleSave = async () => {
    try {
      await updateBrandDistributors({
        brandName: editingBrand,
        distributorIds: selectedDistributors
      });
      setEditingBrand(null);
      setSelectedDistributors([]);
      refetchMappings();
    } catch (error) {
      toast.error('Error saving: ' + error.message);
    }
  };

  const handleCreateDistributor = async () => {
    if (!newDistributorName.trim()) return;

    setIsCreating(true);
    try {
      await createDistributor({ name: newDistributorName.trim() });
      setNewDistributorName('');
      refetchDistributors();
      toast.success(`Distributor "${newDistributorName}" created successfully!`);
    } catch (error) {
      toast.error('Error creating distributor: ' + error.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleSeedDistributors = () => {
    setConfirmState({
      open: true,
      title: 'Seed Distributors',
      description: 'Create default distributors (Direct, Open Fields, etc.)?',
      action: async () => {
        try {
          const result = await seedDistributors();
          toast.success(`${result.created} distributors created!`);
          refetchDistributors();
        } catch (error) {
          toast.error('Error: ' + error.message);
        }
      }
    });
  };

  const handleSyncBrands = () => {
    setConfirmState({
      open: true,
      title: 'Sync Brands',
      description: 'Sync all brands from product catalog?',
      action: async () => {
        try {
          const result = await syncBrands();
          toast.success(`${result.created} new brands synced! Total: ${result.totalBrands} brands`);
          refetchMappings();
        } catch (error) {
          toast.error('Error: ' + error.message);
        }
      }
    });
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-emerald-800">Brand-Distributor Mapping</h1>
            <p className="text-emerald-700 mt-1">
              Manage distributor assignments for {brandMappings?.length || 0} brands
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSeedDistributors} variant="outline">
              🏢 Seed Distributors
            </Button>
            <Button onClick={handleSyncBrands} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Sync Brands
            </Button>
          </div>
        </div>

        {/* Distributor Management */}
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-3">Distributor Management</h2>
          <div className="flex gap-2 mb-4">
            <Input
              placeholder="New distributor name..."
              value={newDistributorName}
              onChange={(e) => setNewDistributorName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateDistributor()}
            />
            <Button 
              onClick={handleCreateDistributor}
              disabled={!newDistributorName.trim() || isCreating}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(distributors || []).map(d => (
              <Badge key={d.id} variant="secondary" className="text-sm py-1 px-3">
                {d.name}
              </Badge>
            ))}
          </div>
        </Card>

        {/* Search and Filters */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search brands..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              variant={showFilters ? "default" : "outline"}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters}>
                <X className="h-4 w-4 mr-2" />
                Clear
              </Button>
            )}
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <Card className="p-4">
              <div className="space-y-4">
                {/* Mapping Status Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Mapping Status</label>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={mappingStatusFilter === 'all' ? 'default' : 'outline'}
                      onClick={() => setMappingStatusFilter('all')}
                    >
                      All
                    </Button>
                    <Button
                      size="sm"
                      variant={mappingStatusFilter === 'mapped' ? 'default' : 'outline'}
                      onClick={() => setMappingStatusFilter('mapped')}
                    >
                      Mapped
                    </Button>
                    <Button
                      size="sm"
                      variant={mappingStatusFilter === 'unmapped' ? 'default' : 'outline'}
                      onClick={() => setMappingStatusFilter('unmapped')}
                    >
                      Unmapped
                    </Button>
                  </div>
                </div>

                {/* Distributor Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Filter by Distributor</label>
                  <div className="flex flex-wrap gap-2">
                    {(distributors || []).map(dist => (
                      <Badge
                        key={dist.id}
                        variant={filterDistributors.includes(dist.id) ? 'default' : 'outline'}
                        className="cursor-pointer text-sm py-1 px-3"
                        onClick={() => handleToggleFilterDistributor(dist.id)}
                      >
                        {filterDistributors.includes(dist.id) && (
                          <Check className="h-3 w-3 mr-1" />
                        )}
                        {dist.name}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Active Filter Chips */}
                {hasActiveFilters && (
                  <div className="pt-2 border-t">
                    <div className="text-xs text-muted-foreground mb-2">Active Filters:</div>
                    <div className="flex flex-wrap gap-2">
                      {searchTerm && (
                        <Badge variant="secondary" className="text-xs">
                          Search: "{searchTerm}"
                          <X 
                            className="h-3 w-3 ml-1 cursor-pointer" 
                            onClick={() => setSearchTerm('')}
                          />
                        </Badge>
                      )}
                      {mappingStatusFilter !== 'all' && (
                        <Badge variant="secondary" className="text-xs">
                          Status: {mappingStatusFilter}
                          <X 
                            className="h-3 w-3 ml-1 cursor-pointer" 
                            onClick={() => setMappingStatusFilter('all')}
                          />
                        </Badge>
                      )}
                      {filterDistributors.map(distId => {
                        const dist = distributors?.find(d => d.id === distId);
                        return dist ? (
                          <Badge key={distId} variant="secondary" className="text-xs">
                            {dist.name}
                            <X 
                              className="h-3 w-3 ml-1 cursor-pointer" 
                              onClick={() => handleToggleFilterDistributor(distId)}
                            />
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Brand List */}
        <div className="grid gap-3">
          {isAutoSyncing ? (
            <Card className="p-8 text-center">
              <h3 className="text-lg font-semibold text-emerald-900 mb-2">
                Syncing Brands...
              </h3>
              <p className="text-muted-foreground mb-4">
                Loading brands from your product catalog
              </p>
              <RefreshCw className="h-6 w-6 mx-auto animate-spin text-emerald-600" />
            </Card>
          ) : !brandMappings || brandMappings.length === 0 ? (
            <Card className="p-8 text-center">
              <h3 className="text-lg font-semibold text-emerald-900 mb-2">
                No Brands Yet
              </h3>
              <p className="text-muted-foreground mb-4">
                Click the button below to sync all brands from your product catalog
              </p>
              <Button onClick={handleSyncBrands} size="lg" className="bg-emerald-600">
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync Brands from Catalog
              </Button>
            </Card>
          ) : filteredBrands.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              <p className="mb-2">No brands match your search</p>
              <Button onClick={() => setSearchTerm('')} variant="outline" size="sm">
                Clear Search
              </Button>
            </Card>
          ) : (
            filteredBrands.map(brand => (
              <Card key={brand.brandName} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg text-emerald-900 mb-2">
                      {brand.brandName}
                    </h3>
                    
                    {editingBrand === brand.brandName ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          {(distributors || []).map(dist => (
                            <div
                              key={dist.id}
                              onClick={() => handleToggleDistributor(dist.id)}
                              className={cn(
                                "flex items-center space-x-2 cursor-pointer p-2 rounded border",
                                selectedDistributors.includes(dist.id)
                                  ? "bg-emerald-50 border-emerald-500"
                                  : "hover:bg-muted border-transparent"
                              )}
                            >
                              <div className={cn(
                                "flex h-5 w-5 items-center justify-center border-2 rounded",
                                selectedDistributors.includes(dist.id)
                                  ? "bg-emerald-600 border-emerald-600"
                                  : "border-gray-300"
                              )}>
                                {selectedDistributors.includes(dist.id) && (
                                  <Check className="h-3 w-3 text-white" />
                                )}
                              </div>
                              <span className="text-sm font-medium">{dist.name}</span>
                              {selectedDistributors.indexOf(dist.id) === 0 && selectedDistributors.includes(dist.id) && (
                                <Badge variant="default" className="text-xs ml-auto">
                                  Primary
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={handleSave}>
                            Save Changes
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => {
                              setEditingBrand(null);
                              setSelectedDistributors([]);
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        {brand.distributors.length > 0 ? (
                          brand.distributors.map(d => (
                            <Badge 
                              key={d.id}
                              variant={d.isPrimary ? 'default' : 'outline'}
                              className="text-sm"
                            >
                              {d.name}
                              {d.isPrimary && <span className="ml-1">★</span>}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">No distributors assigned</span>
                        )}
                      </div>
                    )}
                  </div>

                  {editingBrand !== brand.brandName && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleEdit(brand)}
                    >
                      Edit
                    </Button>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>

        {/* KPI Section */}
        <div className="space-y-4">
          {/* Overall Stats */}
          <div className="grid gap-4 md:grid-cols-3">
            <KPICard
              title="Total Brands"
              value={brandMappings?.length || 0}
              description="All brands in system"
              icon={Building2}
              loading={isLoadingMappings || isAutoSyncing}
            />
            <KPICard
              title="Mapped Brands"
              value={brandMappings?.filter(b => b.distributors.length > 0).length || 0}
              description="With distributor assigned"
              icon={Check}
              loading={isLoadingMappings || isAutoSyncing}
            />
            <KPICard
              title="Unmapped Brands"
              value={brandMappings?.filter(b => b.distributors.length === 0).length || 0}
              description="Need distributor assignment"
              icon={Building2}
              iconColor="text-amber-600"
              bgColor="bg-amber-50"
              loading={isLoadingMappings || isAutoSyncing}
            />
          </div>

          {/* Distributor Brand Counts */}
          {distributorBrandCounts.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 text-emerald-800">
                Brands per Distributor
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {distributorBrandCounts.slice(0, 10).map(({ id, name, count }) => (
                  <KPICard
                    key={id}
                    title={name}
                    value={count}
                    description={`${count === 1 ? 'brand' : 'brands'}`}
                    icon={Building2}
                    iconColor="text-emerald-600"
                    bgColor="bg-emerald-50"
                    loading={isLoadingMappings || isAutoSyncing}
                  />
                ))}
              </div>
              {distributorBrandCounts.length > 10 && (
                <p className="text-sm text-muted-foreground mt-2 text-center">
                  Showing top 10 of {distributorBrandCounts.length} distributors
                </p>
              )}
            </div>
          )}
        </div>

        <ConfirmDialog
          open={confirmState.open}
          onOpenChange={(open) => setConfirmState({ ...confirmState, open })}
          title={confirmState.title}
          description={confirmState.description}
          onConfirm={() => {
            confirmState.action?.();
            setConfirmState({ open: false, title: '', description: '', action: null });
          }}
        />
      </div>
    </div>
  );
};

export default BrandMapping;
