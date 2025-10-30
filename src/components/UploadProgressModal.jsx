import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { CheckCircle, Loader2, Clock } from 'lucide-react';

const UploadProgressModal = ({ isOpen, uploadType, fileSize, estimatedSteps }) => {
  // Calculate estimated time based on file size and steps
  const estimateTime = (sizeInMB) => {
    if (sizeInMB < 1) return '10-20 seconds';
    if (sizeInMB < 5) return '30-60 seconds';
    return '1-3 minutes';
  };

  const getSteps = (type) => {
    if (type === 'export') {
      return [
        { label: 'Parsing CSV file', detail: 'Reading and validating CSV structure' },
        { label: 'Detecting locations', detail: 'Identifying store location columns' },
        { label: 'Extracting product data', detail: 'Parsing product names, categories, prices' },
        { label: 'Splitting categories', detail: 'Parent category ↔ Subcategory' },
        { label: 'Extracting formats', detail: 'Detecting product formats (1g, 100mg, etc.)' },
        { label: 'Calculating margins', detail: '(Retail - Wholesale) / Retail' },
        { label: 'Handling duplicates', detail: 'Keeping most recent products by date' },
        { label: 'Normalizing locations', detail: 'Mapping report names to stores' },
        { label: 'Creating/updating stores', detail: 'Setting up store records' },
        { label: 'Creating inventory snapshot', detail: 'Audit trail for this upload' },
        { label: 'Fetching existing products', detail: 'Checking for GTIN matches' },
        { label: 'Inserting new products', detail: `Batches of 100 products` },
        { label: 'Updating existing products', detail: `Batches of 50 products` },
        { label: 'Updating stock levels', detail: `Batches of 10 locations (may take longest)` },
        { label: 'Finalizing upload', detail: 'Preparing results summary' }
      ];
    } else if (type === 'logs') {
      return [
        { label: 'Parsing CSV file', detail: 'Reading movement logs' },
        { label: 'Extracting brands', detail: 'From product names (text in parentheses)' },
        { label: 'Normalizing locations', detail: 'Matching to store names' },
        { label: 'Validating dates', detail: 'Checking date formats' },
        { label: 'Calculating units sold', detail: 'Absolute value of changes' },
        { label: 'Creating snapshot', detail: 'Audit trail for this upload' },
        { label: 'Matching products by GTIN', detail: 'Industry standard matching' },
        { label: 'Creating movement records', detail: 'Transaction history' },
        { label: 'Updating stock levels', detail: 'From closing quantities' },
        { label: 'Generating error report', detail: 'Skipped rows and reasons' }
      ];
    }
    return [];
  };

  const steps = getSteps(uploadType);
  const estimatedTime = estimateTime(fileSize);

  return (
    <Dialog open={isOpen}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Loader2 className="h-5 w-5 mr-2 animate-spin text-primary" />
            Processing Upload
          </DialogTitle>
          <DialogDescription>
            Please wait while we process your file. This may take a moment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Info */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Estimated time:</span>
            </div>
            <span className="text-sm text-muted-foreground">{estimatedTime}</span>
          </div>

          {/* Progress Steps */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            <h4 className="text-sm font-semibold mb-3">Processing Steps:</h4>
            {steps.map((step, index) => (
              <div 
                key={index} 
                className="flex items-start space-x-3 p-3 bg-secondary/30 rounded-lg animate-pulse"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="flex-shrink-0 mt-0.5">
                  <div className="h-5 w-5 rounded-full border-2 border-primary flex items-center justify-center">
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{step.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Info */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-xs text-blue-800">
              <strong>Large files may take several minutes.</strong> The system is processing your data in optimized batches to ensure reliability. Do not close this window.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UploadProgressModal;
