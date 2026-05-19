import React, { useState, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { MapPin, ChevronDown, Check, Star } from 'lucide-react';
import DropdownPortal from './DropdownPortal';

const LocationSelector = ({ stores = [], selectedIds, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);

  // Initialize with favourites if selectedIds is null and there are favourited stores
  useEffect(() => {
    if (selectedIds === null || selectedIds === undefined) {
      const favourites = stores.filter(s => s.isFavourite && s.isActive);
      if (favourites.length > 0) {
        // Set to favourites instead of all
        onChange(favourites.map(s => s.id));
      }
    }
  }, []); // Only run on mount

  // Only count active stores
  const activeStores = stores.filter(store => store.isActive);
  const activeStoreCount = activeStores.length;
  
  // Differentiate between "all" (null) and "none" (empty array)
  const isAllSelected = selectedIds === null || selectedIds === undefined;
  const isNoneSelected = Array.isArray(selectedIds) && selectedIds.length === 0;
  const selectedCount = isAllSelected ? activeStoreCount : (isNoneSelected ? 0 : selectedIds.length);

  const handleToggleAll = () => {
    onChange(null); // null = all locations
    setIsOpen(false);
  };

  const handleClearAll = () => {
    onChange([]); // empty array = no locations selected
    // Keep dropdown open so user can select locations
  };

  const handleToggleStore = (storeId) => {
    if (isAllSelected) {
      // If all selected, clicking one should select only that one
      onChange([storeId]);
    } else if (isNoneSelected) {
      // If none selected, clicking one should select only that one
      onChange([storeId]);
    } else {
      if (selectedIds.includes(storeId)) {
        // Remove this store
        const newIds = selectedIds.filter(id => id !== storeId);
        // Keep as empty array instead of converting to null
        onChange(newIds);
      } else {
        // Add this store
        const newIds = [...selectedIds, storeId];
        // Only convert to null if ALL stores are now selected
        onChange(newIds.length === stores.length ? null : newIds);
      }
    }
  };

  const getDisplayText = () => {
    if (isAllSelected) {
      return `All Locations (${activeStoreCount})`;
    }
    if (isNoneSelected) {
      return 'No Locations Selected';
    }
    if (selectedIds.length === 1) {
      const store = stores.find(s => s.id === selectedIds[0]);
      return store ? store.name : '1 Location';
    }
    return `${selectedIds.length} of ${activeStoreCount} Locations`;
  };

  return (
    <div className="relative">
      <Button
        ref={triggerRef}
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 min-w-[200px] justify-between"
      >
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          <span>{getDisplayText()}</span>
        </div>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      <DropdownPortal anchorRef={triggerRef} open={isOpen} onClose={() => setIsOpen(false)} align="left">
        <div className="w-[300px] bg-background border rounded-lg shadow-lg">
          <div className="p-2 border-b">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleAll}
              className="w-full justify-start"
            >
              {isAllSelected && <Check className="h-4 w-4 mr-2 text-primary" />}
              <span className={isAllSelected ? 'font-semibold' : ''}>All Locations</span>
              <Badge variant="secondary" className="ml-auto">
                {stores.length}
              </Badge>
            </Button>
          </div>

          <div className="max-h-[300px] overflow-y-auto p-2 space-y-1">
            {stores
              .filter(store => store.isActive) // Only show active stores
              .map(store => {
              const isSelected = isAllSelected || (!isNoneSelected && selectedIds.includes(store.id));
              return (
                <button
                  key={store.id}
                  onClick={() => handleToggleStore(store.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-secondary transition-colors"
                >
                  <div className={`h-4 w-4 rounded border-2 flex items-center justify-center ${isSelected ? 'bg-primary border-primary' : 'border-muted-foreground'}`}>
                    {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium flex items-center gap-1">
                      {store.friendlyName || store.name}
                      {store.isFavourite && (
                        <Star className="h-3 w-3 text-yellow-500 fill-current" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{store.location}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="p-2 border-t bg-muted/50">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{selectedCount} selected</span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAll}
                  className="h-7 text-xs"
                >
                  Clear All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleToggleAll}
                  className="h-7 text-xs"
                >
                  Select All
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DropdownPortal>
    </div>
  );
};

export default LocationSelector;
