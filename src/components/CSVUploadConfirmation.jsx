import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Badge } from './ui/badge';
import { Database, Plus, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';

const CSVUploadConfirmation = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  confirmData, 
  isLoading 
}) => {
  if (!confirmData) return null;

  const { newProducts, updatedProducts, unchangedProducts, totalProcessed, storesCreated } = confirmData;

  const hasNewProducts = newProducts > 0;
  const hasUpdatedProducts = updatedProducts > 0;
  const hasUnchangedProducts = unchangedProducts > 0;
  const isFilteredReport = unchangedProducts === 0 && totalProcessed > 0;

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Confirm CSV Upload
          </AlertDialogTitle>
          <AlertDialogDescription>
            Review the changes that will be made to your inventory data.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {hasNewProducts && (
              <div className="flex items-center space-x-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex-shrink-0">
                  <Plus className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-green-800">New Products</p>
                  <p className="text-2xl font-bold text-green-900">{newProducts}</p>
                </div>
              </div>
            )}

            {hasUpdatedProducts && (
              <div className="flex items-center space-x-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex-shrink-0">
                  <RefreshCw className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-blue-800">Updated Products</p>
                  <p className="text-2xl font-bold text-blue-900">{updatedProducts}</p>
                </div>
              </div>
            )}

            {hasUnchangedProducts && (
              <div className="flex items-center space-x-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="flex-shrink-0">
                  <CheckCircle className="h-5 w-5 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">Unchanged Products</p>
                  <p className="text-2xl font-bold text-gray-900">{unchangedProducts}</p>
                </div>
              </div>
            )}
          </div>

          {/* Total Summary */}
          <div className="p-4 bg-muted rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total Products Processed:</span>
              <Badge variant="outline" className="text-lg px-3 py-1">
                {totalProcessed}
              </Badge>
            </div>
            {storesCreated > 0 && (
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm font-medium">Stores Created:</span>
                <Badge variant="secondary" className="px-3 py-1">
                  {storesCreated}
                </Badge>
              </div>
            )}
          </div>

          {/* Warning for filtered reports */}
          {isFilteredReport && (
            <div className="flex items-start space-x-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-800">Filtered Report Detected</p>
                <p className="text-sm text-yellow-700 mt-1">
                  This appears to be a filtered export. All existing products will be updated, 
                  but products not in this CSV will remain unchanged. This is normal for 
                  location-specific or category-filtered exports.
                </p>
              </div>
            </div>
          )}

          {/* What will happen */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">What will happen:</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              {hasNewProducts && (
                <li>• {newProducts} new products will be added to your catalog</li>
              )}
              {hasUpdatedProducts && (
                <li>• {updatedProducts} existing products will be updated with new information</li>
              )}
              {hasUnchangedProducts && (
                <li>• {unchangedProducts} products will have their stock levels updated only</li>
              )}
              <li>• Stock levels will be updated for all products at their respective locations</li>
              <li>• Product timestamps will be updated to reflect this import</li>
            </ul>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-primary hover:bg-primary/90"
          >
            {isLoading ? (
              <>
                <div className="animate-spin h-4 w-4 mr-2 border-2 border-current border-t-transparent rounded-full" />
                Processing...
              </>
            ) : (
              'Confirm Upload'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default CSVUploadConfirmation;
