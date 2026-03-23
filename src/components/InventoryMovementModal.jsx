import React, { useEffect, useState } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getProductInventoryMovements, getUserStores } from 'wasp/client/operations';
import { X, TrendingUp, TrendingDown, RefreshCw, Package, Calendar, User, MapPin, FileText, Hash, Filter } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

const InventoryMovementModal = ({ productId, productName, isOpen, onClose, dateRange = null, storeIds = null }) => {
  const [selectedStoreFilter, setSelectedStoreFilter] = useState(null);

  const { data: stores } = useQuery(getUserStores, undefined, { enabled: isOpen });

  const { data: movementData, isLoading, refetch } = useQuery(
    getProductInventoryMovements,
    { productId, dateRange, storeIds: selectedStoreFilter || storeIds },
    { enabled: isOpen && !!productId }
  );

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getTypeColor = (type) => {
    const typeColors = {
      'sale': 'bg-red-100 text-red-800 border-red-200',
      'purchase order': 'bg-green-100 text-green-800 border-green-200',
      'transfer in': 'bg-blue-100 text-blue-800 border-blue-200',
      'transfer out': 'bg-orange-100 text-orange-800 border-orange-200',
      'adjustment': 'bg-purple-100 text-purple-800 border-purple-200',
      'return': 'bg-teal-100 text-teal-800 border-teal-200',
      'damage': 'bg-gray-100 text-gray-800 border-gray-200',
    };
    return typeColors[type?.toLowerCase()] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getTypeIcon = (type) => {
    const typeIcons = {
      'sale': TrendingDown,
      'purchase order': TrendingUp,
      'transfer in': TrendingUp,
      'transfer out': TrendingDown,
      'adjustment': RefreshCw,
      'return': TrendingUp,
      'damage': TrendingDown,
    };
    const Icon = typeIcons[type?.toLowerCase()] || Package;
    return <Icon className="h-4 w-4" />;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    });
  };

  const formatChangeQty = (changeQty) => {
    if (changeQty > 0) {
      return <span className="text-green-700 font-semibold">+{changeQty}</span>;
    } else if (changeQty < 0) {
      return <span className="text-red-700 font-semibold">{changeQty}</span>;
    }
    return <span className="text-gray-500">0</span>;
  };

  return (
    <>
      {/* Backdrop - Higher z-index to cover filter bar */}
      <div
        className={`fixed inset-0 bg-black/20 backdrop-blur-[2px] transition-opacity duration-300 z-[60] ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Sidebar Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full md:w-[600px] lg:w-[800px] bg-white shadow-2xl transform transition-transform duration-300 ease-out z-[70] flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-600 via-blue-600 to-indigo-600 text-white p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Package className="h-6 w-6" />
              Inventory Movement History
            </h2>
            <p className="text-white/90 mt-1 text-sm">
              {movementData?.product?.name || productName}
            </p>
            {movementData?.product && (
              <div className="flex items-center gap-4 mt-2 text-xs text-white/80">
                <span>Brand: {movementData.product.brand || 'N/A'}</span>
                <span>•</span>
                <span>GTIN: {movementData.product.gtin || 'N/A'}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              className="text-white hover:bg-white/20"
              title="Refresh data"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-white hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Summary & Filters */}
        {movementData && (
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-6">
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Movement Rows</div>
                  <div className="text-2xl font-bold text-gray-900">{movementData.totalCount}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Sale Rows</div>
                  <div className="text-2xl font-bold text-gray-900">{movementData.saleTransactionCount || 0}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Sale Units</div>
                  <div className="text-2xl font-bold text-gray-900">{movementData.saleUnits || 0}</div>
                </div>
                {dateRange && (
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide">Date Range</div>
                    <div className="text-sm font-medium text-gray-700">
                      {new Date(dateRange.start).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' })} - {new Date(dateRange.end).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                )}
              </div>
              <div className="text-xs text-gray-500">
                Timezone: Central Time (UTC-6)
              </div>
            </div>

            {/* Location Filter */}
            {stores && stores.length > 1 && (
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <span className="text-xs text-gray-600 font-medium">Filter by Location:</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setSelectedStoreFilter(null)}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${
                      selectedStoreFilter === null
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    All Locations
                  </button>
                  {stores.filter(s => s.isActive).map(store => (
                    <button
                      key={store.id}
                      onClick={() => setSelectedStoreFilter([store.id])}
                      className={`px-3 py-1 text-xs rounded-md transition-colors ${
                        selectedStoreFilter?.[0] === store.id
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {store.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
                <p className="text-gray-600">Loading movement history...</p>
              </div>
            </div>
          ) : movementData?.movements?.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600 font-medium">No inventory movements found</p>
                <p className="text-sm text-gray-500 mt-1">
                  There are no recorded movements for this product in the selected time range.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {movementData?.movements?.map((movement, index) => (
                <div
                  key={movement.id}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: Type & Date */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={`${getTypeColor(movement.type)} border flex items-center gap-1.5 px-2.5 py-1`}>
                          {getTypeIcon(movement.type)}
                          <span className="font-semibold text-xs uppercase">{movement.type}</span>
                        </Badge>
                        <span className="text-xs text-gray-400">#{movement.id}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                        <div className="flex items-start gap-2">
                          <Calendar className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <div className="text-xs text-gray-500">Date & Time</div>
                            <div className="font-medium text-gray-900">{formatDate(movement.date)}</div>
                          </div>
                        </div>

                        {movement.employee && (
                          <div className="flex items-start gap-2">
                            <User className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                            <div>
                              <div className="text-xs text-gray-500">Employee</div>
                              <div className="font-medium text-gray-900">{movement.employee}</div>
                            </div>
                          </div>
                        )}

                        {movement.store && (
                          <div className="flex items-start gap-2">
                            <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                            <div>
                              <div className="text-xs text-gray-500">Location</div>
                              <div className="font-medium text-gray-900">{movement.store.name}</div>
                            </div>
                          </div>
                        )}

                        {movement.notes && (
                          <div className="flex items-start gap-2">
                            <FileText className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                            <div>
                              <div className="text-xs text-gray-500">Notes</div>
                              <div className="font-medium text-gray-900 text-xs break-words">{movement.notes}</div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Additional Metadata */}
                      {(movement.sku || movement.barcode) && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            {movement.sku && (
                              <div className="flex items-center gap-1">
                                <Hash className="h-3 w-3" />
                                <span>SKU: {movement.sku}</span>
                              </div>
                            )}
                            {movement.barcode && (
                              <div className="flex items-center gap-1">
                                <Hash className="h-3 w-3" />
                                <span>Barcode: {movement.barcode}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right: Quantity Changes */}
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 min-w-[200px]">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Opening:</span>
                          <span className="font-bold text-gray-900">{movement.openingQty}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm border-t border-gray-200 pt-2">
                          <span className="text-gray-600">Change:</span>
                          {formatChangeQty(movement.changeQty)}
                        </div>
                        <div className="flex items-center justify-between text-sm border-t border-gray-300 pt-2">
                          <span className="text-gray-700 font-semibold">Closing:</span>
                          <span className="font-bold text-lg text-gray-900">{movement.closingQty}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <div className="text-xs text-gray-500">
            Showing {movementData?.movements?.length || 0} of {movementData?.totalCount || 0} movements
            {movementData?.totalCount >= 1000 && (
              <span className="ml-2 text-amber-600">(Limited to last 1000 movements)</span>
            )}
          </div>
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </div>
    </>
  );
};

export default InventoryMovementModal;
