import { useState, useEffect } from 'react';

const DEFAULT_COLUMNS = [
  { id: 'name', label: 'Product', width: 'w-64', align: 'left', sortKey: 'name' },
  { id: 'brand', label: 'Brand', width: 'w-32', align: 'left', sortKey: 'brand' },
  { id: 'distributor', label: 'Distributor', width: 'w-48', align: 'left', sortKey: null },
  { id: 'strainType', label: 'Type', width: 'w-24', align: 'left', sortKey: 'strainType' },
  { id: 'format', label: 'Format', width: 'w-24', align: 'left', sortKey: 'format' },
  { id: 'parentCategory', label: 'Category', width: 'w-32', align: 'left', sortKey: 'parentCategory' },
  { id: 'wholesaleCost', label: 'Cost', width: 'w-24', align: 'right', sortKey: 'wholesaleCost' },
  { id: 'retailPrice', label: 'Retail', width: 'w-24', align: 'right', sortKey: 'retailPrice' },
  { id: 'margin', label: 'Margin', width: 'w-20', align: 'right', sortKey: 'margin' },
  { id: 'locations', label: 'Locations', width: 'variable', align: 'center', sortKey: null, isLocationGroup: true },
  { id: 'totalInventory', label: 'Total Inv', width: 'w-24', align: 'right', sortKey: 'totalInventory' },
  { id: 'totalSales', label: 'Total Sales', width: 'w-24', align: 'right', sortKey: 'totalSales' },
  { id: 'popularity', label: 'Popularity', width: 'w-28', align: 'center', sortKey: null },
  { id: 'weeksLeft', label: 'Wks Left', width: 'w-24', align: 'center', sortKey: 'weeksLeft' },
  { id: 'daysSinceLastSale', label: 'Days Since Sale', width: 'w-28', align: 'right', sortKey: 'daysSinceLastSale' },
  { id: 'trend', label: 'Trend', width: 'w-20', align: 'center', sortKey: null },
  { id: 'daysSinceLastPO', label: 'Days Since PO', width: 'w-28', align: 'right', sortKey: 'daysSinceLastPO' },
  { id: 'suggestedQty', label: 'Suggested', width: 'w-28', align: 'right', sortKey: 'suggestedQty' },
  { id: 'actions', label: 'Actions', width: 'w-28', align: 'center', sortKey: null },
];

const STORAGE_KEY = 'orderingDashboard_columnOrder';

export const useColumnOrdering = (stores = []) => {
  const [columnOrder, setColumnOrder] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved column order:', e);
      }
    }
    return DEFAULT_COLUMNS.map(col => col.id);
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

  // Update column order when stores change
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
  }, [stores]);

  // Save to localStorage whenever order changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(columnOrder));
  }, [columnOrder]);

  // Get ordered columns with full definitions
  const orderedColumns = columnOrder
    .map(id => allColumnDefinitions.find(col => col.id === id))
    .filter(Boolean);

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

  return {
    columnOrder,
    setColumnOrder,
    orderedColumns,
    allColumnDefinitions,
    resetColumnOrder,
    DEFAULT_COLUMNS
  };
};

export { DEFAULT_COLUMNS };
