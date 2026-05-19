import React, { useState, useRef } from 'react';
import { Button } from './ui/button';
import { Download, ChevronDown, Store, MapPin, Globe } from 'lucide-react';
import { toast } from 'sonner';
import DropdownPortal from './DropdownPortal';

function escapeCsvCell(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvRow(cells) {
  return cells.map(escapeCsvCell).join(',');
}

function downloadCsv(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

// Compute per-store metrics for a product at a specific store
function getStoreMetrics(product, storeId, periodDays) {
  const inv = product.locationInventory?.find(l => l.storeId === storeId);
  const sales = product.locationSales?.find(l => l.storeId === storeId);
  const lastSale = product.locationLastSale?.find(l => l.storeId === storeId);

  const storeInventory = inv ? inv.quantity : 0;
  const storeSales = sales ? sales.units : 0;
  const weeksInPeriod = periodDays / 7;
  const velocity = weeksInPeriod > 0 ? storeSales / weeksInPeriod : 0;
  const weeksLeft = velocity > 0 ? storeInventory / velocity : 999;
  const twoWeekDemand = velocity * 2;
  const suggestedQty = Math.max(0, Math.ceil(twoWeekDemand - storeInventory));
  const caseSize = product.caseSize || 12;
  const suggestedCases = Math.ceil(suggestedQty / caseSize);
  const daysSinceLastSale = lastSale?.daysSinceLastSale ?? null;

  return { storeInventory, storeSales, velocity, weeksLeft, suggestedQty, suggestedCases, daysSinceLastSale };
}

function generateCsv(products, exportStores, hiddenColumns, orderedColumns, categoryDefinitions, classifications, periodDays) {
  const isSingleStore = exportStores.length === 1;
  const singleStoreId = isSingleStore ? exportStores[0].id : null;

  // Build lookup maps for name resolution
  const classificationMap = new Map((classifications || []).map(c => [c.id, c.name]));
  const categoryMap = new Map((categoryDefinitions || []).map(c => [c.id, c.name]));
  const subcategoryMap = new Map();
  (categoryDefinitions || []).forEach(cat => {
    (cat.subcategories || []).forEach(sub => {
      subcategoryMap.set(sub.id, sub.name);
    });
  });

  // Build header and row mapper based on visible columns
  const headers = [];
  const rowMappers = [];

  // Columns to skip in CSV (non-data columns)
  const skipColumns = new Set(['actions', 'popularity']);
  // Track whether we've added per-store columns (gap 4: always include them)
  let addedLocationColumns = false;

  for (const col of orderedColumns) {
    if (skipColumns.has(col.id)) continue;
    // Skip hidden columns, but always process 'locations' (gap 4)
    if (col.id !== 'locations' && hiddenColumns.has(col.id)) continue;

    if (col.id === 'name') {
      headers.push('Product');
      rowMappers.push(p => p.name);
    } else if (col.id === 'brand') {
      headers.push('Brand');
      rowMappers.push(p => p.brand);
    } else if (col.id === 'categoryRank') {
      headers.push('Rank');
      rowMappers.push(p => p.categoryRank ? `${p.categoryRank}/${p.categoryTotal}` : '');
    } else if (col.id === 'distributor') {
      headers.push('Distributor');
      rowMappers.push(p => (p.distributors || []).map(d => d.name).join('; '));
    } else if (col.id === 'classification') {
      headers.push('Classification');
      rowMappers.push(p => (p.classificationId && classificationMap.get(p.classificationId)) || '');
    } else if (col.id === 'category') {
      headers.push('Category');
      rowMappers.push(p => (p.categoryDefinitionId && categoryMap.get(p.categoryDefinitionId)) || p.parentCategory || '');
    } else if (col.id === 'subcategory') {
      headers.push('Subcategory');
      rowMappers.push(p => (p.subcategoryId && subcategoryMap.get(p.subcategoryId)) || p.subcategory || '');
    } else if (col.id === 'strainType') {
      headers.push('Strain Type');
      rowMappers.push(p => p.strainType || '');
    } else if (col.id === 'format') {
      headers.push('Format');
      rowMappers.push(p => p.format || '');
    } else if (col.id === 'parentCategory') {
      headers.push('Parent Category');
      rowMappers.push(p => p.parentCategory || '');
    } else if (col.id === 'pricing') {
      headers.push('Wholesale Cost', 'Retail Price', 'Margin %');
      rowMappers.push(
        p => p.wholesaleCost != null ? p.wholesaleCost.toFixed(2) : '',
        p => p.retailPrice != null ? p.retailPrice.toFixed(2) : '',
        p => p.margin != null ? (p.margin * 100).toFixed(1) : ''
      );
    } else if (col.id === 'locations') {
      addedLocationColumns = true;
      for (const store of exportStores) {
        headers.push(`Inv - ${store.name}`, `Sales - ${store.name}`, `Days Since Last Sale - ${store.name}`);
        const storeId = store.id;
        rowMappers.push(
          p => {
            const loc = p.locationInventory?.find(l => l.storeId === storeId);
            return loc ? loc.quantity : 0;
          },
          p => {
            const loc = p.locationSales?.find(l => l.storeId === storeId);
            return loc ? loc.units : 0;
          },
          p => {
            const loc = p.locationLastSale?.find(l => l.storeId === storeId);
            if (!loc || loc.daysSinceLastSale == null) return '';
            return loc.daysSinceLastSale;
          }
        );
      }
    } else if (col.id === 'totalInventory') {
      headers.push(isSingleStore ? 'Inventory' : 'Total Inventory');
      rowMappers.push(p => {
        if (isSingleStore) {
          return getStoreMetrics(p, singleStoreId, periodDays).storeInventory;
        }
        return p.totalInventory || 0;
      });
    } else if (col.id === 'totalSales') {
      headers.push(isSingleStore ? 'Sales' : 'Total Sales');
      rowMappers.push(p => {
        if (isSingleStore) {
          return getStoreMetrics(p, singleStoreId, periodDays).storeSales;
        }
        return p.totalSales || 0;
      });
    } else if (col.id === 'weeksLeft') {
      headers.push('Weeks Left');
      rowMappers.push(p => {
        if (isSingleStore) {
          const m = getStoreMetrics(p, singleStoreId, periodDays);
          return m.weeksLeft < 999 ? m.weeksLeft.toFixed(1) : '';
        }
        return p.weeksLeft != null && p.weeksLeft < 999 ? p.weeksLeft.toFixed(1) : '';
      });
    } else if (col.id === 'recency') {
      headers.push('Days Since Last Sale', 'Days Since Last PO');
      rowMappers.push(
        p => {
          // Gap 3: use per-store last sale for single-store export
          if (isSingleStore) {
            const loc = p.locationLastSale?.find(l => l.storeId === singleStoreId);
            return loc?.daysSinceLastSale != null ? loc.daysSinceLastSale : '';
          }
          return p.daysSinceLastSale != null ? p.daysSinceLastSale : '';
        },
        p => p.daysSinceLastPO != null ? p.daysSinceLastPO : ''
      );
    } else if (col.id === 'trend') {
      headers.push('Trend (12wk)');
      rowMappers.push(p => (p.sparkline || []).join(';'));
    } else if (col.id === 'suggestedQty') {
      headers.push('Suggested Qty', 'Suggested Cases');
      rowMappers.push(
        p => {
          if (isSingleStore) {
            return getStoreMetrics(p, singleStoreId, periodDays).suggestedQty;
          }
          return p.suggestedQty || 0;
        },
        p => {
          if (isSingleStore) {
            return getStoreMetrics(p, singleStoreId, periodDays).suggestedCases;
          }
          return p.suggestedCases || 0;
        }
      );
    }
  }

  // Gap 4: if locations column was hidden, still append per-store columns at the end
  if (!addedLocationColumns) {
    for (const store of exportStores) {
      headers.push(`Inv - ${store.name}`, `Sales - ${store.name}`, `Days Since Last Sale - ${store.name}`);
      const storeId = store.id;
      rowMappers.push(
        p => {
          const loc = p.locationInventory?.find(l => l.storeId === storeId);
          return loc ? loc.quantity : 0;
        },
        p => {
          const loc = p.locationSales?.find(l => l.storeId === storeId);
          return loc ? loc.units : 0;
        },
        p => {
          const loc = p.locationLastSale?.find(l => l.storeId === storeId);
          if (!loc || loc.daysSinceLastSale == null) return '';
          return loc.daysSinceLastSale;
        }
      );
    }
  }

  const rows = [buildCsvRow(headers)];
  for (const product of products) {
    rows.push(buildCsvRow(rowMappers.map(fn => fn(product))));
  }

  return rows.join('\n');
}

const ExportDropdown = ({
  sortedProducts,
  displayStores,
  allStores,
  hiddenColumns,
  orderedColumns,
  categoryDefinitions,
  classifications,
  periodDays
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);

  const activeStores = (allStores || []).filter(s => s.isActive);

  const handleExport = (exportStores, label) => {
    if (!sortedProducts || sortedProducts.length === 0) {
      toast.error('No products to export');
      return;
    }
    const csv = generateCsv(sortedProducts, exportStores, hiddenColumns, orderedColumns, categoryDefinitions, classifications, periodDays);
    const date = new Date().toISOString().split('T')[0];
    const suffix = label ? `-${label.toLowerCase().replace(/\s+/g, '-')}` : '';
    downloadCsv(csv, `ordering-export${suffix}-${date}.csv`);
    toast.success(`Exported ${sortedProducts.length} products`);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <Button
        ref={triggerRef}
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        disabled={!sortedProducts || sortedProducts.length === 0}
        className="border-blue-300 hover:bg-blue-50 text-blue-700 hover:text-blue-800 rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Download className="h-4 w-4 mr-2" />
        Export CSV
        <ChevronDown className="h-3 w-3 ml-1" />
      </Button>

      <DropdownPortal anchorRef={triggerRef} open={isOpen} onClose={() => setIsOpen(false)} align="left">
        <div className="w-64 bg-white rounded-lg shadow-lg border max-h-80 overflow-y-auto">
            <div className="p-2 border-b bg-gray-50">
              <div className="font-semibold text-xs text-gray-500 uppercase tracking-wide px-2">Export Options</div>
            </div>
            <div className="p-1">
              <button
                onClick={() => handleExport(displayStores, 'current-view')}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-blue-50 rounded-md transition-colors"
              >
                <MapPin className="h-4 w-4 text-blue-600 shrink-0" />
                <div>
                  <div className="font-medium">Current View</div>
                  <div className="text-xs text-gray-500">{displayStores.length} selected store{displayStores.length !== 1 ? 's' : ''}</div>
                </div>
              </button>
              <button
                onClick={() => handleExport(displayStores, 'all-selected')}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-blue-50 rounded-md transition-colors"
              >
                <Globe className="h-4 w-4 text-green-600 shrink-0" />
                <div>
                  <div className="font-medium">All Selected Locations</div>
                  <div className="text-xs text-gray-500">Separate columns per store</div>
                </div>
              </button>

              {activeStores.length > 1 && (
                <>
                  <div className="border-t my-1" />
                  <div className="px-3 py-1">
                    <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">Single Store</div>
                  </div>
                  {activeStores.map(store => (
                    <button
                      key={store.id}
                      onClick={() => handleExport([store], store.name)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-blue-50 rounded-md transition-colors"
                    >
                      <Store className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      <span>{store.name}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
      </DropdownPortal>
    </div>
  );
};

export default ExportDropdown;
