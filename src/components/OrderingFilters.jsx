import React, { useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Download, Trash2, Eye, EyeOff } from 'lucide-react';

const OrderingFilters = ({ 
  analytics,
  filters, 
  setFilters,
  hiddenCategories,
  onCategoryVisibilityToggle,
  worksheet,
  onExportOrder,
  onClearOrder,
  onEnrichFormats,
  onSeedDistributors,
  onSyncBrands,
  brandScrollPosition,
  onBrandScrollChange
}) => {
  const brandScrollRef = useRef(null);
  const brandRefsMap = useRef({});
  const prevBrandsRef = useRef([]);
  const prevScrollPositionRef = useRef(0);

  const brands = analytics?.filterOptions?.brands || [];
  
  // Only update if brands actually changed (deep comparison)
  const brandsChanged = JSON.stringify(brands) !== JSON.stringify(prevBrandsRef.current);
  const scrollPositionChanged = brandScrollPosition !== prevScrollPositionRef.current;

  // Track scroll position and notify parent
  useEffect(() => {
    const handleScroll = () => {
      if (brandScrollRef.current && onBrandScrollChange) {
        onBrandScrollChange(brandScrollRef.current.scrollTop);
      }
    };

    const scrollElement = brandScrollRef.current;
    if (scrollElement) {
      scrollElement.addEventListener('scroll', handleScroll);
      return () => scrollElement.removeEventListener('scroll', handleScroll);
    }
  }, [onBrandScrollChange]);

  // Restore scroll position from parent state (only when brands actually change or scroll position updates)
  useEffect(() => {
    if (brandScrollRef.current && brandScrollPosition > 0 && (brandsChanged || scrollPositionChanged)) {
      brandScrollRef.current.scrollTop = brandScrollPosition;
      prevBrandsRef.current = brands;
      prevScrollPositionRef.current = brandScrollPosition;
    }
  }, [brands, brandScrollPosition, brandsChanged, scrollPositionChanged]);

  const handleBrandClick = (brand, e) => {
    const isSelected = filters.brands.includes(brand);
    
    // Save current scroll position before changing filter
    if (brandScrollRef.current && onBrandScrollChange) {
      onBrandScrollChange(brandScrollRef.current.scrollTop);
    }
    
    // Apply the filter
    if (e.ctrlKey || e.metaKey) {
      if (isSelected) {
        setFilters({ ...filters, brands: filters.brands.filter(b => b !== brand) });
      } else {
        setFilters({ ...filters, brands: [...filters.brands, brand] });
      }
    } else {
      setFilters({ ...filters, brands: [brand] });
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

    // Scroll to center the new selection
    requestAnimationFrame(() => {
      const brandElement = brandRefsMap.current[newBrand];
      if (brandElement) {
        brandElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        });
      }
    });
  };

  return (
    <div className="w-72 border-r bg-card p-4 overflow-y-auto flex-shrink-0">
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-emerald-800">Filters</h2>
        
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-emerald-800">
              Brands
            </label>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleNavigateBrand('up')}
                className="h-6 w-6 p-0"
                title="Previous brand"
              >
                ▲
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleNavigateBrand('down')}
                className="h-6 w-6 p-0"
                title="Next brand"
              >
                ▼
              </Button>
            </div>
          </div>
          <div 
            ref={brandScrollRef}
            className="border rounded-lg p-2 bg-background max-h-64 overflow-y-auto space-y-1"
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
                  className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm transition-colors ${
                    isSelected 
                      ? 'bg-primary text-primary-foreground font-medium shadow-sm' 
                      : 'hover:bg-secondary'
                  }`}
                >
                  <span className="flex-1">{brand}</span>
                  {isSelected && (
                    <span className="text-xs">✓</span>
                  )}
                </div>
              );
            })}
          </div>
          {filters.brands.length > 0 && (
            <div className="mt-2 text-xs text-muted-foreground">
              {filters.brands.length} selected
            </div>
          )}
        </div>

        <div className="mb-4">
          <label className="text-sm font-medium mb-2 block text-emerald-800">
            Categories
            <span className="block text-xs font-normal text-muted-foreground mt-0.5">
              👁️ = show/hide • Click name = filter
              {analytics?.primaryStore && (
                <span className="block mt-1">
                  📍 Format: Primary ({analytics.primaryStore.name}) (Total)
                </span>
              )}
            </span>
          </label>
          <div className="border rounded-lg p-2 bg-background max-h-64 overflow-y-auto space-y-1">
            {(analytics?.filterOptions?.categories || []).map(cat => {
              const isSelected = filters.categories.includes(cat);
              const isHidden = hiddenCategories.has(cat);
              const primaryCount = analytics?.primaryStoreCategoryTotals?.[cat] || 0;
              const totalCount = analytics?.totalCategoryTotals?.[cat] || 0;
              
              // Build display label
              let categoryLabel = cat;
              if (analytics?.primaryStore && primaryCount > 0) {
                // Show "Category: primary (total)" format
                categoryLabel = `${cat}: ${primaryCount} (${totalCount})`;
              } else if (totalCount > 0) {
                // No primary store set, just show total
                categoryLabel = `${cat}: ${totalCount}`;
              }
              
              return (
                <div
                  key={cat}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
                    isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'
                  }`}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCategoryVisibilityToggle(cat);
                    }}
                    className={`flex-shrink-0 hover:scale-110 transition-transform ${
                      isHidden ? 'text-muted-foreground' : 'text-foreground'
                    }`}
                    title={isHidden ? 'Hidden - Click to show in table' : 'Visible - Click to hide from table'}
                  >
                    {isHidden ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
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
                        setFilters({ ...filters, categories: [cat] });
                      }
                    }}
                    className={`flex-1 cursor-pointer hover:underline ${
                      isHidden ? 'opacity-50 line-through' : ''
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
          {filters.categories.length > 0 && (
            <div className="mt-2 text-xs text-muted-foreground">
              {filters.categories.length} selected for filtering
            </div>
          )}
          {hiddenCategories.size > 0 && (
            <div className="mt-1 text-xs text-muted-foreground">
              {hiddenCategories.size} hidden from view
            </div>
          )}
        </div>

        {(filters.brands.length > 0 || filters.categories.length > 0 || 
          filters.subcategories.length > 0 || filters.units.length > 0 || filters.sizes.length > 0) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilters({ brands: [], categories: [], subcategories: [], units: [], sizes: [] })}
            className="w-full"
          >
            Clear All Filters
          </Button>
        )}

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

        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold mb-2 text-emerald-800">Admin Tools</h3>
          <div className="space-y-2">
            {onSeedDistributors && (
              <>
                <Button variant="secondary" onClick={onSeedDistributors} className="w-full" size="sm">
                  🏢 Seed Distributors
                </Button>
                <p className="text-xs text-muted-foreground">
                  One-time: Creates 7 default distributors
                </p>
              </>
            )}
            {onSyncBrands && (
              <>
                <Button variant="secondary" onClick={onSyncBrands} className="w-full" size="sm">
                  🏷️ Sync Brands
                </Button>
                <p className="text-xs text-muted-foreground">
                  Creates Brand records from product catalog
                </p>
              </>
            )}
            <Button variant="secondary" onClick={onEnrichFormats} className="w-full" size="sm">
              🔄 Enrich Formats
            </Button>
            <p className="text-xs text-muted-foreground">
              Updates format data for all products (multipacks, etc.)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderingFilters;
