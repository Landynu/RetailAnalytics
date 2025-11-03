import React from 'react';

const LocationCell = ({ product, storeId, periodDays }) => {
  const inv = product.locationInventory.find(l => l.storeId === storeId);
  const sale = product.locationSales.find(s => s.storeId === storeId);
  const inventory = inv ? inv.quantity : 0;
  const sales = sale ? sale.units : 0;
  
  const localVelocity = sales / (periodDays / 7);
  const localWeeksLeft = localVelocity > 0 ? inventory / localVelocity : 999;

  const getCellColor = (inventory, sales, weeksLeft) => {
    if (inventory === 0 && sales > 0) return 'bg-red-100';
    if (weeksLeft < 1) return 'bg-orange-100';
    if (weeksLeft < 2) return 'bg-yellow-100';
    if (inventory > 0 && sales > 0) return 'bg-green-50';
    if (inventory === 0 && sales === 0) return 'bg-gray-50 text-gray-400';
    return '';
  };

  return (
    <td 
      className={`px-3 py-3 text-center border font-mono w-28 ${getCellColor(inventory, sales, localWeeksLeft)}`}
    >
      <div className="font-semibold text-lg">{inventory}</div>
      <div className="text-sm text-muted-foreground">/ {sales}</div>
    </td>
  );
};

export default LocationCell;
