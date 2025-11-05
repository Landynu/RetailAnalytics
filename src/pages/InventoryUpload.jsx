import React, { useState, useRef } from 'react';
import { useAction } from 'wasp/client/operations';
import { uploadInventory, uploadInventoryExport, uploadInventoryLogs, uploadProductCatalog, analyzeInventoryExport } from 'wasp/client/operations';
import { useParams, Link } from 'react-router-dom';
import { StoreNav } from '../components/StoreNav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Separator } from '../components/ui/separator';
import { Upload, FileText, CheckCircle, AlertCircle, Database, TrendingUp, Store, File } from 'lucide-react';
import CSVUploadConfirmation from '../components/CSVUploadConfirmation';
import UploadProgressModal from '../components/UploadProgressModal';

const InventoryUploadPage = () => {
  const { storeId } = useParams();
  const uploadInventoryFn = useAction(uploadInventory);
  const uploadInventoryExportFn = useAction(uploadInventoryExport);
  const uploadInventoryLogsFn = useAction(uploadInventoryLogs);
  const uploadProductCatalogFn = useAction(uploadProductCatalog);
  const analyzeInventoryExportFn = useAction(analyzeInventoryExport);
  
  // State for both upload types
  const [exportData, setExportData] = useState('');
  const [logsData, setLogsData] = useState('');
  const [catalogData, setCatalogData] = useState('');
  const [legacyData, setLegacyData] = useState('');
  
  // File upload states
  const [exportFile, setExportFile] = useState(null);
  const [logsFile, setLogsFile] = useState(null);
  const [catalogFile, setCatalogFile] = useState(null);
  const [legacyFile, setLegacyFile] = useState(null);
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('export'); // export, logs, catalog, legacy
  
  // Confirmation dialog state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmData, setConfirmData] = useState(null);
  const [pendingUpload, setPendingUpload] = useState(null);
  
  // Progress modal state
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [uploadType, setUploadType] = useState('');
  const [currentFileSize, setCurrentFileSize] = useState(0);
  
  // File input refs
  const exportFileRef = useRef(null);
  const logsFileRef = useRef(null);
  const catalogFileRef = useRef(null);
  const legacyFileRef = useRef(null);

  // File handling functions
  const handleFileSelect = (file, setFile, setData) => {
    if (!file) return;
    
    // Validate file type
    if (file.type !== 'text/csv' && !file.name.toLowerCase().endsWith('.csv')) {
      setError('Please select a valid CSV file');
      return;
    }
    
    // Log file size for monitoring (no limit enforcement)
    console.log(`Selected file: ${file.name}, Size: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
    
    setFile(file);
    
    // For large files (>5MB), don't load full content into textarea
    const maxPreviewSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxPreviewSize) {
      // Just show file info, don't load content
      setData(`[Large file: ${file.name} - ${(file.size / 1024 / 1024).toFixed(2)}MB - Content not displayed for performance]`);
      setError(''); // Clear any previous errors
    } else {
      // Load content for smaller files
      const reader = new FileReader();
      reader.onload = (e) => {
        setData(e.target.result);
        setError(''); // Clear any previous errors
      };
      reader.onerror = () => {
        setError('Error reading file. Please try again.');
      };
      reader.readAsText(file);
    }
  };

  const handleExportFileSelect = (e) => {
    const file = e.target.files[0];
    handleFileSelect(file, setExportFile, setExportData);
  };

  const handleLogsFileSelect = (e) => {
    const file = e.target.files[0];
    handleFileSelect(file, setLogsFile, setLogsData);
  };

  const handleCatalogFileSelect = (e) => {
    const file = e.target.files[0];
    handleFileSelect(file, setCatalogFile, setCatalogData);
  };

  const handleLegacyFileSelect = (e) => {
    const file = e.target.files[0];
    handleFileSelect(file, setLegacyFile, setLegacyData);
  };

  // Process large files by reading them in chunks
  const processLargeFile = async (file, setData) => {
    const maxPreviewSize = 5 * 1024 * 1024; // 5MB
    if (file.size <= maxPreviewSize) {
      return; // Use normal processing for small files
    }

    // For large files, read just the first few lines as preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      const lines = content.split('\n');
      const previewLines = lines.slice(0, 10); // First 10 lines
      const preview = previewLines.join('\n');
      setData(`[Preview of ${file.name} - ${(file.size / 1024 / 1024).toFixed(2)}MB]\n\n${preview}\n\n... [${lines.length - 10} more lines not shown]`);
    };
    
    // Read only first 1MB for preview
    const blob = file.slice(0, 1024 * 1024);
    reader.readAsText(blob);
  };

  const handleExportUpload = async () => {
    if (!exportData.trim() && !exportFile) {
      setError('Please select a CSV file or paste CSV data');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      let csvData = exportData;
      
      // If we have a file but no data (large file), read the full file
      if (exportFile && !exportData.trim()) {
        csvData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsText(exportFile);
        });
      }

      // Phase 1: Analyze the CSV to show what will happen
      const analysis = await analyzeInventoryExportFn({ csvData, autoCreateStores: true });
      
      // Show confirmation dialog
      setConfirmData(analysis);
      setPendingUpload({ csvData, autoCreateStores: true });
      setShowConfirmDialog(true);
      
    } catch (err) {
      if (err.message.includes('413') || err.message.includes('Request failed with status code 413')) {
        setError('File is too large for the server to process. The server has been configured to handle larger files, but you may need to restart the development server for changes to take effect.');
      } else if (err.message.includes('timeout') || err.message.includes('Processing timeout')) {
        setError('Processing timeout: The file is too large or complex. Please try splitting your CSV into smaller files (max 50,000 rows).');
      } else if (err.message.includes('File too large') || err.message.includes('More than')) {
        setError(err.message + ' Use the CSV splitter utility to break large files into smaller chunks.');
      } else {
        setError('Error analyzing inventory export: ' + err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmUpload = async () => {
    if (!pendingUpload) return;

    setIsLoading(true);
    setShowConfirmDialog(false);
    setShowProgressModal(true);
    setUploadType('export');
    setCurrentFileSize(exportFile ? exportFile.size / 1024 / 1024 : 0);
    setError('');
    setSuccess('');

    try {
      const result = await uploadInventoryExportFn(pendingUpload);
      setSuccess(`Export processed successfully! ${result.newProducts} new products, ${result.updatedProducts} updated products, ${result.unchangedProducts} unchanged products. ${result.storesCreated} stores created/updated across ${result.locations.length} locations.`);
      setExportData('');
      setExportFile(null);
      if (exportFileRef.current) exportFileRef.current.value = '';
      setConfirmData(null);
      setPendingUpload(null);
    } catch (err) {
      setError('Error uploading inventory export: ' + err.message);
    } finally {
      setIsLoading(false);
      setShowProgressModal(false);
    }
  };

  const handleCancelUpload = () => {
    setShowConfirmDialog(false);
    setConfirmData(null);
    setPendingUpload(null);
  };

  const handleLogsUpload = async () => {
    if (!logsData.trim() && !logsFile) {
      setError('Please select a CSV file or paste CSV data');
      return;
    }

    setIsLoading(true);
    setShowProgressModal(true);
    setUploadType('logs');
    setCurrentFileSize(logsFile ? logsFile.size / 1024 / 1024 : 0);
    setError('');
    setSuccess('');

    try {
      let csvData = logsData;
      
      // If we have a file but no data (large file), read the full file
      if (logsFile && !logsData.trim()) {
        csvData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsText(logsFile);
        });
      }

      const result = await uploadInventoryLogsFn({ csvData });
      
      const successMsg = `Logs processed successfully! ${result.movementsProcessed} movements processed from ${result.totalMovements} total records.`;
      const detailsMsg = result.skippedRows > 0 
        ? ` ${result.skippedRows} rows skipped (products not found in catalog - upload inventory export first).`
        : '';
      
      setSuccess(successMsg + detailsMsg);
      setLogsData('');
      setLogsFile(null);
      if (logsFileRef.current) logsFileRef.current.value = '';
    } catch (err) {
      if (err.message.includes('413') || err.message.includes('Request failed with status code 413')) {
        setError('File is too large for the server to process. The server has been configured to handle larger files, but you may need to restart the development server for changes to take effect.');
      } else if (err.message.includes('timeout') || err.message.includes('Processing timeout')) {
        setError('Processing timeout: The file is too large or complex. Please try splitting your CSV into smaller files (max 50,000 rows).');
      } else if (err.message.includes('File too large') || err.message.includes('More than')) {
        setError(err.message + ' Use the CSV splitter utility to break large files into smaller chunks.');
      } else {
        setError('Error uploading inventory logs: ' + err.message);
      }
    } finally {
      setIsLoading(false);
      setShowProgressModal(false);
    }
  };

  const handleCatalogUpload = async () => {
    if (!catalogData.trim() && !catalogFile) {
      setError('Please select a CSV file or paste CSV data');
      return;
    }

    setIsLoading(true);
    setShowProgressModal(true);
    setUploadType('export');
    setCurrentFileSize(catalogFile ? catalogFile.size / 1024 / 1024 : 0);
    setError('');
    setSuccess('');

    try {
      let csvData = catalogData;
      
      // If we have a file but no data (large file), read the full file
      if (catalogFile && !catalogData.trim()) {
        csvData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsText(catalogFile);
        });
      }

      const result = await uploadProductCatalogFn({ csvData });
      
      setSuccess(`Product catalog processed successfully! ${result.newProducts} products created, ${result.updatedProducts} products updated.`);
      setCatalogData('');
      setCatalogFile(null);
      if (catalogFileRef.current) catalogFileRef.current.value = '';
    } catch (err) {
      if (err.message.includes('413') || err.message.includes('Request failed with status code 413')) {
        setError('File is too large for the server to process. The server has been configured to handle larger files, but you may need to restart the development server for changes to take effect.');
      } else if (err.message.includes('timeout') || err.message.includes('Processing timeout')) {
        setError('Processing timeout: The file is too large or complex. Please try splitting your CSV into smaller files (max 50,000 rows).');
      } else if (err.message.includes('File too large') || err.message.includes('More than')) {
        setError(err.message + ' Use the CSV splitter utility to break large files into smaller chunks.');
      } else {
        setError('Error uploading product catalog: ' + err.message);
      }
    } finally {
      setIsLoading(false);
      setShowProgressModal(false);
    }
  };

  const handleLegacyUpload = async () => {
    if (!legacyData.trim() && !legacyFile) {
      setError('Please select a CSV file or paste CSV data');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      let csvData = legacyData;
      
      // If we have a file but no data (large file), read the full file
      if (legacyFile && !legacyData.trim()) {
        csvData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsText(legacyFile);
        });
      }

      await uploadInventoryFn({ storeId, csvData });
      setSuccess('Legacy inventory uploaded successfully!');
      setLegacyData('');
      setLegacyFile(null);
      if (legacyFileRef.current) legacyFileRef.current.value = '';
    } catch (err) {
      if (err.message.includes('413') || err.message.includes('Request failed with status code 413')) {
        setError('File is too large for the server to process. The server has been configured to handle larger files, but you may need to restart the development server for changes to take effect.');
      } else if (err.message.includes('timeout') || err.message.includes('Processing timeout')) {
        setError('Processing timeout: The file is too large or complex. Please try splitting your CSV into smaller files (max 50,000 rows).');
      } else if (err.message.includes('File too large') || err.message.includes('More than')) {
        setError(err.message + ' Use the CSV splitter utility to break large files into smaller chunks.');
      } else {
        setError('Error uploading legacy inventory: ' + err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <StoreNav currentPage="upload" />
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Upload className="h-5 w-5 mr-2" />
            Upload Inventory Data
          </CardTitle>
          <CardDescription>
            Upload your inventory data using the new PRD system or legacy format. Choose the appropriate upload type for your data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Tab Navigation */}
          <div className="flex space-x-1 border-b border-border">
            <Button
              variant={activeTab === 'export' ? 'default' : 'ghost'}
              size="default"
              onClick={() => setActiveTab('export')}
              className={`flex items-center rounded-b-none ${
                activeTab === 'export' 
                  ? 'bg-primary text-primary-foreground shadow-sm border-b-2 border-b-primary' 
                  : 'hover:bg-muted/50'
              }`}
            >
              <Database className="h-4 w-4 mr-2" />
              Inventory Export
            </Button>
            <Button
              variant={activeTab === 'logs' ? 'default' : 'ghost'}
              size="default"
              onClick={() => setActiveTab('logs')}
              className={`flex items-center rounded-b-none ${
                activeTab === 'logs' 
                  ? 'bg-primary text-primary-foreground shadow-sm border-b-2 border-b-primary' 
                  : 'hover:bg-muted/50'
              }`}
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Inventory Logs
            </Button>
            <Button
              variant={activeTab === 'catalog' ? 'default' : 'ghost'}
              size="default"
              onClick={() => setActiveTab('catalog')}
              className={`flex items-center rounded-b-none ${
                activeTab === 'catalog' 
                  ? 'bg-primary text-primary-foreground shadow-sm border-b-2 border-b-primary' 
                  : 'hover:bg-muted/50'
              }`}
            >
              <Store className="h-4 w-4 mr-2" />
              Product Catalog
            </Button>
            <Button
              variant={activeTab === 'legacy' ? 'default' : 'ghost'}
              size="default"
              onClick={() => setActiveTab('legacy')}
              className={`flex items-center rounded-b-none ${
                activeTab === 'legacy' 
                  ? 'bg-primary text-primary-foreground shadow-sm border-b-2 border-b-primary' 
                  : 'hover:bg-muted/50'
              }`}
            >
              <FileText className="h-4 w-4 mr-2" />
              Legacy Format
            </Button>
          </div>

          {/* Export Tab */}
          {activeTab === 'export' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Inventory Export Upload</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload your inventory-export.csv file with product catalog and stock levels across locations.
                </p>
                
                {/* File Upload Section */}
                <div className="mb-4">
                  <label className="text-sm font-medium mb-2 block">
                    Upload CSV File
                  </label>
                  <div className="flex items-center space-x-4">
                    <input
                      ref={exportFileRef}
                      type="file"
                      accept=".csv"
                      onChange={handleExportFileSelect}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => exportFileRef.current?.click()}
                      className="flex items-center"
                    >
                      <File className="h-4 w-4 mr-2" />
                      Choose CSV File
                    </Button>
                    {exportFile && (
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4 text-green-600" />
                        <div className="flex flex-col">
                          <span className="text-sm text-green-600">{exportFile.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {(exportFile.size / 1024 / 1024).toFixed(2)} MB
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setExportFile(null);
                            setExportData('');
                            if (exportFileRef.current) exportFileRef.current.value = '';
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or</span>
                  </div>
                </div>

                <label className="text-sm font-medium mb-2 block">
                  CSV Data Preview
                </label>
                <textarea
                  className="w-full h-32 p-3 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  placeholder="CSV data will appear here (preview only for large files)..."
                  value={exportData}
                  onChange={(e) => setExportData(e.target.value)}
                  readOnly={exportFile && exportFile.size > 5 * 1024 * 1024}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Expected columns: Product Name, Barcode, Category, Brand, Retail price, Wholesale cost, and location columns
                </p>
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-xs text-blue-800">
                    <strong>Large File Support:</strong> Files up to 50,000 rows are supported. Larger files will timeout after 5 minutes. Use the CSV splitter for very large files.
                  </p>
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <Button 
                  onClick={handleExportUpload} 
                  disabled={isLoading || (!exportData.trim() && !exportFile)}
                  size="lg"
                  className="flex items-center bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 py-6 text-base shadow-lg"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin h-5 w-5 mr-2 border-2 border-current border-t-transparent rounded-full" />
                      Processing Export...
                    </>
                  ) : (
                    <>
                      <Database className="h-5 w-5 mr-2" />
                      Process Inventory Export
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Logs Tab */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Inventory Logs Upload</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload your inventory-logs.csv file with transaction history and movement data.
                </p>
                
                {/* File Upload Section */}
                <div className="mb-4">
                  <label className="text-sm font-medium mb-2 block">
                    Upload CSV File
                  </label>
                  <div className="flex items-center space-x-4">
                    <input
                      ref={logsFileRef}
                      type="file"
                      accept=".csv"
                      onChange={handleLogsFileSelect}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => logsFileRef.current?.click()}
                      className="flex items-center"
                    >
                      <File className="h-4 w-4 mr-2" />
                      Choose CSV File
                    </Button>
                    {logsFile && (
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-green-600">{logsFile.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setLogsFile(null);
                            setLogsData('');
                            if (logsFileRef.current) logsFileRef.current.value = '';
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or</span>
                  </div>
                </div>

                <label className="text-sm font-medium mb-2 block">
                  CSV Data Preview
                </label>
                <textarea
                  className="w-full h-32 p-3 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  placeholder="CSV data will appear here (preview only for large files)..."
                  value={logsData}
                  onChange={(e) => setLogsData(e.target.value)}
                  readOnly={logsFile && logsFile.size > 5 * 1024 * 1024}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Expected columns: Date, Type, SKU, Barcode, Product, Employee, Location, Opening, Change, Closing, Notes
                </p>
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-xs text-blue-800">
                    <strong>Large File Support:</strong> Files up to 50,000 rows are supported. Larger files will timeout after 5 minutes. Use the CSV splitter for very large files.
                  </p>
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <Button 
                  onClick={handleLogsUpload} 
                  disabled={isLoading || (!logsData.trim() && !logsFile)}
                  size="lg"
                  className="flex items-center bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 py-6 text-base shadow-lg"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin h-5 w-5 mr-2 border-2 border-current border-t-transparent rounded-full" />
                      Processing Logs...
                    </>
                  ) : (
                    <>
                      <TrendingUp className="h-5 w-5 mr-2" />
                      Process Inventory Logs
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Catalog Tab */}
          {activeTab === 'catalog' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Product Catalog Upload</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload your product-catalog.csv file to bulk update product details like categories, prices, and margins.
                </p>
                
                {/* File Upload Section */}
                <div className="mb-4">
                  <label className="text-sm font-medium mb-2 block">
                    Upload CSV File
                  </label>
                  <div className="flex items-center space-x-4">
                    <input
                      ref={catalogFileRef}
                      type="file"
                      accept=".csv"
                      onChange={handleCatalogFileSelect}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => catalogFileRef.current?.click()}
                      className="flex items-center"
                    >
                      <File className="h-4 w-4 mr-2" />
                      Choose CSV File
                    </Button>
                    {catalogFile && (
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4 text-green-600" />
                        <div className="flex flex-col">
                          <span className="text-sm text-green-600">{catalogFile.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {(catalogFile.size / 1024 / 1024).toFixed(2)} MB
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setCatalogFile(null);
                            setCatalogData('');
                            if (catalogFileRef.current) catalogFileRef.current.value = '';
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or</span>
                  </div>
                </div>

                <label className="text-sm font-medium mb-2 block">
                  CSV Data Preview
                </label>
                <textarea
                  className="w-full h-32 p-3 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  placeholder="CSV data will appear here (preview only for large files)..."
                  value={catalogData}
                  onChange={(e) => setCatalogData(e.target.value)}
                  readOnly={catalogFile && catalogFile.size > 5 * 1024 * 1024}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Expected columns: Product Name, Barcode, Category, Brand, Retail price, Wholesale cost, Description (optional), Image URL (optional)
                </p>
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-xs text-blue-800">
                    <strong>Bulk Product Updates:</strong> This upload updates existing products by GTIN/barcode. Products not in the database will be created. Categories are automatically split (e.g., "Edibles - Chocolate").
                  </p>
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <Button 
                  onClick={handleCatalogUpload} 
                  disabled={isLoading || (!catalogData.trim() && !catalogFile)}
                  size="lg"
                  className="flex items-center bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 py-6 text-base shadow-lg"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin h-5 w-5 mr-2 border-2 border-current border-t-transparent rounded-full" />
                      Processing Catalog...
                    </>
                  ) : (
                    <>
                      <Store className="h-5 w-5 mr-2" />
                      Process Product Catalog
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Legacy Tab */}
          {activeTab === 'legacy' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Legacy Format Upload</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload CSV data using the legacy format for backward compatibility.
                </p>
                
                {/* File Upload Section */}
                <div className="mb-4">
                  <label className="text-sm font-medium mb-2 block">
                    Upload CSV File
                  </label>
                  <div className="flex items-center space-x-4">
                    <input
                      ref={legacyFileRef}
                      type="file"
                      accept=".csv"
                      onChange={handleLegacyFileSelect}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => legacyFileRef.current?.click()}
                      className="flex items-center"
                    >
                      <File className="h-4 w-4 mr-2" />
                      Choose CSV File
                    </Button>
                    {legacyFile && (
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-green-600">{legacyFile.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setLegacyFile(null);
                            setLegacyData('');
                            if (legacyFileRef.current) legacyFileRef.current.value = '';
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or</span>
                  </div>
                </div>

                <label className="text-sm font-medium mb-2 block">
                  CSV Data Preview
                </label>
                <textarea
                  className="w-full h-32 p-3 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  placeholder="CSV data will appear here (preview only for large files)..."
                  value={legacyData}
                  onChange={(e) => setLegacyData(e.target.value)}
                  readOnly={legacyFile && legacyFile.size > 5 * 1024 * 1024}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Expected columns: name, gtin/barcode, price
                </p>
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-xs text-blue-800">
                    <strong>Large File Support:</strong> Files up to 50,000 rows are supported. Larger files will timeout after 5 minutes. Use the CSV splitter for very large files.
                  </p>
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <Button 
                  onClick={handleLegacyUpload} 
                  disabled={isLoading || (!legacyData.trim() && !legacyFile)}
                  size="lg"
                  className="flex items-center bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 py-6 text-base shadow-lg"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin h-5 w-5 mr-2 border-2 border-current border-t-transparent rounded-full" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <FileText className="h-5 w-5 mr-2" />
                      Upload Legacy Inventory
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center space-x-4 pt-4">
            <Link to={`/store/${storeId}/trends`}>
              <Button variant="outline">
                <FileText className="h-4 w-4 mr-2" />
                View Sales Trends
              </Button>
            </Link>
            <Link to={`/store/${storeId}/menu`}>
              <Button variant="outline">
                <Store className="h-4 w-4 mr-2" />
                View Smart Menu
              </Button>
            </Link>
          </div>

          {/* Status Messages */}
          {error && (
            <div className="flex items-center space-x-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm text-destructive">{error}</span>
            </div>
          )}
          
          {success && (
            <div className="flex items-center space-x-2 p-3 bg-green-50 border border-green-200 rounded-md">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-600">{success}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <CSVUploadConfirmation
        isOpen={showConfirmDialog}
        onClose={handleCancelUpload}
        onConfirm={handleConfirmUpload}
        confirmData={confirmData}
        isLoading={isLoading}
      />

      {/* Progress Modal */}
      <UploadProgressModal
        isOpen={showProgressModal}
        onClose={() => setShowProgressModal(false)}
        uploadType={uploadType}
        fileSize={currentFileSize}
      />
    </div>
  );
};

export default InventoryUploadPage;
