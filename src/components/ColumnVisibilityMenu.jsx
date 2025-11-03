import React, { useState } from 'react';
import { Button } from './ui/button';
import { Eye, EyeOff, Columns3 } from 'lucide-react';
import { Badge } from './ui/badge';

const ColumnVisibilityMenu = ({ 
  allColumns, 
  hiddenColumns, 
  onToggleColumn, 
  onResetVisibility 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const visibleCount = allColumns.filter(col => !hiddenColumns.has(col.id)).length;
  const hiddenCount = hiddenColumns.size;

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="gap-2"
      >
        <Columns3 className="h-4 w-4" />
        Columns
        {hiddenCount > 0 && (
          <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
            {visibleCount}/{allColumns.length}
          </Badge>
        )}
      </Button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-lg border z-20 max-h-96 overflow-y-auto">
            <div className="p-3 border-b bg-gray-50 flex items-center justify-between sticky top-0">
              <div className="font-semibold text-sm">Column Visibility</div>
              {hiddenCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onResetVisibility();
                    setIsOpen(false);
                  }}
                  className="h-7 text-xs"
                >
                  Show All
                </Button>
              )}
            </div>
            <div className="p-2">
              {allColumns.map(column => {
                const isHidden = hiddenColumns.has(column.id);
                const isLocation = column.isLocation || column.id.startsWith('location-');
                
                return (
                  <label
                    key={column.id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      checked={!isHidden}
                      onChange={() => onToggleColumn(column.id)}
                      className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div className="flex items-center gap-2 flex-1">
                      {isHidden ? (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      ) : (
                        <Eye className="h-4 w-4 text-emerald-600" />
                      )}
                      <span className={`text-sm ${isHidden ? 'text-gray-400' : 'text-gray-700'}`}>
                        {column.label}
                      </span>
                      {isLocation && (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0">
                          Location
                        </Badge>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="p-3 border-t bg-gray-50 text-xs text-gray-600">
              <div className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {visibleCount} visible • {hiddenCount} hidden
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ColumnVisibilityMenu;
