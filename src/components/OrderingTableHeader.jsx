import React from 'react';
import { Badge } from './ui/badge';
import { ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const DraggableHeader = ({ column, children, onSort, sortConfig }) => {
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
    if (!column.isLocation && column.sortKey && !e.target.closest('.drag-handle')) {
      onSort(column.sortKey);
    }
  };

  return (
    <th
      ref={setNodeRef}
      style={style}
      className={`group px-3 py-3 font-semibold border bg-background relative ${
        column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'
      } ${!column.isLocation && column.sortKey ? 'cursor-pointer hover:bg-muted/50' : ''} ${isDragging ? 'z-50' : ''}`}
      onClick={handleHeaderClick}
    >
      <div className={`flex items-center gap-1 ${
        column.align === 'right' ? 'justify-end' : column.align === 'center' ? 'justify-center' : ''
      }`}>
        <button
          className="drag-handle absolute left-2 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing hover:text-primary p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          title="Drag to reorder column"
        >
          <GripVertical className="h-3 w-3" />
        </button>
        <span className="break-words text-wrap flex-1">{children}</span>
        {!column.isLocation && column.sortKey && sortConfig.key === column.sortKey && (
          sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3 flex-shrink-0" /> : <ArrowDown className="h-3 w-3 flex-shrink-0" />
        )}
      </div>
    </th>
  );
};

const OrderingTableHeader = ({ 
  orderedColumns, 
  columnOrder, 
  onDragEnd, 
  onSort, 
  sortConfig, 
  analytics,
  periodDays,
  filteredLocationCounts
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const renderHeaderContent = (column) => {
    if (column.isLocation) {
      // Use filteredLocationCounts if available (content-aware), otherwise fall back to analytics
      const locationCount = filteredLocationCounts?.find(lc => lc.storeId === column.storeId) 
        || analytics?.locationInventoryCounts?.find(lc => lc.storeId === column.storeId);
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
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <thead className="bg-background border-b-2">
        <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
          <tr>
            {orderedColumns.map(column => (
              <DraggableHeader
                key={column.id}
                column={column}
                onSort={onSort}
                sortConfig={sortConfig}
              >
                {renderHeaderContent(column)}
              </DraggableHeader>
            ))}
          </tr>
        </SortableContext>
      </thead>
    </DndContext>
  );
};

export default OrderingTableHeader;
