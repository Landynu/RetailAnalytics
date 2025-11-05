import React, { useState, useRef } from 'react';
import { Badge } from './ui/badge';
import { ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const DraggableHeader = ({ column, children, onSort, sortConfig, onResizeStart }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    width: `${column.width}px`,
    minWidth: `${column.minWidth || 70}px`,
  };

  const handleHeaderClick = (e) => {
    if (!column.isLocation && column.sortKey && !e.target.closest('.drag-handle') && !e.target.closest('.resize-handle')) {
      onSort(column.sortKey);
    }
  };

  const handleResizeStart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onResizeStart(column.id, e.clientX, column.width);
  };

  return (
    <th
      ref={setNodeRef}
      style={style}
      className={`px-3 py-3 font-semibold border bg-background relative ${
        column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'
      } ${!column.isLocation && column.sortKey ? 'cursor-pointer hover:bg-muted/50' : ''} ${isDragging ? 'z-50' : ''}`}
      onClick={handleHeaderClick}
    >
      <div className={`flex items-center gap-1 ${
        column.align === 'right' ? 'justify-end' : column.align === 'center' ? 'justify-center' : ''
      }`}>
        <button
          className="drag-handle cursor-grab active:cursor-grabbing hover:text-primary p-0.5 -ml-1"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          title="Drag to reorder column"
        >
          <GripVertical className="h-3 w-3" />
        </button>
        <span className="break-words text-wrap">{children}</span>
        {!column.isLocation && column.sortKey && sortConfig.key === column.sortKey && (
          sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3 flex-shrink-0" /> : <ArrowDown className="h-3 w-3 flex-shrink-0" />
        )}
      </div>
      {/* Resize handle */}
      <div
        className="resize-handle absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-emerald-500 group"
        onMouseDown={handleResizeStart}
        title="Drag to resize column"
      >
        <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-emerald-200 opacity-50" />
      </div>
    </th>
  );
};

const OrderingTableHeader = ({ 
  orderedColumns, 
  columnOrder, 
  onSort, 
  sortConfig, 
  analytics,
  periodDays,
  onColumnResize
}) => {
  const [resizing, setResizing] = useState(null);

  const handleResizeStart = (columnId, startX, startWidth) => {
    const initialState = { columnId, startX, startWidth };
    setResizing(initialState);

    const handleMouseMove = (e) => {
      const delta = e.clientX - initialState.startX;
      const newWidth = Math.max(initialState.startWidth + delta, 70);
      onColumnResize(initialState.columnId, newWidth);
    };

    const handleMouseUp = () => {
      setResizing(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const renderHeaderContent = (column) => {
    if (column.isLocation) {
      // Use locationInventoryCounts for accurate per-location inventory counts
      const locationCount = analytics?.locationInventoryCounts?.find(lc => lc.storeId === column.storeId);
      const storeProductCount = locationCount?.count || 0;
      
      return (
        <div className="flex flex-col items-center">
          <Badge variant="secondary" className="mb-1 text-xs px-2">
            {storeProductCount}
          </Badge>
          <div className="break-words text-wrap">{column.storeName}</div>
          <div className="text-xs font-normal text-muted-foreground">Inv/Sales</div>
        </div>
      );
    }

    if (column.id === 'popularity') {
      return (
        <div className="flex flex-col items-center">
          <div className="break-words text-wrap">Popularity</div>
          <div className="text-xs font-normal text-muted-foreground">{periodDays || 14} Days</div>
        </div>
      );
    }

    if (column.id === 'trend') {
      return (
        <div className="flex flex-col items-center">
          <div className="break-words text-wrap">Trend</div>
          <div className="text-xs font-normal text-muted-foreground">12 Wks</div>
        </div>
      );
    }

    return column.label;
  };

  return (
    <thead className="bg-background sticky top-0 z-10 border-b-2">
      <tr>
        {orderedColumns.map(column => (
          <DraggableHeader
            key={column.id}
            column={column}
            onSort={onSort}
            sortConfig={sortConfig}
            onResizeStart={handleResizeStart}
          >
            {renderHeaderContent(column)}
          </DraggableHeader>
        ))}
      </tr>
    </thead>
  );
};

// Memoize component to prevent re-renders when only product data changes
export default React.memo(OrderingTableHeader, (prevProps, nextProps) => {
  // Return true if props are equal (skip re-render), false if different (should re-render)
  const columnOrderEqual = prevProps.columnOrder === nextProps.columnOrder;
  const sortConfigEqual = JSON.stringify(prevProps.sortConfig) === JSON.stringify(nextProps.sortConfig);
  const orderedColumnsEqual = prevProps.orderedColumns === nextProps.orderedColumns;
  const locationCountsEqual = JSON.stringify(prevProps.analytics?.locationInventoryCounts) === JSON.stringify(nextProps.analytics?.locationInventoryCounts);
  const periodDaysEqual = prevProps.periodDays === nextProps.periodDays;
  const callbacksEqual = (
    prevProps.onDragEnd === nextProps.onDragEnd &&
    prevProps.onSort === nextProps.onSort &&
    prevProps.onColumnResize === nextProps.onColumnResize
  );
  
  return columnOrderEqual && sortConfigEqual && orderedColumnsEqual && locationCountsEqual && periodDaysEqual && callbacksEqual;
});
