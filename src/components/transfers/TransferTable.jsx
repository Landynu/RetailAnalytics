import React, { useState, useMemo } from 'react';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Warehouse } from 'lucide-react';

const PRIORITY_STYLES = {
  URGENT: 'bg-red-100 text-red-800 border-red-200',
  HIGH: 'bg-orange-100 text-orange-800 border-orange-200',
  MEDIUM: 'bg-blue-100 text-blue-800 border-blue-200',
  LOW: 'bg-slate-100 text-slate-700 border-slate-200',
};

const ROW_STYLES = {
  full: '',
  partial: 'bg-amber-50/50',
  none: 'bg-slate-50 opacity-60',
};

const TransferTable = ({
  transfers,
  satelliteStores,
  hubRemaining,
  selectedStoreId,
  onStoreChange,
  overrides,
  onOverrideChange
}) => {
  const [sortKey, setSortKey] = useState('priorityScore');
  const [sortDir, setSortDir] = useState('desc');

  const filtered = useMemo(() => {
    let items = transfers;
    if (selectedStoreId) {
      items = items.filter(t => t.toStoreId === selectedStoreId);
    }

    items = [...items].sort((a, b) => {
      let aVal = a[sortKey];
      let bVal = b[sortKey];
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal || '').toLowerCase();
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return items;
  }, [transfers, selectedStoreId, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortHeader = ({ label, field, className = '' }) => (
    <th
      className={`px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-700 select-none ${className}`}
      onClick={() => handleSort(field)}
    >
      {label}
      {sortKey === field && (
        <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
      )}
    </th>
  );

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <select
            value={selectedStoreId || ''}
            onChange={e => onStoreChange(e.target.value ? parseInt(e.target.value) : null)}
            className="text-sm border rounded-lg px-3 py-1.5 bg-white"
          >
            <option value="">All Satellite Stores</option>
            {satelliteStores.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <span className="text-sm text-slate-500">
            {filtered.length} recommendation{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {hubRemaining && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Warehouse className="h-4 w-4" />
            Hub remaining: <span className="font-semibold">{hubRemaining.remaining.toLocaleString()}</span> units
            <span className="text-slate-400">({hubRemaining.allocatedOut} allocated)</span>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-xl border border-slate-200 shadow-sm bg-white">
        <table className="w-full border-collapse">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              <SortHeader label="Priority" field="priorityScore" />
              <SortHeader label="Product" field="productName" />
              <SortHeader label="Brand" field="brand" />
              <SortHeader label="Category" field="category" />
              {!selectedStoreId && <SortHeader label="Store" field="toStoreName" />}
              <SortHeader label="Hub Stock" field="hubQty" className="text-right" />
              <SortHeader label="Store Stock" field="currentQty" className="text-right" />
              <SortHeader label="Velocity" field="storeVelocity" className="text-right" />
              <SortHeader label="Target" field="targetQty" className="text-right" />
              <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                Transfer Qty
              </th>
              <SortHeader label="Reason" field="reason" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={selectedStoreId ? 10 : 11} className="px-3 py-8 text-center text-slate-400">
                  No transfer recommendations for this selection
                </td>
              </tr>
            ) : (
              filtered.map((t, i) => {
                const overrideKey = `${t.productId}:${t.toStoreId}`;
                const currentQty = overrides[overrideKey] != null ? overrides[overrideKey] : t.qty;
                const rowStyle = t.qty === t.targetQty - t.currentQty
                  ? ROW_STYLES.full
                  : t.qty > 0
                    ? ROW_STYLES.partial
                    : ROW_STYLES.none;

                return (
                  <tr key={`${t.productId}-${t.toStoreId}-${i}`} className={`hover:bg-slate-50 ${rowStyle}`}>
                    <td className="px-3 py-2">
                      <Badge className={`text-xs ${PRIORITY_STYLES[t.priority]}`}>
                        {t.priority}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-sm font-medium text-slate-900 max-w-[250px] truncate">
                      {t.productName}
                      {t.isNewPush && (
                        <Badge className="ml-1.5 bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] px-1 py-0">
                          NEW
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-600">{t.brand}</td>
                    <td className="px-3 py-2 text-sm text-slate-600">
                      {t.category}
                      {t.format && <span className="text-slate-400 ml-1">({t.format})</span>}
                    </td>
                    {!selectedStoreId && (
                      <td className="px-3 py-2 text-sm text-slate-600">{t.toStoreName}</td>
                    )}
                    <td className="px-3 py-2 text-sm text-right font-mono text-slate-600">
                      {t.hubQty}
                    </td>
                    <td className="px-3 py-2 text-sm text-right font-mono">{t.currentQty}</td>
                    <td className="px-3 py-2 text-sm text-right font-mono">
                      {t.storeVelocity > 0 ? `${t.storeVelocity.toFixed(1)}/wk` : '—'}
                    </td>
                    <td className="px-3 py-2 text-sm text-right font-mono">{t.targetQty}</td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        min={0}
                        value={currentQty}
                        onChange={e => {
                          const val = e.target.value === '' ? null : parseInt(e.target.value);
                          onOverrideChange(t.productId, t.toStoreId, val);
                        }}
                        className="w-20 text-right text-sm h-7 ml-auto"
                      />
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500 max-w-[200px] truncate">
                      {t.reason}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TransferTable;
