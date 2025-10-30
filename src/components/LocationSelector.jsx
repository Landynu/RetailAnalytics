import React, { useState, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { MapPin, ChevronDown, Check } from 'lucide-react';

const LocationSelector = ({ stores = [], selectedIds, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isAllSelected = !selectedIds || selectedIds.length === 0;
  const selectedCount = isAllSelected ? stores.length : selectedIds.length;

  const handleToggleAll = () => {
    onChange(null); // null = all locations
    setIsOpen(false);
  };

  const handleToggleStore = (storeId) => {
    if (isAllSelected) {
      // If all selected, deselect just this one (select all others)
      const allOtherIds = stores.filter(s => s.id !== storeId).map(s => s.id);
      onChange(allOtherIds);
    } else {
      if (selectedIds.includes(storeId)) {
        // Remove this store
        const newIds = selectedIds.filter(id => id !== storeId);
        onChange(newIds.length === 0 ? null : newIds);
      } else {
        // Add this store
        const newIds = [...selectedIds, storeId];
        onChange(newIds.length === stores.length ? null : newIds);
      }
    }
  };

  const getDisplayText = () => {
    if (isAllSelected) {
      return `All Locations (${stores.length})`;
    }
    if (selectedIds.length === 1) {
      const store = stores.find(s => s.id === selectedIds[0]);
      return store ? store.name : '1 Location';
    }
    return `${selectedIds.length} of ${stores.length} Locations`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
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

      {isOpen && (
        <div className="absolute z-50 mt-2 w-[300px] bg-background border rounded-lg shadow-lg">
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
            {stores.map(store => {
              const isSelected = isAllSelected || selectedIds.includes(store.id);
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
                    <div className="font-medium">{store.friendlyName || store.name}</div>
                    <div className="text-xs text-muted-foreground">{store.location}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="p-2 border-t bg-muted/50">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{selectedCount} selected</span>
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
      )}
    </div>
  );
};

export default LocationSelector;
