import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Download, ChevronDown, Store, Globe, AlertTriangle, Package } from 'lucide-react';
import { toast } from 'sonner';
import { generateManagerCsv, generateAllStoresCsv } from '../../lib/transferEngine';

function downloadCsv(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

const TransferExportDropdown = ({
  transferPlan,
  categoryGaps,
  satelliteStores,
  overrides
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const date = new Date().toISOString().split('T')[0];

  const handleExportStore = (store) => {
    const csv = generateManagerCsv(transferPlan, store.id, overrides);
    if (!csv) {
      toast.info(`No recommendations for ${store.name}`);
      return;
    }
    const name = store.name.toLowerCase().replace(/\s+/g, '-');
    downloadCsv(csv, `transfer-plan-${name}-${date}.csv`);
    toast.success(`Exported transfer plan for ${store.name}`);
    setIsOpen(false);
  };

  const handleExportAll = () => {
    const csv = generateAllStoresCsv(transferPlan, satelliteStores, overrides);
    if (!csv) {
      toast.info('No transfer recommendations');
      return;
    }
    downloadCsv(csv, `transfer-plan-all-stores-${date}.csv`);
    toast.success('Exported combined transfer plan');
    setIsOpen(false);
  };

  const handleExportStale = () => {
    const { staleFlags } = transferPlan;
    if (!staleFlags.length) {
      toast.info('No stale inventory to export');
      return;
    }

    const header = 'Store,Product,Brand,Category,Format,Qty,Days Since Last Sale,Rank,Recommendation';
    const rows = staleFlags
      .sort((a, b) => (b.daysSinceLastSale ?? 9999) - (a.daysSinceLastSale ?? 9999))
      .map(f => {
        const cells = [
          f.storeName, f.productName, f.brand, f.category, f.format || '',
          f.qty, f.daysSinceLastSale ?? 'Never',
          f.categoryRank ? `${f.categoryRank}/${f.categoryTotal}` : '',
          f.recommendation === 'TRANSFER_TO_HUB' ? 'RETURN TO HUB' : 'PUT ON SALE'
        ];
        return cells.map(c => {
          const s = String(c ?? '');
          return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(',');
      });

    downloadCsv([header, ...rows].join('\n'), `stale-inventory-${date}.csv`);
    toast.success(`Exported ${staleFlags.length} stale items`);
    setIsOpen(false);
  };

  const handleExportGaps = () => {
    if (!categoryGaps.length) {
      toast.info('No category gaps to export');
      return;
    }

    const header = 'Store,Category,Subcategory/Format,Store SKUs,Avg SKUs,Deficit';
    const rows = categoryGaps.map(g => {
      const cells = [g.storeName, g.category, g.subcategory, g.storeSkuCount, g.avgSkuCount, g.deficit];
      return cells.map(c => {
        const s = String(c ?? '');
        return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(',');
    });

    downloadCsv([header, ...rows].join('\n'), `category-gaps-${date}.csv`);
    toast.success(`Exported ${categoryGaps.length} category gaps`);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="border-blue-300 hover:bg-blue-50 text-blue-700 hover:text-blue-800 rounded-lg transition-colors font-medium"
      >
        <Download className="h-4 w-4 mr-2" />
        Export
        <ChevronDown className="h-3 w-3 ml-1" />
      </Button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-lg border z-20 max-h-96 overflow-y-auto">
            <div className="p-2 border-b bg-gray-50">
              <div className="font-semibold text-xs text-gray-500 uppercase tracking-wide px-2">Store Manager Exports</div>
            </div>
            <div className="p-1">
              <button
                onClick={handleExportAll}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-blue-50 rounded-md transition-colors"
              >
                <Globe className="h-4 w-4 text-green-600 shrink-0" />
                <div>
                  <div className="font-medium">All Stores Combined</div>
                  <div className="text-xs text-gray-500">Single CSV with store column</div>
                </div>
              </button>

              <div className="border-t my-1" />
              <div className="px-3 py-1">
                <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">Per Store</div>
              </div>
              {satelliteStores.map(store => (
                <button
                  key={store.id}
                  onClick={() => handleExportStore(store)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-blue-50 rounded-md transition-colors"
                >
                  <Store className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  <span>{store.name}</span>
                </button>
              ))}

              <div className="border-t my-1" />
              <div className="px-3 py-1">
                <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">Reports</div>
              </div>
              <button
                onClick={handleExportStale}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-amber-50 rounded-md transition-colors"
              >
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span>Stale Inventory Report</span>
              </button>
              <button
                onClick={handleExportGaps}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-purple-50 rounded-md transition-colors"
              >
                <Package className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                <span>Category Gaps Report</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default TransferExportDropdown;
