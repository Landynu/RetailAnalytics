import React from 'react';

const LocationCell = ({ column, product, storeId, periodDays }) => {
  const inv = product.locationInventory.find(l => l.storeId === storeId);
  const sale = product.locationSales.find(s => s.storeId === storeId);
  const inventory = inv ? inv.quantity : 0;
  const sales = sale ? sale.units : 0;
  
  const localVelocity = sales / (periodDays / 7);
  const localWeeksLeft = localVelocity > 0 ? inventory / localVelocity : 999;

  const getCellColor = (inventory, sales, weeksLeft) => {
    if (inventory === 0 && sales > 0) return 'bg-red-50 text-red-900 border-red-200/50';
    if (weeksLeft < 1) return 'bg-[#f59e0b]/20 text-[#f59e0b] border-[#f59e0b]/30';
    if (weeksLeft < 2) return 'bg-yellow-50 text-yellow-900 border-yellow-200/50';
    if (inventory > 0 && sales > 0) return 'bg-gradient-to-br from-teal-50/50 to-blue-50/50 text-teal-900 border-teal-200/50';
    if (inventory === 0 && sales === 0) return 'bg-slate-50 text-slate-400 border-slate-200/50';
    return 'bg-slate-50/30 text-slate-700 border-slate-200/50';
  };

  const cellStyle = {
    width: `${column.width}px`,
    minWidth: `${column.minWidth || 70}px`,
  };

  return (
    <td 
      style={cellStyle}
      className={`px-4 py-3 text-center border-r border-b font-mono ${getCellColor(inventory, sales, localWeeksLeft)}`}
    >
      <div className="font-bold text-lg">{inventory}</div>
      <div className="text-sm opacity-75">/ {sales}</div>
    </td>
  );
};

export default LocationCell;
