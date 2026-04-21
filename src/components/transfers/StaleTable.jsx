import React, { useState, useMemo } from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { ArrowRightLeft, Tag, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createProductAction } from 'wasp/client/operations';

const StaleTable = ({
  staleFlags,
  satelliteStores,
  selectedStoreId,
  onStoreChange
}) => {
  const [loadingActions, setLoadingActions] = useState(new Set());

  const filtered = useMemo(() => {
    let items = staleFlags;
    if (selectedStoreId) {
      items = items.filter(f => f.storeId === selectedStoreId);
    }
    // Sort: worst offenders first (most days since last sale, then highest qty)
    return [...items].sort((a, b) => {
      const aDays = a.daysSinceLastSale ?? 9999;
      const bDays = b.daysSinceLastSale ?? 9999;
      if (aDays !== bDays) return bDays - aDays;
      return b.qty - a.qty;
    });
  }, [staleFlags, selectedStoreId]);

  const handleCreateAction = async (flag, actionType) => {
    const key = `${flag.productId}:${flag.storeId}:${actionType}`;
    setLoadingActions(prev => new Set(prev).add(key));

    try {
      await createProductAction({
        productId: flag.productId,
        actionType,
        notes: actionType === 'TRANSFER'
          ? `Transfer ${flag.qty} units from ${flag.storeName} back to hub. ${flag.daysSinceLastSale != null ? `No sale in ${flag.daysSinceLastSale} days.` : 'Never sold here.'}`
          : `Put on sale at ${flag.storeName}. ${flag.qty} units, not selling.`,
        metadata: {
          storeId: flag.storeId,
          storeName: flag.storeName,
          qty: flag.qty,
          daysSinceLastSale: flag.daysSinceLastSale,
          source: 'transfer_planner',
        },
      });
      toast.success(`${actionType === 'TRANSFER' ? 'Transfer' : 'Sale'} action created for ${flag.productName}`);
    } catch (error) {
      toast.error('Error creating action: ' + error.message);
    } finally {
      setLoadingActions(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
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
          {filtered.length} stale product{filtered.length !== 1 ? 's' : ''}
          {' '}({filtered.reduce((s, f) => s + f.qty, 0)} units)
        </span>
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-xl border border-slate-200 shadow-sm bg-white">
        <table className="w-full border-collapse">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Product</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Brand</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Category</th>
              {!selectedStoreId && (
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Store</th>
              )}
              <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Qty</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Last Sale</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Rank</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Recommendation</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={selectedStoreId ? 8 : 9} className="px-3 py-8 text-center text-slate-400">
                  No stale inventory detected
                </td>
              </tr>
            ) : (
              filtered.map((f, i) => (
                <tr key={`${f.productId}-${f.storeId}-${i}`} className="hover:bg-slate-50">
                  <td className="px-3 py-2 text-sm font-medium text-slate-900 max-w-[250px] truncate">
                    {f.productName}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-600">{f.brand}</td>
                  <td className="px-3 py-2 text-sm text-slate-600">
                    {f.category}
                    {f.format && <span className="text-slate-400 ml-1">({f.format})</span>}
                  </td>
                  {!selectedStoreId && (
                    <td className="px-3 py-2 text-sm text-slate-600">{f.storeName}</td>
                  )}
                  <td className="px-3 py-2 text-sm text-right font-mono">{f.qty}</td>
                  <td className="px-3 py-2 text-sm text-right">
                    {f.daysSinceLastSale != null ? (
                      <span className={f.daysSinceLastSale > 60 ? 'text-red-600 font-medium' : 'text-amber-600'}>
                        {f.daysSinceLastSale}d ago
                      </span>
                    ) : (
                      <span className="text-red-600 font-medium">Never</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm text-center text-slate-500">
                    {f.categoryRank ? `${f.categoryRank}/${f.categoryTotal}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Badge className={
                      f.recommendation === 'TRANSFER_TO_HUB'
                        ? 'bg-teal-100 text-teal-800 border-teal-200'
                        : 'bg-purple-100 text-purple-800 border-purple-200'
                    }>
                      {f.recommendation === 'TRANSFER_TO_HUB' ? 'Transfer to Hub' : 'Put on Sale'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {f.recommendation === 'TRANSFER_TO_HUB' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 text-teal-700 border-teal-300 hover:bg-teal-50"
                          onClick={() => handleCreateAction(f, 'TRANSFER')}
                          disabled={loadingActions.has(`${f.productId}:${f.storeId}:TRANSFER`)}
                        >
                          {loadingActions.has(`${f.productId}:${f.storeId}:TRANSFER`)
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <ArrowRightLeft className="h-3 w-3 mr-1" />}
                          Transfer
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 text-purple-700 border-purple-300 hover:bg-purple-50"
                          onClick={() => handleCreateAction(f, 'PUT_ON_SALE')}
                          disabled={loadingActions.has(`${f.productId}:${f.storeId}:PUT_ON_SALE`)}
                        >
                          {loadingActions.has(`${f.productId}:${f.storeId}:PUT_ON_SALE`)
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Tag className="h-3 w-3 mr-1" />}
                          Sale
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StaleTable;
