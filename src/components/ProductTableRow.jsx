import React from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ShoppingCart } from 'lucide-react';
import Sparkline from './Sparkline';
import LocationCell from './LocationCell';
import DistributorCell from './DistributorCell';
import { formatRelativeTime } from '../lib/formatRelativeTime';

const ProductTableRow = ({ product, orderedColumns, periodDays, maxTotalSales, onAddToOrder, isLoadingTrends = false }) => {
  const getStrainColor = (strainType) => {
    switch(strainType) {
      case 'Sativa': return 'bg-green-500';
      case 'Hybrid': return 'bg-purple-500';
      case 'Indica': return 'bg-blue-500';
      default: return 'bg-gray-400';
    }
  };

  const cleanText = (text) => {
    if (!text) return '';
    return text.replace(/\s*>\s*/g, ' ').trim();
  };

  const getHeatMapColor = (value, maxValue) => {
    if (!value || !maxValue || maxValue === 0) return 'bg-gray-100';
    const percentage = (value / maxValue) * 100;
    if (percentage >= 75) return 'bg-emerald-200 text-emerald-900';
    if (percentage >= 50) return 'bg-lime-200 text-lime-900';
    if (percentage >= 35) return 'bg-yellow-200 text-yellow-900';
    if (percentage >= 20) return 'bg-orange-200 text-orange-900';
    if (percentage >= 10) return 'bg-rose-200 text-rose-900';
    return 'bg-red-100 text-red-900';
  };

  const renderCell = (column) => {
    const cellStyle = {
      width: `${column.width}px`,
      minWidth: `${column.minWidth || 70}px`,
    };

    switch (column.id) {
      case 'name':
        return (
          <td key={column.id} style={cellStyle} className="px-3 py-3 border">
            <span className="font-medium text-emerald-900 break-words">{product.name}</span>
          </td>
        );

      case 'categoryRank':
        return (
          <td key={column.id} style={cellStyle} className="px-3 py-3 text-center border">
            {product.categoryRank && product.categoryTotal ? (
              <div className="flex items-center justify-center gap-1">
                {product.isTop10 && <span className="text-base">🏆</span>}
                <span className="font-semibold text-base">
                  {product.categoryRank}/{product.categoryTotal}
                </span>
              </div>
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </td>
        );

      case 'brand':
        return (
          <td key={column.id} style={cellStyle} className="px-3 py-3 border text-emerald-800 font-medium">
            <div className="break-words text-base">{product.brand}</div>
          </td>
        );

      case 'strainType':
        return (
          <td key={column.id} style={cellStyle} className="px-3 py-3 border">
            {product.strainType && product.strainType !== 'N/A' ? (
              <Badge className={`${getStrainColor(product.strainType)} text-white text-xs`}>
                {product.strainType}
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">-</span>
            )}
          </td>
        );

      case 'format':
        return (
          <td key={column.id} style={cellStyle} className="px-3 py-3 text-center border">
            <span className="text-base font-medium break-words">{cleanText(product.format) || '-'}</span>
          </td>
        );

      case 'parentCategory':
        return (
          <td key={column.id} style={cellStyle} className="px-3 py-3 text-muted-foreground border">
            <div className="break-words text-sm">
              {product.parentCategory}
              {product.subcategory && <><br/><span className="text-xs">› {cleanText(product.subcategory)}</span></>}
            </div>
          </td>
        );

      case 'wholesaleCost':
        return (
          <td key={column.id} style={cellStyle} className="px-3 py-3 text-right font-mono border text-base">
            ${(product.wholesaleCost || 0).toFixed(2)}
          </td>
        );

      case 'retailPrice':
        return (
          <td key={column.id} style={cellStyle} className="px-3 py-3 text-right font-mono border text-base">
            ${(product.retailPrice || 0).toFixed(2)}
          </td>
        );

      case 'margin':
        return (
          <td key={column.id} style={cellStyle} className="px-3 py-3 text-right border text-base">
            {((product.margin || 0) * 100).toFixed(0)}%
          </td>
        );

      case 'totalInventory':
        return (
          <td key={column.id} style={cellStyle} className="px-3 py-3 text-right font-semibold border text-lg">
            {product.totalInventory}
          </td>
        );

      case 'totalSales':
        return (
          <td key={column.id} style={cellStyle} className={`px-3 py-3 text-right border font-semibold text-lg ${getHeatMapColor(product.totalSales, maxTotalSales)}`}>
            {product.totalSales}
          </td>
        );

      case 'popularity':
        return (
          <td key={column.id} style={cellStyle} className={`px-3 py-3 text-center border ${getHeatMapColor(product.totalSales, maxTotalSales)}`}>
            <div className="flex items-center justify-center gap-1">
              <div className="text-base font-bold">
                {maxTotalSales > 0 ? Math.round((product.totalSales / maxTotalSales) * 100) : 0}%
              </div>
              {product.totalSales > maxTotalSales * 0.75 ? '🔥' : 
               product.totalSales > maxTotalSales * 0.5 ? '🌡️' : 
               product.totalSales > maxTotalSales * 0.25 ? '❄️' : '🧊'}
            </div>
          </td>
        );

      case 'weeksLeft':
        return (
          <td key={column.id} style={cellStyle} className="px-3 py-3 text-center border">
            <Badge className={
              product.weeksLeft < 2 ? 'bg-green-500' :
              product.weeksLeft < 3 ? 'bg-yellow-500' : 'bg-red-500'
            }>
              {product.weeksLeft < 999 ? product.weeksLeft.toFixed(1) : '∞'}w
            </Badge>
          </td>
        );

      case 'daysSinceLastSale':
        return (
          <td key={column.id} style={cellStyle} className="px-3 py-3 text-right border text-base">
            {product.daysSinceLastSale !== null ? (
              <span className={product.daysSinceLastSale > 30 ? 'text-red-600 font-semibold' : ''}>
                {product.daysSinceLastSale} {product.daysSinceLastSale === 1 ? 'day' : 'days'}
              </span>
            ) : (
              <span className="text-muted-foreground">Never</span>
            )}
          </td>
        );

      case 'trend':
        return (
          <td key={column.id} style={cellStyle} className="px-3 py-3 text-center border">
            {product.sparklineData && product.sparklineData.length > 0 ? (
              <Sparkline data={product.sparklineData} width={60} height={20} />
            ) : isLoadingTrends ? (
              <Sparkline data={[]} width={60} height={20} isLoading={true} />
            ) : (
              <span className="text-muted-foreground text-xs">-</span>
            )}
          </td>
        );

      case 'daysSinceLastPO':
        return (
          <td key={column.id} style={cellStyle} className="px-3 py-3 text-right border text-base">
            {product.daysSinceLastPO !== null && product.daysSinceLastPO !== undefined ? (
              <div className={product.daysSinceLastPO > 90 ? 'text-orange-600 font-semibold' : ''}>
                <span>{product.daysSinceLastPO}d</span>
                {product.lastPOQty && <span className="text-xs text-muted-foreground ml-1">({product.lastPOQty})</span>}
              </div>
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </td>
        );

      case 'suggestedQty':
        return (
          <td key={column.id} style={cellStyle} className="px-3 py-3 text-right border">
            {product.suggestedQty > 0 ? (
              <div>
                <div className="font-semibold text-lg">{product.suggestedQty}</div>
                <div className="text-sm text-muted-foreground">
                  ({product.suggestedCases} cases)
                </div>
              </div>
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </td>
        );

      case 'distributor':
        return (
          <td key={column.id} style={cellStyle} className="px-3 py-3 border">
            <DistributorCell 
              brand={product.brand}
              distributors={product.distributors || []}
              allDistributors={column.allDistributors || []}
            />
          </td>
        );

      case 'actions':
        return (
          <td key={column.id} style={cellStyle} className="px-3 py-3 text-center border">
            {product.suggestedQty > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAddToOrder(product)}
              >
                <ShoppingCart className="h-3 w-3 mr-1" />
                Add
              </Button>
            )}
          </td>
        );

      default:
        // Handle location columns
        if (column.isLocation) {
          return (
            <LocationCell 
              key={column.id}
              column={column}
              product={product} 
              storeId={column.storeId} 
              periodDays={periodDays}
            />
          );
        }
        return null;
    }
  };

  return (
    <tr className="hover:bg-muted/30 border-b">
      {orderedColumns.map(column => renderCell(column))}
    </tr>
  );
};

export default ProductTableRow;
