import React, { useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Download, Trash2, Eye, EyeOff, ChevronUp, ChevronDown, X } from 'lucide-react';

const OrderingFilters = ({
  analytics,
  filters,
  setFilters,
  hiddenCategories,
  onCategoryVisibilityToggle,
  worksheet,
  onExportOrder,
  onClearOrder
}) => {
  const brandScrollRef = useRef(null);
  const brandRefsMap = useRef({});
  const prevBrandsRef = useRef([]);
  const savedScrollPositionRef = useRef(0);
  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef(null);

  const brands = analytics?.filterOptions?.brands || [];

  // Check if brands actually changed (deep comparison)
  const brandsChanged = JSON.stringify(brands) !== JSON.stringify(prevBrandsRef.current);

  // Save scroll position when user scrolls
  useEffect(() => {
    const handleScroll = () => {
      if (brandScrollRef.current) {
        isUserScrollingRef.current = true;
        savedScrollPositionRef.current = brandScrollRef.current.scrollTop;

        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }

        scrollTimeoutRef.current = setTimeout(() => {
          isUserScrollingRef.current = false;
        }, 150);
      }
    };

    const scrollElement = brandScrollRef.current;
    if (scrollElement) {
      scrollElement.addEventListener('scroll', handleScroll);
      return () => {
        scrollElement.removeEventListener('scroll', handleScroll);
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
      };
    }
  }, []);

  // Restore scroll position only when brands list actually changes (not during user scrolling)
  useEffect(() => {
    if (brandsChanged && !isUserScrollingRef.current && brandScrollRef.current) {
      if (savedScrollPositionRef.current > 0) {
        brandScrollRef.current.scrollTop = savedScrollPositionRef.current;
      }
      prevBrandsRef.current = brands;
    }
  }, [brands, brandsChanged]);

  const handleBrandClick = (brand, e) => {
    const isSelected = filters.brands.includes(brand);

    if (e.ctrlKey || e.metaKey) {
      if (isSelected) {
        setFilters({ ...filters, brands: filters.brands.filter(b => b !== brand) });
      } else {
        setFilters({ ...filters, brands: [...filters.brands, brand] });
      }
    } else {
      if (isSelected) {
        setFilters({ ...filters, brands: filters.brands.filter(b => b !== brand) });
      } else {
        setFilters({ ...filters, brands: [brand] });
      }
    }
  };

  const handleNavigateBrand = (direction) => {
    if (brands.length === 0) return;

    const currentIndex = filters.brands.length > 0
      ? brands.indexOf(filters.brands[0])
      : -1;

    let newIndex;
    if (direction === 'up') {
      newIndex = currentIndex <= 0 ? brands.length - 1 : currentIndex - 1;
    } else {
      newIndex = currentIndex >= brands.length - 1 ? 0 : currentIndex + 1;
    }

    const newBrand = brands[newIndex];
    setFilters({ ...filters, brands: [newBrand] });

    requestAnimationFrame(() => {
      const brandElement = brandRefsMap.current[newBrand];
      if (brandElement && brandScrollRef.current) {
        isUserScrollingRef.current = false;
        brandElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        });
        setTimeout(() => {
          if (brandScrollRef.current) {
            savedScrollPositionRef.current = brandScrollRef.current.scrollTop;
          }
        }, 300);
      }
    });
  };

  const hasActiveFilters = filters.brands.length > 0 || filters.categories.length > 0 ||
    filters.subcategories.length > 0 || filters.units.length > 0 || filters.sizes.length > 0 || filters.distributors?.length > 0;

  const activeFilterCount = filters.brands.length + filters.categories.length +
    (filters.subcategories?.length || 0) + (filters.units?.length || 0) + (filters.sizes?.length || 0) + (filters.distributors?.length || 0);

  return (
    <div className="w-72 border-r bg-card overflow-y-auto flex-shrink-0">
      <div className="p-4 border-b bg-gradient-to-r from-emerald-50 to-teal-50 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-emerald-800">Filters</h2>
          {hasActiveFilters && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
              {activeFilterCount} active
            </span>
          )}
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilters({ brands: [], categories: [], subcategories: [], units: [], sizes: [], distributors: [] })}
            className="w-full mt-2 h-7 text-xs text-muted-foreground hover:text-destructive"
          >
            <X className="h-3 w-3 mr-1" />
            Clear All Filters
          </Button>
        )}
      </div>

      <div className="p-4 space-y-5">
        {/* Brands Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-emerald-800">
              Brands
              {filters.brands.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[10px] font-semibold bg-blue-600 text-white">
                  {filters.brands.length}
                </span>
              )}
            </label>
            <div className="flex gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleNavigateBrand('up')}
                className="h-6 w-6 p-0"
                title="Previous brand"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleNavigateBrand('down')}
                className="h-6 w-6 p-0"
                title="Next brand"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div
            ref={brandScrollRef}
            className="border rounded-lg bg-background max-h-64 overflow-y-auto"
          >
            {brands.map((brand) => {
              const isSelected = filters.brands.includes(brand);
              return (
                <div
                  key={brand}
                  ref={(el) => {
                    if (el) brandRefsMap.current[brand] = el;
                  }}
                  onClick={(e) => handleBrandClick(brand, e)}
                  className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm transition-all border-l-[3px] ${
                    isSelected
                      ? 'bg-blue-50 border-l-blue-600 text-blue-900 font-medium'
                      : 'border-l-transparent hover:bg-slate-50'
                  }`}
                >
                  <div className={`flex-shrink-0 h-3.5 w-3.5 rounded border-2 flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-blue-600 border-blue-600'
                      : 'border-slate-300'
                  }`}>
                    {isSelected && (
                      <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <span className="flex-1 truncate">{brand}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Click to select. Ctrl+click to multi-select.
          </p>
        </div>

        {/* Categories Section */}
        <div>
          <label className="text-sm font-medium mb-2 block text-emerald-800">
            Categories
            {filters.categories.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[10px] font-semibold bg-blue-600 text-white">
                {filters.categories.length}
              </span>
            )}
            <span className="block text-[11px] font-normal text-muted-foreground mt-0.5">
              Click name to filter. Eye icon to show/hide in table.
              {analytics?.primaryStore && (
                <span className="block mt-0.5">
                  Format: Primary ({analytics.primaryStore.name}) (Total)
                </span>
              )}
            </span>
          </label>
          <div className="border rounded-lg bg-background max-h-64 overflow-y-auto">
            {(analytics?.filterOptions?.categories || []).map(cat => {
              const isSelected = filters.categories.includes(cat);
              const isHidden = hiddenCategories.has(cat);
              const primaryCount = analytics?.primaryStoreCategoryTotals?.[cat] || 0;
              const totalCount = analytics?.totalCategoryTotals?.[cat] || 0;

              let categoryLabel = cat;
              if (analytics?.primaryStore && primaryCount > 0) {
                categoryLabel = `${cat}: ${primaryCount} (${totalCount})`;
              } else if (totalCount > 0) {
                categoryLabel = `${cat}: ${totalCount}`;
              }

              return (
                <div
                  key={cat}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm transition-all border-l-[3px] ${
                    isSelected
                      ? 'bg-blue-50 border-l-blue-600 text-blue-900 font-medium'
                      : 'border-l-transparent hover:bg-slate-50'
                  }`}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCategoryVisibilityToggle(cat);
                    }}
                    className={`flex-shrink-0 p-0.5 rounded hover:bg-slate-200 transition-colors ${
                      isHidden ? 'text-slate-400' : 'text-slate-500'
                    }`}
                    title={isHidden ? 'Hidden - Click to show in table' : 'Visible - Click to hide from table'}
                  >
                    {isHidden ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <span
                    onClick={(e) => {
                      if (e.ctrlKey || e.metaKey) {
                        if (isSelected) {
                          setFilters({ ...filters, categories: filters.categories.filter(c => c !== cat) });
                        } else {
                          setFilters({ ...filters, categories: [...filters.categories, cat] });
                        }
                      } else {
                        if (isSelected) {
                          setFilters({ ...filters, categories: filters.categories.filter(c => c !== cat) });
                        } else {
                          setFilters({
                            ...filters,
                            categories: [cat],
                            subcategories: [],
                            units: [],
                            sizes: []
                          });
                        }
                      }
                    }}
                    className={`flex-1 cursor-pointer hover:underline ${
                      isHidden ? 'opacity-40 line-through' : ''
                    }`}
                    title={analytics?.primaryStore && primaryCount > 0
                      ? `${primaryCount} in ${analytics.primaryStore.name}, total count varies by filter`
                      : 'Click to filter by this category'}
                  >
                    {categoryLabel}
                  </span>
                </div>
              );
            })}
          </div>
          {hiddenCategories.size > 0 && (
            <div className="mt-1.5 text-[11px] text-muted-foreground">
              {hiddenCategories.size} hidden from view
            </div>
          )}
        </div>

        {/* Order Summary */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold mb-2 text-emerald-800">Order Summary</h3>
          <div className="text-sm text-muted-foreground mb-4">
            {worksheet?.items?.length || 0} items in order
          </div>
          <div className="space-y-2">
            <Button onClick={onExportOrder} className="w-full" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export Order
            </Button>
            <Button variant="outline" onClick={onClearOrder} className="w-full" size="sm">
              <Trash2 className="h-4 w-4 mr-2" />
              Clear Order
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Memoize component to prevent re-renders when only data changes
export default React.memo(OrderingFilters, (prevProps, nextProps) => {
  const filtersEqual = prevProps.filters === nextProps.filters;
  const hiddenCategoriesEqual = prevProps.hiddenCategories === nextProps.hiddenCategories;
  const worksheetEqual = prevProps.worksheet?.items?.length === nextProps.worksheet?.items?.length;
  const filterOptionsEqual = JSON.stringify(prevProps.analytics?.filterOptions) === JSON.stringify(nextProps.analytics?.filterOptions);
  const callbacksEqual = (
    prevProps.setFilters === nextProps.setFilters &&
    prevProps.onCategoryVisibilityToggle === nextProps.onCategoryVisibilityToggle &&
    prevProps.onExportOrder === nextProps.onExportOrder &&
    prevProps.onClearOrder === nextProps.onClearOrder
  );

  return filtersEqual && hiddenCategoriesEqual && worksheetEqual && filterOptionsEqual && callbacksEqual;
});
