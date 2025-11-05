import React, { useState, useMemo } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { updateProductEnrichment } from 'wasp/client/operations';

const SubcategoryCell = ({ product, categoryDefinitions }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(product.subcategoryId);
  const [isLoading, setIsLoading] = useState(false);
  const [optimisticSubcategory, setOptimisticSubcategory] = useState(null);
  
  // Get subcategories for the selected category
  const availableSubcategories = useMemo(() => {
    if (!product.categoryDefinitionId) return [];
    const category = categoryDefinitions.find(c => c.id === product.categoryDefinitionId);
    return category?.subcategories || [];
  }, [product.categoryDefinitionId, categoryDefinitions]);
  
  const handleSelect = async (subcategoryId) => {
    setSelectedId(subcategoryId);
    setIsLoading(true);
    setIsOpen(false);
    
    // Optimistic update
    const subcategory = availableSubcategories.find(s => s.id === subcategoryId);
    setOptimisticSubcategory(subcategory);
    
    try {
      await updateProductEnrichment({ 
        productId: product.id, 
        updates: { subcategoryId: subcategoryId || null } 
      });
      setTimeout(() => setOptimisticSubcategory(null), 500);
    } catch (error) {
      setOptimisticSubcategory(null);
      setSelectedId(product.subcategoryId);
      alert('Error updating subcategory: ' + error.message);
      setIsOpen(true);
    } finally {
      setIsLoading(false);
    }
  };
  
  const displaySubcategory = optimisticSubcategory || 
    availableSubcategories.find(s => s.id === product.subcategoryId) ||
    (product.subcategory && { name: product.subcategory });
  
  if (!product.categoryDefinitionId) {
    return (
      <span className="text-xs text-muted-foreground">Select category first</span>
    );
  }
  
  if (!isOpen) {
    return (
      <div className="flex items-center gap-2 min-w-[120px]">
        {displaySubcategory ? (
          <Badge 
            variant="outline"
            className={cn("text-xs", optimisticSubcategory && "opacity-70")}
          >
            {displaySubcategory.name}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">None</span>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(true)}
          className="h-6 px-2"
          disabled={isLoading || availableSubcategories.length === 0}
        >
          <ChevronsUpDown className="h-3 w-3" />
        </Button>
      </div>
    );
  }
  
  return (
    <div className="border rounded p-2 bg-white shadow-lg z-10 min-w-[200px]">
      <div className="space-y-1 max-h-48 overflow-auto">
        <div
          onClick={() => handleSelect(null)}
          className={cn(
            "flex items-center space-x-2 cursor-pointer hover:bg-muted p-1 rounded",
            !selectedId && "bg-muted"
          )}
        >
          <div className={cn(
            "flex h-4 w-4 items-center justify-center border rounded",
            !selectedId && "bg-emerald-600 border-emerald-600"
          )}>
            {!selectedId && (
              <Check className="h-3 w-3 text-white" />
            )}
          </div>
          <span className="text-sm">None</span>
        </div>
        {availableSubcategories.map(subcategory => (
          <div
            key={subcategory.id}
            onClick={() => handleSelect(subcategory.id)}
            className={cn(
              "flex items-center space-x-2 cursor-pointer hover:bg-muted p-1 rounded",
              selectedId === subcategory.id && "bg-muted"
            )}
          >
            <div className={cn(
              "flex h-4 w-4 items-center justify-center border rounded",
              selectedId === subcategory.id && "bg-emerald-600 border-emerald-600"
            )}>
              {selectedId === subcategory.id && (
                <Check className="h-3 w-3 text-white" />
              )}
            </div>
            <span className="text-sm">{subcategory.name}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-2 pt-2 border-t">
        <Button 
          size="sm" 
          variant="outline" 
          onClick={() => {
            setSelectedId(product.subcategoryId);
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

export default SubcategoryCell;

