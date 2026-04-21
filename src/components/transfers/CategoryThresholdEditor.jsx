import React, { useState, useMemo } from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Settings2, RotateCcw, Save, ChevronDown, ChevronRight } from 'lucide-react';

const CELL_COLORS = {
  over: 'bg-green-50 text-green-800',     // at or above target
  close: 'bg-amber-50 text-amber-800',    // within 1-2 of target
  gap: 'bg-red-50 text-red-800',          // below target
  noTarget: 'text-slate-600',             // no threshold set
};

function getCellColor(current, target) {
  if (target == null || target === '') return CELL_COLORS.noTarget;
  const t = Number(target);
  if (t <= 0) return CELL_COLORS.noTarget;
  if (current >= t) return CELL_COLORS.over;
  if (current >= t - 2) return CELL_COLORS.close;
  return CELL_COLORS.gap;
}

const CategoryThresholdEditor = ({
  categoryMatrix,
  satelliteStores,
  hubStore,
  thresholds,
  onThresholdsChange,
  onResetThresholds
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState(new Set());
  const [editingCell, setEditingCell] = useState(null); // "groupKey:storeId"

  const { groups, storeCounts, maxCounts } = categoryMatrix;

  // Group the category rows by parent category for collapsible sections
  const groupedByCategory = useMemo(() => {
    const map = new Map();
    for (const group of groups) {
      if (!map.has(group.category)) {
        map.set(group.category, []);
      }
      map.get(group.category).push(group);
    }
    return map;
  }, [groups]);

  const toggleCategory = (category) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const handleThresholdChange = (groupKey, storeId, value) => {
    const key = `${groupKey}:${storeId}`;
    const numVal = value === '' ? null : parseInt(value);
    onThresholdsChange(key, numVal);
  };

  const handleSetAllFromCurrent = () => {
    // Set all thresholds to current SKU counts
    const newThresholds = {};
    for (const group of groups) {
      for (const store of satelliteStores) {
        const key = `${group.groupKey}:${store.id}`;
        const current = storeCounts[key] || 0;
        if (current > 0) {
          newThresholds[key] = current;
        }
      }
    }
    onThresholdsChange(null, null, newThresholds); // batch update
  };

  const handleSetAllFromMax = () => {
    // Set all satellite thresholds to the max count across all stores
    const newThresholds = {};
    for (const group of groups) {
      const maxCount = maxCounts[group.groupKey] || 0;
      if (maxCount > 0) {
        for (const store of satelliteStores) {
          const key = `${group.groupKey}:${store.id}`;
          newThresholds[key] = maxCount;
        }
      }
    }
    onThresholdsChange(null, null, newThresholds);
  };

  // Summary stats
  const totalGaps = useMemo(() => {
    let count = 0;
    for (const group of groups) {
      for (const store of satelliteStores) {
        const key = `${group.groupKey}:${store.id}`;
        const current = storeCounts[key] || 0;
        const target = thresholds[key];
        if (target != null && target > 0 && current < target) count++;
      }
    }
    return count;
  }, [groups, satelliteStores, storeCounts, thresholds]);

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="border-purple-300 hover:bg-purple-50 text-purple-700"
      >
        <Settings2 className="h-4 w-4 mr-2" />
        Category Thresholds
        {Object.keys(thresholds).length > 0 && (
          <Badge className="ml-2 bg-purple-100 text-purple-700 text-xs">
            {Object.keys(thresholds).length} set
          </Badge>
        )}
      </Button>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-purple-600" />
            Category SKU Thresholds
          </h3>
          <span className="text-sm text-slate-500">
            Set target SKU counts per category per store.
            {totalGaps > 0 && (
              <Badge className="ml-2 bg-red-100 text-red-700 text-xs">{totalGaps} gaps</Badge>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSetAllFromCurrent}
            className="text-xs h-7"
            title="Set all targets to current counts (maintain status quo)"
          >
            Set from Current
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSetAllFromMax}
            className="text-xs h-7"
            title="Set all targets to the highest count across any store"
          >
            Set from Best Store
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onResetThresholds}
            className="text-xs h-7 text-red-600 border-red-200 hover:bg-red-50"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Clear All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsOpen(false)}
            className="text-xs h-7"
          >
            Close
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span>Cell colors:</span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-green-100 border border-green-200" /> At/above target
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-amber-100 border border-amber-200" /> Close (within 2)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-red-100 border border-red-200" /> Below target
        </span>
        <span className="text-slate-400 ml-2">Click any number to edit the target. Current count shown in parentheses.</span>
      </div>

      {/* Matrix table */}
      <div className="overflow-auto rounded-xl border border-slate-200 shadow-sm bg-white max-h-[600px]">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-50 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-50 min-w-[200px]">
                Category Group
              </th>
              {hubStore && (
                <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase tracking-wider min-w-[80px]">
                  {hubStore.name}
                  <div className="text-[10px] font-normal text-slate-400 normal-case">(Hub)</div>
                </th>
              )}
              {satelliteStores.map(store => (
                <th key={store.id} className="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase tracking-wider min-w-[100px]">
                  {store.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...groupedByCategory.entries()].map(([category, categoryGroups]) => {
              const isCollapsed = collapsedCategories.has(category);

              return (
                <React.Fragment key={category}>
                  {/* Category header row */}
                  <tr
                    className="bg-slate-50/80 cursor-pointer hover:bg-slate-100"
                    onClick={() => toggleCategory(category)}
                  >
                    <td className="px-3 py-1.5 font-semibold text-slate-700 sticky left-0 bg-slate-50/80 flex items-center gap-1">
                      {isCollapsed
                        ? <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                        : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
                      {category}
                      <span className="font-normal text-slate-400 text-xs ml-1">
                        ({categoryGroups.length} group{categoryGroups.length !== 1 ? 's' : ''})
                      </span>
                    </td>
                    {hubStore && <td />}
                    {satelliteStores.map(s => <td key={s.id} />)}
                  </tr>

                  {/* Subcategory rows */}
                  {!isCollapsed && categoryGroups.map(group => (
                    <tr key={group.groupKey} className="hover:bg-slate-50 border-t border-slate-100/50">
                      <td className="px-3 py-1 pl-8 text-slate-600 sticky left-0 bg-white">
                        {group.subcategory}
                      </td>

                      {/* Hub column (read-only, just shows count) */}
                      {hubStore && (
                        <td className="px-2 py-1 text-center font-mono text-xs text-slate-400">
                          {storeCounts[`${group.groupKey}:${hubStore.id}`] || 0}
                        </td>
                      )}

                      {/* Satellite columns (editable) */}
                      {satelliteStores.map(store => {
                        const key = `${group.groupKey}:${store.id}`;
                        const current = storeCounts[key] || 0;
                        const target = thresholds[key];
                        const isEditing = editingCell === key;
                        const cellColor = getCellColor(current, target);

                        return (
                          <td
                            key={store.id}
                            className={`px-2 py-1 text-center ${cellColor}`}
                          >
                            {isEditing ? (
                              <input
                                type="number"
                                min={0}
                                autoFocus
                                defaultValue={target != null ? target : ''}
                                placeholder={String(current)}
                                className="w-16 text-center text-xs border rounded px-1 py-0.5 bg-white"
                                onBlur={(e) => {
                                  handleThresholdChange(group.groupKey, store.id, e.target.value);
                                  setEditingCell(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleThresholdChange(group.groupKey, store.id, e.target.value);
                                    setEditingCell(null);
                                  }
                                  if (e.key === 'Escape') setEditingCell(null);
                                }}
                              />
                            ) : (
                              <button
                                onClick={() => setEditingCell(key)}
                                className="w-full text-center font-mono text-xs cursor-pointer hover:underline"
                                title={`Current: ${current}, Target: ${target != null ? target : 'not set'} — click to edit`}
                              >
                                {target != null ? (
                                  <span>
                                    <span className="font-semibold">{target}</span>
                                    <span className="text-slate-400 ml-0.5">({current})</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-400">{current}</span>
                                )}
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CategoryThresholdEditor;
