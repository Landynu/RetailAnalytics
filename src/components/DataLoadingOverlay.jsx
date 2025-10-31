import React from 'react';
import { Loader2 } from 'lucide-react';

const DataLoadingOverlay = ({ isLoading, message = 'Loading data...', productCount = null }) => {
  if (!isLoading) return null;

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
            {productCount !== null && (
              <p className="text-sm text-muted-foreground">
                Processing {productCount} products...
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Please wait, this may take a moment
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataLoadingOverlay;
