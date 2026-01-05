import React, { useState } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { updateProductEnrichment } from 'wasp/client/operations';

const CategoryCell = ({ product, categoryDefinitions, onCategoryChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(product.categoryDefinitionId);
  const [isLoading, setIsLoading] = useState(false);
  const [optimisticCategory, setOptimisticCategory] = useState(null);
  
  const handleSelect = async (categoryId) => {
    setSelectedId(categoryId);
    setIsLoading(true);
    setIsOpen(false);
    
    // Optimistic update
    const category = categoryDefinitions.find(c => c.id === categoryId);
    setOptimisticCategory(category);
    
    try {
      await updateProductEnrichment({
        productId: product.id,
        updates: {
          categoryDefinitionId: categoryId || null,
          subcategoryId: null // Clear subcategory when category changes
        }
      });
      // Keep the optimistic state as the persisted value - don't clear it
      // The value has been saved to the database and should remain displayed
      if (onCategoryChange) onCategoryChange(categoryId);
    } catch (error) {
      setOptimisticCategory(null);
      setSelectedId(product.categoryDefinitionId);
      alert('Error updating category: ' + error.message);
      setIsOpen(true);
    } finally {
      setIsLoading(false);
    }
  };
  
  const displayCategory = optimisticCategory || 
    categoryDefinitions.find(c => c.id === product.categoryDefinitionId) ||
    (product.parentCategory && { name: product.parentCategory });
  
  if (!isOpen) {
    return (
      <div className="flex items-center gap-2 min-w-[120px]">
        {displayCategory ? (
          <Badge
            variant="outline"
            className={cn("text-xs", isLoading && "opacity-70")}
          >
            {displayCategory.name}
          </Badge>
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
        {categoryDefinitions.map(category => (
          <div
            key={category.id}
            onClick={() => handleSelect(category.id)}
            className={cn(
              "flex items-center space-x-2 cursor-pointer hover:bg-muted p-1 rounded",
              selectedId === category.id && "bg-muted"
            )}
          >
            <div className={cn(
              "flex h-4 w-4 items-center justify-center border rounded",
              selectedId === category.id && "bg-emerald-600 border-emerald-600"
            )}>
              {selectedId === category.id && (
                <Check className="h-3 w-3 text-white" />
              )}
            </div>
            <span className="text-sm">{category.name}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-2 pt-2 border-t">
        <Button 
          size="sm" 
          variant="outline" 
          onClick={() => {
            setSelectedId(product.categoryDefinitionId);
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

export default CategoryCell;

