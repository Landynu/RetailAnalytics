import React, { useState } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getBrandDistributors, getDistributors } from 'wasp/client/operations';
import { updateBrandDistributors, createDistributor, seedDistributors, syncBrands } from 'wasp/client/operations';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { Check, Plus, Search, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

const BrandMapping = () => {
  const { data: brandMappings, refetch: refetchMappings } = useQuery(getBrandDistributors);
  const { data: distributors, refetch: refetchDistributors } = useQuery(getDistributors);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingBrand, setEditingBrand] = useState(null);
  const [selectedDistributors, setSelectedDistributors] = useState([]);
  const [newDistributorName, setNewDistributorName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Smart sort: unmapped first, then by most recent activity
  const filteredBrands = (brandMappings || [])
    .filter(b => b.brandName.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
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
      alert('Error saving: ' + error.message);
    }
  };

  const handleCreateDistributor = async () => {
    if (!newDistributorName.trim()) return;
    
    setIsCreating(true);
    try {
      await createDistributor({ name: newDistributorName.trim() });
      setNewDistributorName('');
      refetchDistributors();
      alert(`Distributor "${newDistributorName}" created successfully!`);
    } catch (error) {
      alert('Error creating distributor: ' + error.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleSeedDistributors = async () => {
    if (confirm('Create default distributors (Direct, Open Fields, etc.)?')) {
      try {
        const result = await seedDistributors();
        alert(`${result.created} distributors created!`);
        refetchDistributors();
      } catch (error) {
        alert('Error: ' + error.message);
      }
    }
  };

  const handleSyncBrands = async () => {
    if (confirm('Sync all brands from product catalog?')) {
      try {
        const result = await syncBrands();
        alert(`${result.created} new brands synced!\nTotal: ${result.totalBrands} brands`);
        refetchMappings();
      } catch (error) {
        alert('Error: ' + error.message);
      }
    }
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

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search brands..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Brand List */}
        <div className="grid gap-3">
          {!brandMappings || brandMappings.length === 0 ? (
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

        {/* Summary Stats */}
        <Card className="p-4 bg-emerald-50">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-emerald-900">
                {brandMappings?.length || 0}
              </div>
              <div className="text-sm text-emerald-700">Total Brands</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-900">
                {brandMappings?.filter(b => b.distributors.length > 0).length || 0}
              </div>
              <div className="text-sm text-emerald-700">Mapped Brands</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-900">
                {distributors?.length || 0}
              </div>
              <div className="text-sm text-emerald-700">Distributors</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default BrandMapping;
