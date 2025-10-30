import React, { useState } from 'react';
import { useAction } from 'wasp/client/operations';
import { exportAnalyticsData } from 'wasp/client/operations';
import { Button } from './ui/button';
import { Download, Loader2, FileDown } from 'lucide-react';

const ExportButton = ({ storeIds, filters, variant = 'outline', size = 'default' }) => {
  const [isExporting, setIsExporting] = useState(false);
  const exportAnalyticsDataFn = useAction(exportAnalyticsData);

  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      const result = await exportAnalyticsDataFn({ storeIds, filters });
      
      // Create blob and download
      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', result.filename);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed: ' + error.message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button 
      variant={variant} 
      size={size}
      onClick={handleExport}
      disabled={isExporting}
    >
      {isExporting ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Exporting...
        </>
      ) : (
        <>
          <FileDown className="h-4 w-4 mr-2" />
          Export CSV
        </>
      )}
    </Button>
  );
};

export default ExportButton;
