import React, { useState, useMemo } from 'react';
import { Badge } from '../ui/badge';
import { ChevronDown, ChevronRight } from 'lucide-react';

const GapTable = ({
  categoryGaps,
  satelliteStores,
  selectedStoreId,
  onStoreChange
}) => {
  const filtered = useMemo(() => {
    let items = categoryGaps;
    if (selectedStoreId) {
      items = items.filter(g => g.storeId === selectedStoreId);
    }
    return items;
  }, [categoryGaps, selectedStoreId]);

  // Group by store for display
  const [expandedGaps, setExpandedGaps] = useState(new Set());

  const toggleGap = (key) => {
    setExpandedGaps(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const groupedByStore = useMemo(() => {
    const groups = new Map();
    for (const gap of filtered) {
      if (!groups.has(gap.storeId)) {
        groups.set(gap.storeId, { storeName: gap.storeName, gaps: [] });
      }
      groups.get(gap.storeId).gaps.push(gap);
    }
    return Array.from(groups.values());
  }, [filtered]);

  const getDeficitBadge = (deficit) => {
    if (deficit > 5) return 'bg-red-100 text-red-800 border-red-200';
    if (deficit >= 2) return 'bg-amber-100 text-amber-800 border-amber-200';
    return 'bg-green-100 text-green-800 border-green-200';
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
          {filtered.length} category gap{filtered.length !== 1 ? 's' : ''} detected
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400 bg-white rounded-xl border border-slate-200">
          No category gaps detected across satellite stores
        </div>
      ) : (
        <div className="space-y-6">
          {groupedByStore.map(group => (
            <div key={group.storeName} className="overflow-auto rounded-xl border border-slate-200 shadow-sm bg-white">
              <div className="bg-slate-50 px-4 py-2 border-b">
                <h3 className="font-semibold text-sm text-slate-700">{group.storeName}</h3>
              </div>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-8"></th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Category</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Subcategory / Format</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Store SKUs</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Target</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Avg</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Deficit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {group.gaps.map((gap, i) => {
                    const gapKey = `${gap.storeId}-${gap.category}-${gap.subcategory}-${i}`;
                    const isExpanded = expandedGaps.has(gapKey);
                    const hasSuggestions = gap.suggestedProducts && gap.suggestedProducts.length > 0;

                    return (
                      <React.Fragment key={gapKey}>
                        <tr
                          className={`hover:bg-slate-50 ${hasSuggestions ? 'cursor-pointer' : ''}`}
                          onClick={() => hasSuggestions && toggleGap(gapKey)}
                        >
                          <td className="px-4 py-2 text-slate-400">
                            {hasSuggestions && (
                              isExpanded
                                ? <ChevronDown className="h-3.5 w-3.5" />
                                : <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </td>
                          <td className="px-4 py-2 text-sm font-medium text-slate-900">{gap.category}</td>
                          <td className="px-4 py-2 text-sm text-slate-600">{gap.subcategory}</td>
                          <td className="px-4 py-2 text-sm text-right font-mono">{gap.storeSkuCount}</td>
                          <td className="px-4 py-2 text-sm text-right font-mono font-semibold">{gap.targetSkuCount}</td>
                          <td className="px-4 py-2 text-sm text-right font-mono text-slate-400">{gap.avgSkuCount}</td>
                          <td className="px-4 py-2 text-center">
                            <Badge className={`text-xs ${getDeficitBadge(gap.deficit)}`}>
                              -{gap.deficit} SKUs
                            </Badge>
                          </td>
                        </tr>

                        {/* Expanded suggestions */}
                        {isExpanded && hasSuggestions && (
                          <tr>
                            <td colSpan={7} className="px-4 py-2 bg-blue-50/50">
                              <div className="pl-8">
                                <p className="text-xs font-medium text-blue-700 mb-1.5">
                                  Suggested products to add (by velocity):
                                </p>
                                <div className="space-y-1">
                                  {gap.suggestedProducts.map(p => (
                                    <div key={p.id} className="flex items-center gap-3 text-xs text-slate-700">
                                      <span className="font-medium min-w-[200px] truncate">{p.name}</span>
                                      <span className="text-slate-500">{p.brand}</span>
                                      <span className="text-slate-400 font-mono">
                                        {p.velocity > 0 ? `${p.velocity.toFixed(1)}/wk` : '—'}
                                      </span>
                                      {p.categoryRank && (
                                        <Badge className="bg-slate-100 text-slate-600 text-[10px] px-1 py-0">
                                          #{p.categoryRank}/{p.categoryTotal}
                                        </Badge>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GapTable;
