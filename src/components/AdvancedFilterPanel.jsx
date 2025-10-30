import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import FilterChip from './FilterChip';
import { ChevronDown, ChevronUp, Filter, X, Check } from 'lucide-react';

const AdvancedFilterPanel = ({ filters, onChange, availableOptions = {}, onClearAll }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [tempFilters, setTempFilters] = useState(filters);

  const {
    availableCategories = [],
    availableSubcategories = [],
    availableBrands = [],
    availableStrainTypes = ['Sativa', 'Hybrid', 'Indica', 'N/A']
  } = availableOptions;

  const handleFilterChange = (filterType, value) => {
    const currentValues = tempFilters[filterType] || [];
    const newValues = currentValues.includes(value)
      ? currentValues.filter(v => v !== value)
      : [...currentValues, value];
    
    setTempFilters({
      ...tempFilters,
      [filterType]: newValues
    });
  };

  const handleApplyFilters = () => {
    onChange(tempFilters);
    setIsExpanded(false);
  };

  const handleClear = () => {
    const clearedFilters = {
      categories: [],
      subcategories: [],
      brands: [],
      strainTypes: [],
      priceRange: null,
      stockStatus: null,
      dateRange: null
    };
    setTempFilters(clearedFilters);
    onChange(clearedFilters);
    if (onClearAll) onClearAll();
  };

  // Count active filters
  const activeFilterCount = Object.values(filters).filter(v => 
    Array.isArray(v) ? v.length > 0 : v !== null
  ).length;

  // Get all active filter chips
  const getActiveFilterChips = () => {
    const chips = [];
    
    if (filters.categories?.length > 0) {
      filters.categories.forEach(cat => {
        chips.push({
          label: 'Category',
          value: cat,
          onRemove: () => handleRemoveFilter('categories', cat),
          color: 'bg-purple-100 text-purple-800 hover:bg-purple-200'
        });
      });
    }
    
    if (filters.subcategories?.length > 0) {
      filters.subcategories.forEach(sub => {
        chips.push({
          label: 'Subcategory',
          value: sub,
          onRemove: () => handleRemoveFilter('subcategories', sub),
          color: 'bg-blue-100 text-blue-800 hover:bg-blue-200'
        });
      });
    }
    
    if (filters.brands?.length > 0) {
      filters.brands.forEach(brand => {
        chips.push({
          label: 'Brand',
          value: brand,
          onRemove: () => handleRemoveFilter('brands', brand),
          color: 'bg-green-100 text-green-800 hover:bg-green-200'
        });
      });
    }
    
    if (filters.strainTypes?.length > 0) {
      filters.strainTypes.forEach(strain => {
        chips.push({
          label: 'Strain',
          value: strain,
          onRemove: () => handleRemoveFilter('strainTypes', strain),
          color: 'bg-amber-100 text-amber-800 hover:bg-amber-200'
        });
      });
    }
    
    return chips;
  };

  const handleRemoveFilter = (filterType, value) => {
    const newFilters = {
      ...filters,
      [filterType]: filters[filterType].filter(v => v !== value)
    };
    onChange(newFilters);
    setTempFilters(newFilters);
  };

  const activeChips = getActiveFilterChips();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center text-base">
              <Filter className="h-4 w-4 mr-2" />
              Advanced Filters
            </CardTitle>
            {activeFilterCount > 0 && (
              <Badge variant="default" className="ml-2">
                {activeFilterCount} active
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={handleClear}>
                <X className="h-4 w-4 mr-1" />
                Clear All
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* Active Filter Chips */}
      {activeChips.length > 0 && (
        <CardContent className="pt-0 pb-3">
          <div className="flex flex-wrap gap-2">
            {activeChips.map((chip, idx) => (
              <FilterChip
                key={`${chip.label}-${chip.value}-${idx}`}
                label={chip.label}
                value={chip.value}
                onRemove={chip.onRemove}
                colorClass={chip.color}
              />
            ))}
          </div>
        </CardContent>
      )}

      {/* Expanded Filter Options */}
      {isExpanded && (
        <CardContent className="pt-0 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Categories */}
            <div>
              <label className="text-sm font-medium mb-2 block">Categories</label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto border rounded-md p-2">
                {availableCategories.length > 0 ? (
                  availableCategories.map(category => (
                    <label 
                      key={category} 
                      className="flex items-center space-x-2 cursor-pointer hover:bg-secondary p-1.5 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={(tempFilters.categories || []).includes(category)}
                        onChange={() => handleFilterChange('categories', category)}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm">{category}</span>
                    </label>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground py-2">No categories available</p>
                )}
              </div>
            </div>

            {/* Subcategories */}
            <div>
              <label className="text-sm font-medium mb-2 block">Subcategories</label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto border rounded-md p-2">
                {availableSubcategories.length > 0 ? (
                  availableSubcategories.map(subcategory => (
                    <label 
                      key={subcategory} 
                      className="flex items-center space-x-2 cursor-pointer hover:bg-secondary p-1.5 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={(tempFilters.subcategories || []).includes(subcategory)}
                        onChange={() => handleFilterChange('subcategories', subcategory)}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm">{subcategory}</span>
                    </label>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground py-2">No subcategories available</p>
                )}
              </div>
            </div>

            {/* Brands */}
            <div>
              <label className="text-sm font-medium mb-2 block">Brands</label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto border rounded-md p-2">
                {availableBrands.length > 0 ? (
                  availableBrands.map(brand => (
                    <label 
                      key={brand} 
                      className="flex items-center space-x-2 cursor-pointer hover:bg-secondary p-1.5 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={(tempFilters.brands || []).includes(brand)}
                        onChange={() => handleFilterChange('brands', brand)}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm">{brand}</span>
                    </label>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground py-2">No brands available</p>
                )}
              </div>
            </div>

            {/* Strain Types */}
            <div>
              <label className="text-sm font-medium mb-2 block">Strain Types</label>
              <div className="space-y-1.5 border rounded-md p-2">
                {availableStrainTypes.map(strain => (
                  <label 
                    key={strain} 
                    className="flex items-center space-x-2 cursor-pointer hover:bg-secondary p-1.5 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={(tempFilters.strainTypes || []).includes(strain)}
                      onChange={() => handleFilterChange('strainTypes', strain)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">{strain}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Apply Button */}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={() => setIsExpanded(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleApplyFilters}>
              <Check className="h-4 w-4 mr-1" />
              Apply Filters
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
};

export default AdvancedFilterPanel;
