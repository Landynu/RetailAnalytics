import { useState, useEffect } from 'react';

// Default widths in pixels
const DEFAULT_WIDTHS = {
  'name': 256,
  'brand': 128,
  'distributor': 140,
  'classification': 120,
  'category': 120,
  'subcategory': 120,
  'strainType': 96,
  'format': 96,
  'parentCategory': 128,
  'wholesaleCost': 96,
  'retailPrice': 96,
  'margin': 80,
  'categoryRank': 90,
  'totalInventory': 96,
  'totalSales': 96,
  'popularity': 112,
  'weeksLeft': 96,
  'daysSinceLastSale': 112,
  'trend': 80,
  'daysSinceLastPO': 112,
  'suggestedQty': 112,
  'actions': 112,
};

const DEFAULT_COLUMNS = [
  { id: 'name', label: 'Product', align: 'left', sortKey: 'name', minWidth: 150 },
  { id: 'brand', label: 'Brand', align: 'left', sortKey: 'brand', minWidth: 100 },
  { id: 'categoryRank', label: 'Rank', align: 'center', sortKey: 'categoryRank', minWidth: 80 },
  { id: 'distributor', label: 'Distributor', align: 'left', sortKey: 'distributor', minWidth: 100 },
  { id: 'classification', label: 'Classification', align: 'left', sortKey: 'classification', minWidth: 120 },
  { id: 'category', label: 'Category', align: 'left', sortKey: 'category', minWidth: 120 },
  { id: 'subcategory', label: 'Subcategory', align: 'left', sortKey: 'subcategory', minWidth: 120 },
  { id: 'strainType', label: 'Type', align: 'left', sortKey: 'strainType', minWidth: 80 },
  { id: 'format', label: 'Format', align: 'left', sortKey: 'format', minWidth: 80 },
  { id: 'parentCategory', label: 'Category', align: 'left', sortKey: 'parentCategory', minWidth: 100 },
  { id: 'wholesaleCost', label: 'Cost', align: 'right', sortKey: 'wholesaleCost', minWidth: 80 },
  { id: 'retailPrice', label: 'Retail', align: 'right', sortKey: 'retailPrice', minWidth: 80 },
  { id: 'margin', label: 'Margin', align: 'right', sortKey: 'margin', minWidth: 70 },
  { id: 'locations', label: 'Locations', align: 'center', sortKey: null, isLocationGroup: true, minWidth: 112 },
  { id: 'totalInventory', label: 'Total Inv', align: 'right', sortKey: 'totalInventory', minWidth: 80 },
  { id: 'totalSales', label: 'Total Sales', align: 'right', sortKey: 'totalSales', minWidth: 80 },
  { id: 'popularity', label: 'Popularity', align: 'center', sortKey: null, minWidth: 90 },
  { id: 'weeksLeft', label: 'Wks Left', align: 'center', sortKey: 'weeksLeft', minWidth: 80 },
  { id: 'daysSinceLastSale', label: 'Days Since Sale', align: 'right', sortKey: 'daysSinceLastSale', minWidth: 90 },
  { id: 'trend', label: 'Trend', align: 'center', sortKey: null, minWidth: 70 },
  { id: 'daysSinceLastPO', label: 'Days Since PO', align: 'right', sortKey: 'daysSinceLastPO', minWidth: 90 },
  { id: 'suggestedQty', label: 'Suggested', align: 'right', sortKey: 'suggestedQty', minWidth: 90 },
  { id: 'actions', label: 'Actions', align: 'center', sortKey: null, minWidth: 90 },
];

const STORAGE_KEY = 'orderingDashboard_columnOrder';
const WIDTHS_STORAGE_KEY = 'orderingDashboard_columnWidths';
const VISIBILITY_STORAGE_KEY = 'orderingDashboard_columnVisibility';

export const useColumnOrdering = (stores = []) => {
  const [columnOrder, setColumnOrder] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const savedOrder = JSON.parse(saved);
        
        // Check if categoryRank is missing and add it after brand
        if (!savedOrder.includes('categoryRank')) {
          const brandIndex = savedOrder.indexOf('brand');
          if (brandIndex !== -1) {
            const newOrder = [...savedOrder];
            newOrder.splice(brandIndex + 1, 0, 'categoryRank');
            return newOrder;
          }
        }
        
        return savedOrder;
      } catch (e) {
        console.error('Failed to parse saved column order:', e);
      }
    }
    return DEFAULT_COLUMNS.map(col => col.id);
  });

  const [columnWidths, setColumnWidths] = useState(() => {
    const saved = localStorage.getItem(WIDTHS_STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved column widths:', e);
      }
    }
    return { ...DEFAULT_WIDTHS };
  });

  const [hiddenColumns, setHiddenColumns] = useState(() => {
    const saved = localStorage.getItem(VISIBILITY_STORAGE_KEY);
    if (saved) {
      try {
        return new Set(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved column visibility:', e);
      }
    }
    return new Set();
  });

  // Generate column definitions including dynamic location columns
  const allColumnDefinitions = [...DEFAULT_COLUMNS];
  
  // Replace the 'locations' placeholder with actual store columns
  const locationsIndex = allColumnDefinitions.findIndex(col => col.id === 'locations');
  if (locationsIndex !== -1 && stores.length > 0) {
    allColumnDefinitions.splice(locationsIndex, 1);
    stores.forEach((store, idx) => {
      allColumnDefinitions.splice(locationsIndex + idx, 0, {
        id: `location-${store.id}`,
        label: store.name,
        width: 'w-28',
        align: 'center',
        sortKey: null,
        isLocation: true,
        storeId: store.id,
        storeName: store.name
      });
    });
  }

  // Update column order when stores change (only when actual store IDs change)
  // Use a stable dependency based on store IDs to prevent unnecessary re-renders
  const storeIds = stores.map(s => s.id).sort().join(',');

  useEffect(() => {
    if (stores.length > 0) {
      setColumnOrder(prevOrder => {
        // Get all location column IDs
        const locationColumnIds = stores.map(s => `location-${s.id}`);
        const locationsGroupIndex = prevOrder.indexOf('locations');

        // If we have the old 'locations' placeholder
        if (locationsGroupIndex !== -1) {
          const newOrder = [...prevOrder];
          newOrder.splice(locationsGroupIndex, 1, ...locationColumnIds);
          return newOrder;
        }

        // Otherwise, ensure all location columns exist
        const existingLocationIds = prevOrder.filter(id => id.startsWith('location-'));
        const newLocationIds = locationColumnIds.filter(id => !existingLocationIds.includes(id));

        if (newLocationIds.length > 0) {
          // Find where to insert new locations (after last existing location or after margin)
          let insertIndex = prevOrder.length;
          const lastLocationIndex = Math.max(...prevOrder.map((id, i) =>
            id.startsWith('location-') ? i : -1
          ));

          if (lastLocationIndex >= 0) {
            insertIndex = lastLocationIndex + 1;
          } else {
            const marginIndex = prevOrder.indexOf('margin');
            if (marginIndex !== -1) {
              insertIndex = marginIndex + 1;
            }
          }

          const newOrder = [...prevOrder];
          newOrder.splice(insertIndex, 0, ...newLocationIds);
          return newOrder;
        }

        return prevOrder;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeIds]); // Only re-run when store IDs actually change

  // Save to localStorage whenever order, widths, or visibility changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(columnOrder));
  }, [columnOrder]);

  useEffect(() => {
    localStorage.setItem(WIDTHS_STORAGE_KEY, JSON.stringify(columnWidths));
  }, [columnWidths]);

  useEffect(() => {
    localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify([...hiddenColumns]));
  }, [hiddenColumns]);

  // Get ordered columns with full definitions, filtering out hidden columns
  const orderedColumns = columnOrder
    .map(id => allColumnDefinitions.find(col => col.id === id))
    .filter(col => col && !hiddenColumns.has(col.id))
    .map(col => ({
      ...col,
      width: columnWidths[col.id] || DEFAULT_WIDTHS[col.id] || 112
    }));

  const toggleColumnVisibility = (columnId) => {
    setHiddenColumns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(columnId)) {
        newSet.delete(columnId);
      } else {
        newSet.add(columnId);
      }
      return newSet;
    });
  };

  const updateColumnWidth = (columnId, width) => {
    setColumnWidths(prev => ({
      ...prev,
      [columnId]: Math.max(width, 70) // Minimum 70px
    }));
  };

  const resetColumnOrder = () => {
    if (confirm('Reset column order to default?')) {
      // Build default order with actual location columns instead of placeholder
      let defaultOrder = DEFAULT_COLUMNS.map(col => col.id);
      
      // Replace 'locations' placeholder with actual store columns
      const locationsIndex = defaultOrder.indexOf('locations');
      if (locationsIndex !== -1 && stores.length > 0) {
        const locationColumnIds = stores.map(s => `location-${s.id}`);
        defaultOrder.splice(locationsIndex, 1, ...locationColumnIds);
      }
      
      setColumnOrder(defaultOrder);
    }
  };

  const resetColumnWidths = () => {
    if (confirm('Reset all column widths to default?')) {
      setColumnWidths({ ...DEFAULT_WIDTHS });
    }
  };

  const resetColumnVisibility = () => {
    if (confirm('Show all columns?')) {
      setHiddenColumns(new Set());
    }
  };

  return {
    columnOrder,
    setColumnOrder,
    orderedColumns,
    allColumnDefinitions,
    resetColumnOrder,
    resetColumnWidths,
    resetColumnVisibility,
    columnWidths,
    updateColumnWidth,
    hiddenColumns,
    toggleColumnVisibility,
    DEFAULT_COLUMNS
  };
};

export { DEFAULT_COLUMNS, DEFAULT_WIDTHS };
