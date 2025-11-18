import React from 'react';
import { Link } from 'wasp/client/router';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ShoppingCart, History } from 'lucide-react';
import Sparkline from './Sparkline';
import LocationCell from './LocationCell';
import DistributorCell from './DistributorCell';
import StrainTypeCell from './StrainTypeCell';
import CategoryCell from './CategoryCell';
import SubcategoryCell from './SubcategoryCell';
import ActionMenu from './ActionMenu';
import { formatRelativeTime } from '../lib/formatRelativeTime';

const ProductTableRow = ({ product, orderedColumns, periodDays, maxTotalSales, onAddToOrder, onRowClick, isLoadingTrends = false, rowIndex = 0, hasDoNotReorderAction = false, activeActions = [] }) => {
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
          <td key={column.id} style={cellStyle} className="px-4 py-3 border-r border-b border-slate-200/50">
            <div className="flex items-center gap-2">
              <Link
                to={`/product/${product.id}`}
                className="font-semibold text-teal-800 hover:text-teal-600 hover:underline break-words flex-1"
              >
                {product.name}
              </Link>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onRowClick) onRowClick(product);
                }}
                className="flex-shrink-0 p-1.5 rounded-md hover:bg-blue-50 text-blue-600 hover:text-blue-700 transition-colors group"
                title="View inventory movement history"
              >
                <History className="h-4 w-4" />
              </button>
              <ActionMenu productId={product.id} activeActions={activeActions} />
            </div>
          </td>
        );

      case 'categoryRank':
        return (
          <td key={column.id} style={cellStyle} className="px-4 py-3 text-center border-r border-b border-slate-200/50">
            {product.categoryRank && product.categoryTotal ? (
              <div className="flex items-center justify-center gap-1">
                {product.isTop10 && <span className="text-base">🏆</span>}
                <span className="font-semibold text-base text-slate-800">
                  {product.categoryRank}/{product.categoryTotal}
                </span>
              </div>
            ) : (
              <span className="text-slate-400">-</span>
            )}
          </td>
        );

      case 'brand':
        return (
          <td key={column.id} style={cellStyle} className="px-4 py-3 border-r border-b border-slate-200/50 text-teal-700 font-semibold">
            <div className="break-words text-base">{product.brand}</div>
          </td>
        );

      case 'strainType':
        return (
          <td key={column.id} style={cellStyle} className="px-4 py-3 border-r border-b border-slate-200/50">
            {product.strainType && product.strainType !== 'N/A' ? (
              <Badge className={`${getStrainColor(product.strainType)} text-white text-xs font-semibold shadow-sm rounded-lg`}>
                {product.strainType}
              </Badge>
            ) : (
              <span className="text-xs text-slate-400">-</span>
            )}
          </td>
        );

      case 'format':
        return (
          <td key={column.id} style={cellStyle} className="px-4 py-3 text-center border-r border-b border-slate-200/50">
            <span className="text-base font-medium break-words text-slate-700">{cleanText(product.format) || '-'}</span>
          </td>
        );

      case 'parentCategory':
        return (
          <td key={column.id} style={cellStyle} className="px-4 py-3 text-slate-600 border-r border-b border-slate-200/50">
            <div className="break-words text-sm">
              {product.parentCategory}
              {product.subcategory && <><br/><span className="text-xs text-slate-500">› {cleanText(product.subcategory)}</span></>}
            </div>
          </td>
        );

      case 'wholesaleCost':
        return (
          <td key={column.id} style={cellStyle} className="px-4 py-3 text-right font-mono border-r border-b border-slate-200/50 text-base text-slate-700">
            ${(product.wholesaleCost || 0).toFixed(2)}
          </td>
        );

      case 'retailPrice':
        return (
          <td key={column.id} style={cellStyle} className="px-4 py-3 text-right font-mono border-r border-b border-slate-200/50 text-base text-slate-700">
            ${(product.retailPrice || 0).toFixed(2)}
          </td>
        );

      case 'margin':
        return (
          <td key={column.id} style={cellStyle} className="px-4 py-3 text-right border-r border-b border-slate-200/50 text-base font-semibold text-slate-700">
            {((product.margin || 0) * 100).toFixed(0)}%
          </td>
        );

      case 'totalInventory':
        return (
          <td key={column.id} style={cellStyle} className="px-4 py-3 text-right font-bold border-r border-b border-slate-200/50 text-lg text-slate-800">
            {product.totalInventory}
          </td>
        );

      case 'totalSales':
        return (
          <td key={column.id} style={cellStyle} className={`px-4 py-3 text-right border-r border-b border-slate-200/50 font-bold text-lg ${getHeatMapColor(product.totalSales, maxTotalSales)}`}>
            {product.totalSales}
          </td>
        );

      case 'popularity':
        return (
          <td key={column.id} style={cellStyle} className={`px-4 py-3 text-center border-r border-b border-slate-200/50 ${getHeatMapColor(product.totalSales, maxTotalSales)}`}>
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
          <td key={column.id} style={cellStyle} className="px-4 py-3 text-center border-r border-b border-slate-200/50">
            <Badge className={
              product.weeksLeft < 2 ? 'bg-[#10b981] text-white' :
              product.weeksLeft < 3 ? 'bg-[#f59e0b] text-white' : 'bg-[#ef4444] text-white'
            }>
              {product.weeksLeft < 999 ? product.weeksLeft.toFixed(1) : '∞'}w
            </Badge>
          </td>
        );

      case 'daysSinceLastSale':
        return (
          <td key={column.id} style={cellStyle} className="px-4 py-3 text-right border-r border-b border-slate-200/50 text-base">
            {product.daysSinceLastSale !== null ? (
              <span className={product.daysSinceLastSale > 30 ? 'text-[#ef4444] font-bold' : 'text-slate-700'}>
                {product.daysSinceLastSale} {product.daysSinceLastSale === 1 ? 'day' : 'days'}
              </span>
            ) : (
              <span className="text-slate-400">Never</span>
            )}
          </td>
        );

      case 'trend':
        return (
          <td key={column.id} style={cellStyle} className="px-4 py-3 text-center border-r border-b border-slate-200/50">
            {product.sparklineData && product.sparklineData.length > 0 ? (
              <Sparkline data={product.sparklineData} width={60} height={20} />
            ) : isLoadingTrends ? (
              <Sparkline data={[]} width={60} height={20} isLoading={true} />
            ) : (
              <span className="text-slate-400 text-xs">-</span>
            )}
          </td>
        );

      case 'daysSinceLastPO':
        return (
          <td key={column.id} style={cellStyle} className="px-4 py-3 text-right border-r border-b border-slate-200/50 text-base">
            {product.daysSinceLastPO !== null && product.daysSinceLastPO !== undefined ? (
              <div className={product.daysSinceLastPO > 90 ? 'text-[#f59e0b] font-bold' : 'text-slate-700'}>
                <span>{product.daysSinceLastPO}d</span>
                {product.lastPOQty && <span className="text-xs text-slate-500 ml-1">({product.lastPOQty})</span>}
              </div>
            ) : (
              <span className="text-slate-400">-</span>
            )}
          </td>
        );

      case 'suggestedQty':
        return (
          <td key={column.id} style={cellStyle} className="px-4 py-3 text-right border-r border-b border-slate-200/50">
            {product.suggestedQty > 0 ? (
              <div>
                <div className="font-bold text-lg text-teal-700">{product.suggestedQty}</div>
                <div className="text-sm text-slate-500">
                  ({product.suggestedCases} cases)
                </div>
              </div>
            ) : (
              <span className="text-slate-400">-</span>
            )}
          </td>
        );

      case 'distributor':
        return (
          <td key={column.id} style={cellStyle} className="px-4 py-3 border-r border-b border-slate-200/50">
            <DistributorCell 
              brand={product.brand}
              distributors={product.distributors || []}
              allDistributors={column.allDistributors || []}
            />
          </td>
        );

      case 'classification':
        return (
          <td key={column.id} style={cellStyle} className="px-4 py-3 border-r border-b border-slate-200/50">
            <StrainTypeCell 
              product={product}
              classifications={column.classifications || []}
            />
          </td>
        );

      case 'category':
        return (
          <td key={column.id} style={cellStyle} className="px-4 py-3 border-r border-b border-slate-200/50">
            <CategoryCell 
              product={product}
              categoryDefinitions={column.categoryDefinitions || []}
              onCategoryChange={() => {}}
            />
          </td>
        );

      case 'subcategory':
        return (
          <td key={column.id} style={cellStyle} className="px-4 py-3 border-r border-b border-slate-200/50">
            <SubcategoryCell 
              product={product}
              categoryDefinitions={column.categoryDefinitions || []}
            />
          </td>
        );

      case 'actions':
        return (
          <td key={column.id} style={cellStyle} className="px-4 py-3 text-center border-r border-b border-slate-200/50">
            {product.suggestedQty > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAddToOrder(product)}
                className="bg-gradient-to-r from-teal-50 to-blue-50 hover:from-teal-100 hover:to-blue-100 text-teal-700 border-teal-300/50 font-semibold rounded-lg transition-all duration-200 shadow-sm"
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

  const isEven = rowIndex % 2 === 0;

  return (
    <tr
      className={`transition-all duration-200 ${
        hasDoNotReorderAction
          ? 'bg-red-50 hover:bg-red-100 border-red-200'
          : isEven
            ? 'bg-white hover:bg-gradient-to-r hover:from-teal-50/30 hover:to-blue-50/30'
            : 'bg-slate-50/30 hover:bg-gradient-to-r hover:from-teal-50/50 hover:to-blue-50/50'
      } border-b border-slate-200/50`}
    >
      {orderedColumns.map(column => renderCell(column))}
    </tr>
  );
};

export default ProductTableRow;
