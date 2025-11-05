import React, { useState } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { updateProductEnrichment } from 'wasp/client/operations';

const StrainTypeCell = ({ product, classifications }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(product.classificationId);
  const [isLoading, setIsLoading] = useState(false);
  const [optimisticClassification, setOptimisticClassification] = useState(null);
  
  const handleSelect = async (classificationId) => {
    setSelectedId(classificationId);
    setIsLoading(true);
    setIsOpen(false);
    
    // Optimistic update
    const classification = classifications.find(c => c.id === classificationId);
    setOptimisticClassification(classification);
    
    try {
      await updateProductEnrichment({ 
        productId: product.id, 
        updates: { classificationId: classificationId || null } 
      });
      setTimeout(() => setOptimisticClassification(null), 500);
    } catch (error) {
      setOptimisticClassification(null);
      setSelectedId(product.classificationId);
      alert('Error updating classification: ' + error.message);
      setIsOpen(true);
    } finally {
      setIsLoading(false);
    }
  };
  
  const displayClassification = optimisticClassification || 
    classifications.find(c => c.id === product.classificationId) ||
    (product.strainType && { name: product.strainType });
  
  const getStrainColor = (name) => {
    if (!name) return 'bg-gray-400';
    switch(name.toLowerCase()) {
      case 'sativa': return 'bg-green-500';
      case 'hybrid': return 'bg-purple-500';
      case 'indica': return 'bg-blue-500';
      default: return 'bg-gray-400';
    }
  };
  
  if (!isOpen) {
    return (
      <div className="flex items-center gap-2 min-w-[120px]">
        {displayClassification ? (
          <Badge 
            className={cn(
              `${getStrainColor(displayClassification.name)} text-white text-xs font-semibold shadow-sm rounded-lg`,
              optimisticClassification && "opacity-70"
            )}
          >
            {displayClassification.name}
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
        {classifications.map(classification => (
          <div
            key={classification.id}
            onClick={() => handleSelect(classification.id)}
            className={cn(
              "flex items-center space-x-2 cursor-pointer hover:bg-muted p-1 rounded",
              selectedId === classification.id && "bg-muted"
            )}
          >
            <div className={cn(
              "flex h-4 w-4 items-center justify-center border rounded",
              selectedId === classification.id && "bg-emerald-600 border-emerald-600"
            )}>
              {selectedId === classification.id && (
                <Check className="h-3 w-3 text-white" />
              )}
            </div>
            <span className="text-sm">{classification.name}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-2 pt-2 border-t">
        <Button 
          size="sm" 
          variant="outline" 
          onClick={() => {
            setSelectedId(product.classificationId);
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

export default StrainTypeCell;

