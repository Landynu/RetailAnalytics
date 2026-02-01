import React, { useState, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ChevronDown, Check, X } from 'lucide-react';

const FilterDropdown = ({ 
  label, 
  options = [], 
  selectedValues = [], 
  onChange,
  icon: Icon 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState(selectedValues);
  const dropdownRef = useRef(null);

  // Sync pending values when selectedValues changes externally
  useEffect(() => {
    setPendingValues(selectedValues);
  }, [selectedValues]);

  // Close dropdown when clicking outside - apply changes on close
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        handleApply();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [pendingValues]);

  const handleToggleOption = (option) => {
    const newValues = pendingValues.includes(option)
      ? pendingValues.filter(v => v !== option)
      : [...pendingValues, option];
    setPendingValues(newValues);
  };

  const handleClearAll = () => {
    setPendingValues([]);
  };

  const handleSelectAll = () => {
    setPendingValues(options);
  };

  const handleApply = () => {
    if (JSON.stringify([...pendingValues].sort()) !== JSON.stringify([...selectedValues].sort())) {
      onChange(pendingValues);
    }
    setIsOpen(false);
  };

  const handleCancel = () => {
    setPendingValues(selectedValues);
    setIsOpen(false);
  };

  const hasPendingChanges = JSON.stringify([...pendingValues].sort()) !== JSON.stringify([...selectedValues].sort());

  const getDisplayText = () => {
    if (selectedValues.length === 0) {
      return `All ${label}`;
    }
    if (selectedValues.length === 1) {
      return selectedValues[0].length > 20 
        ? selectedValues[0].substring(0, 20) + '...' 
        : selectedValues[0];
    }
    return `${selectedValues.length} ${label}`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 min-w-[180px] justify-between ${hasPendingChanges ? 'ring-2 ring-orange-400' : ''}`}
        size="sm"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4" />}
          <span className="text-sm">{getDisplayText()}</span>
        </div>
        <div className="flex items-center gap-1">
          {hasPendingChanges && (
            <Badge variant="default" className="h-5 px-1.5 text-xs bg-orange-500">
              *
            </Badge>
          )}
          {selectedValues.length > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {selectedValues.length}
            </Badge>
          )}
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </Button>

      {isOpen && (
        <div className="absolute z-50 mt-2 w-[280px] bg-background border rounded-lg shadow-lg max-h-[450px] flex flex-col">
          <div className="p-2 border-b flex items-center justify-between flex-shrink-0">
            <span className="text-sm font-semibold">{label}</span>
            {pendingValues.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                className="h-6 text-xs"
              >
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
          </div>

          <div className="overflow-y-auto p-2 space-y-1 flex-1 min-h-0" style={{ maxHeight: '350px' }}>
            {options.length > 0 ? (
              options.map(option => {
                const isSelected = pendingValues.includes(option);
                return (
                  <button
                    key={option}
                    onClick={() => handleToggleOption(option)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-secondary transition-colors"
                  >
                    <div className={`h-4 w-4 rounded border-2 flex items-center justify-center ${isSelected ? 'bg-primary border-primary' : 'border-muted-foreground'}`}>
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    <span className="flex-1 text-left">{option}</span>
                  </button>
                );
              })
            ) : (
              <div className="text-sm text-muted-foreground text-center py-4">
                No options available
              </div>
            )}
          </div>

          {options.length > 0 && (
            <div className="p-2 border-t bg-muted/50 flex-shrink-0 space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{pendingValues.length} of {options.length} selected</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAll}
                  className="h-6 text-xs"
                >
                  Select All
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  className="flex-1 h-7 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleApply}
                  className={`flex-1 h-7 text-xs ${hasPendingChanges ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
                >
                  Apply {hasPendingChanges && '*'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FilterDropdown;
