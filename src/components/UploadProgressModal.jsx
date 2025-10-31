import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Loader2, Clock, Terminal, Database } from 'lucide-react';

const UploadProgressModal = ({ isOpen, uploadType, fileSize }) => {
  // Calculate estimated time based on file size
  const estimateTime = (sizeInMB) => {
    if (sizeInMB < 1) return '10-30 seconds';
    if (sizeInMB < 5) return '30-90 seconds';
    if (sizeInMB < 10) return '1-3 minutes';
    return '3-5 minutes';
  };

  const getTypeLabel = (type) => {
    const labels = {
      'export': 'Inventory Export',
      'logs': 'Inventory Logs',
      'catalog': 'Product Catalog'
    };
    return labels[type] || 'Data';
  };

  const estimatedTime = estimateTime(fileSize);
  const typeLabel = getTypeLabel(uploadType);

  return (
    <Dialog open={isOpen}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center text-xl">
            <Loader2 className="h-6 w-6 mr-3 animate-spin text-primary" />
            Processing {typeLabel}
          </DialogTitle>
          <DialogDescription>
            Your data is being processed on the server. You can close this window - processing will continue in the background.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* File Info Card */}
          <div className="p-4 bg-secondary/50 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">File Size:</span>
              </div>
              <span className="text-sm text-foreground font-mono">{fileSize.toFixed(2)} MB</span>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Estimated Time:</span>
              </div>
              <span className="text-sm text-muted-foreground">{estimatedTime}</span>
            </div>
          </div>

          {/* Processing Animation */}
          <div className="flex flex-col items-center justify-center py-8">
            <div className="relative">
              <div className="h-20 w-20 rounded-full border-4 border-primary/20"></div>
              <div className="absolute inset-0 h-20 w-20 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Database className="h-8 w-8 text-primary animate-pulse" />
              </div>
            </div>
            <p className="text-sm font-medium mt-4 text-foreground">Processing your data...</p>
            <p className="text-xs text-muted-foreground mt-1">Optimized batching for PostgreSQL</p>
          </div>

          {/* Terminal Log Info */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start space-x-3">
              <Terminal className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900 mb-1">
                  Real-time Progress Available
                </p>
                <p className="text-xs text-blue-700 leading-relaxed">
                  Check your <strong>terminal/console</strong> for detailed progress logs including:
                </p>
                <ul className="text-xs text-blue-700 mt-2 ml-4 space-y-1 list-disc">
                  <li>Row counts and percentages</li>
                  <li>Batch processing status</li>
                  <li>Skipped rows and reasons</li>
                  <li>Final summary statistics</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Patient Message */}
          <div className="text-center space-y-2">
            <p className="text-xs text-muted-foreground">
              Processing continues on the server even if you close this window.
            </p>
            <p className="text-xs font-medium text-foreground">
              You'll see a success message when complete, or check the server console for real-time progress.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UploadProgressModal;
