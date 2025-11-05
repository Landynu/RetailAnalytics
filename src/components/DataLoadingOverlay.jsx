import React from 'react';
import { Loader2 } from 'lucide-react';

const DataLoadingOverlay = ({ 
  isLoading, 
  message = 'Loading data...', 
  productCount = null,
  totalCount = null,
  loadingType = 'initial' // 'initial' | 'refetch' | 'background'
}) => {
  if (!isLoading) return null;

  const getProgressText = () => {
    if (totalCount && productCount !== null) {
      const percentage = Math.min(100, Math.round((productCount / totalCount) * 100));
      return `${productCount} of ${totalCount} products (${percentage}%)`;
    }
    if (productCount !== null) {
      return `Processing ${productCount} products...`;
    }
    return null;
  };

  const getSubMessage = () => {
    switch (loadingType) {
      case 'initial':
        return 'Please wait, this may take a moment';
      case 'refetch':
        return 'Updating data with new filters...';
      case 'background':
        return 'Loading complete analytics in the background...';
      default:
        return 'Please wait, this may take a moment';
    }
  };

  return (
    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-20">
      <div className="bg-card border rounded-lg shadow-lg p-6 max-w-sm mx-4">
        <div className="flex flex-col items-center space-y-4">
          <div className="relative">
            <div className="h-16 w-16 rounded-full border-4 border-primary/20"></div>
            <div className="absolute inset-0 h-16 w-16 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-primary animate-pulse" />
            </div>
          </div>
          
          <div className="text-center space-y-2">
            <p className="text-lg font-semibold">{message}</p>
            {getProgressText() && (
              <p className="text-sm text-muted-foreground">
                {getProgressText()}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {getSubMessage()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataLoadingOverlay;
