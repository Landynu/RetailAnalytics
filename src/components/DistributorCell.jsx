import React, { useState } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { updateBrandDistributors } from 'wasp/client/operations';

const DistributorCell = ({ brand, distributors, allDistributors }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState(distributors.map(d => d.id));
  const [isLoading, setIsLoading] = useState(false);
  // Optimistic update state
  const [optimisticDistributors, setOptimisticDistributors] = useState(null);
  
  const handleToggle = (distId) => {
    const newSelected = selectedIds.includes(distId)
      ? selectedIds.filter(id => id !== distId)
      : [...selectedIds, distId];
    setSelectedIds(newSelected);
  };
  
  const handleSave = async () => {
    setIsLoading(true);
    
    // Optimistic update - show changes immediately
    const newDistributors = selectedIds.map((id, index) => {
      const dist = allDistributors.find(d => d.id === id);
      return {
        id: dist.id,
        name: dist.name,
        isPrimary: index === 0
      };
    });
    setOptimisticDistributors(newDistributors);
    setIsOpen(false);
    
    try {
      await updateBrandDistributors({ 
        brandName: brand, 
        distributorIds: selectedIds 
      });
      // Clear optimistic state after successful save (real data will come from refetch)
      setTimeout(() => setOptimisticDistributors(null), 500);
    } catch (error) {
      // Revert optimistic update on error
      setOptimisticDistributors(null);
      alert('Error updating distributors: ' + error.message);
      setIsOpen(true);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Use optimistic state if available, otherwise use props
  const displayDistributors = optimisticDistributors || distributors;
  
  if (!isOpen) {
    return (
      <div className="flex items-center gap-2 flex-wrap min-w-[150px]">
        {displayDistributors.length > 0 ? (
          displayDistributors.map(d => (
            <Badge 
              key={d.id} 
              variant={d.isPrimary ? 'default' : 'outline'}
              className={cn("text-xs", optimisticDistributors && "opacity-70")}
            >
              {d.name}
            </Badge>
          ))
        ) : (
          <span className="text-xs text-muted-foreground">None</span>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(true)}
          className="h-6 px-2"
          disabled={isLoading}
        >
          <ChevronsUpDown className="h-3 w-3" />
        </Button>
      </div>
    );
  }
  
  return (
    <div className="border rounded p-2 bg-white shadow-lg z-10 min-w-[200px]">
      <div className="space-y-1 max-h-48 overflow-auto">
        {allDistributors.map(dist => (
          <div
            key={dist.id}
            onClick={() => handleToggle(dist.id)}
            className={cn(
              "flex items-center space-x-2 cursor-pointer hover:bg-muted p-1 rounded",
              selectedIds.includes(dist.id) && "bg-muted"
            )}
          >
            <div className={cn(
              "flex h-4 w-4 items-center justify-center border rounded",
              selectedIds.includes(dist.id) && "bg-emerald-600 border-emerald-600"
            )}>
              {selectedIds.includes(dist.id) && (
                <Check className="h-3 w-3 text-white" />
              )}
            </div>
            <span className="text-sm">{dist.name}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-2 pt-2 border-t">
        <Button 
          size="sm" 
          onClick={handleSave}
          disabled={isLoading}
        >
          {isLoading ? 'Saving...' : 'Save'}
        </Button>
        <Button 
          size="sm" 
          variant="outline" 
          onClick={() => {
            setSelectedIds(distributors.map(d => d.id));
            setIsOpen(false);
          }}
          disabled={isLoading}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
};

export default DistributorCell;
