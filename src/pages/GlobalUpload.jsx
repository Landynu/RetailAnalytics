import React, { useState, useRef } from 'react';
import { useAction } from 'wasp/client/operations';
import { uploadInventoryExport, uploadInventoryLogs, uploadProductCatalog, analyzeInventoryExport } from 'wasp/client/operations';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Separator } from '../components/ui/separator';
import { Upload, FileText, CheckCircle, AlertCircle, Database, TrendingUp, Store, File, ArrowLeft } from 'lucide-react';
import CSVUploadConfirmation from '../components/CSVUploadConfirmation';
import UploadProgressModal from '../components/UploadProgressModal';

const GlobalUploadPage = () => {
  const uploadInventoryExportFn = useAction(uploadInventoryExport);
  const uploadInventoryLogsFn = useAction(uploadInventoryLogs);
  const uploadProductCatalogFn = useAction(uploadProductCatalog);
  const analyzeInventoryExportFn = useAction(analyzeInventoryExport);
  
  // State for all upload types
  const [exportData, setExportData] = useState('');
  const [logsData, setLogsData] = useState('');
  const [catalogData, setCatalogData] = useState('');
  
  // File upload states
  const [exportFile, setExportFile] = useState(null);
  const [logsFile, setLogsFile] = useState(null);
  const [catalogFile, setCatalogFile] = useState(null);
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('export'); // export, logs, catalog
  
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

  // File handling functions
  const handleFileSelect = (file, setFile, setData) => {
    if (!file) return;
    
    if (file.type !== 'text/csv' && !file.name.toLowerCase().endsWith('.csv')) {
      setError('Please select a valid CSV file');
      return;
    }
    
    console.log(`Selected file: ${file.name}, Size: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
    setFile(file);
    
    const maxPreviewSize = 5 * 1024 * 1024;
    if (file.size > maxPreviewSize) {
      setData(`[Large file: ${file.name} - ${(file.size / 1024 / 1024).toFixed(2)}MB - Content not displayed for performance]`);
      setError('');
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        setData(e.target.result);
        setError('');
      };
      reader.onerror = () => {
        setError('Error reading file. Please try again.');
      };
      reader.readAsText(file);
    }
  };

  const handleExportFileSelect = (e) => handleFileSelect(e.target.files[0], setExportFile, setExportData);
  const handleLogsFileSelect = (e) => handleFileSelect(e.target.files[0], setLogsFile, setLogsData);
  const handleCatalogFileSelect = (e) => handleFileSelect(e.target.files[0], setCatalogFile, setCatalogData);

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
      
      if (exportFile && !exportData.trim()) {
        csvData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsText(exportFile);
        });
      }

      const analysis = await analyzeInventoryExportFn({ csvData, autoCreateStores: true });
      setConfirmData(analysis);
      setPendingUpload({ csvData, autoCreateStores: true });
      setShowConfirmDialog(true);
      
    } catch (err) {
      if (err.message.includes('413') || err.message.includes('Request failed with status code 413')) {
        setError('File is too large for the server to process. Please restart the development server for changes to take effect.');
      } else if (err.message.includes('timeout') || err.message.includes('Processing timeout')) {
        setError('Processing timeout: The file is too large or complex. Please try splitting your CSV into smaller files (max 50,000 rows).');
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
      setSuccess(`Export processed successfully! ${result.newProducts} new products, ${result.updatedProducts} updated products, ${result.unchangedProducts} unchanged. ${result.storesCreated} stores created/updated across ${result.locations.length} locations.`);
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
      
      if (logsFile && !logsData.trim()) {
        csvData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsText(logsFile);
        });
      }

      const result = await uploadInventoryLogsFn({ csvData });
      
      const successMsg = `Logs processed successfully! ${result.movementsProcessed} movements processed from ${result.totalMovements} total records across all stores.`;
      const detailsMsg = result.skippedRows > 0 
        ? ` ${result.skippedRows} rows skipped (products not found - upload inventory export first).`
        : '';
      
      setSuccess(successMsg + detailsMsg);
      setLogsData('');
      setLogsFile(null);
      if (logsFileRef.current) logsFileRef.current.value = '';
    } catch (err) {
      if (err.message.includes('413')) {
        setError('File is too large. Please restart the server or split into smaller files.');
      } else if (err.message.includes('timeout')) {
        setError('Processing timeout: Please split your CSV into smaller files (max 50,000 rows).');
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
      
      if (catalogFile && !catalogData.trim()) {
        csvData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsText(catalogFile);
        });
      }

      const result = await uploadProductCatalogFn({ csvData });
      
      setSuccess(`Product catalog processed successfully! ${result.newProducts} products created, ${result.updatedProducts} products updated across all stores.`);
      setCatalogData('');
      setCatalogFile(null);
      if (catalogFileRef.current) catalogFileRef.current.value = '';
    } catch (err) {
      if (err.message.includes('413')) {
        setError('File is too large. Please restart the server or split into smaller files.');
      } else if (err.message.includes('timeout')) {
        setError('Processing timeout: Please split your CSV into smaller files (max 50,000 rows).');
      } else {
        setError('Error uploading product catalog: ' + err.message);
      }
    } finally {
      setIsLoading(false);
      setShowProgressModal(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Global Data Upload</h1>
          <p className="text-muted-foreground">Upload data for all stores across your organization</p>
        </div>
        <Link to="/">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Upload className="h-5 w-5 mr-2" />
            Multi-Store Upload System
          </CardTitle>
          <CardDescription>
            Upload inventory exports, transaction logs, and product catalogs for all locations at once
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Tab Navigation */}
          <div className="flex space-x-1 bg-muted p-1 rounded-lg">
            <Button
              variant={activeTab === 'export' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('export')}
              className="flex items-center flex-1"
            >
              <Database className="h-4 w-4 mr-2" />
              Inventory Export
            </Button>
            <Button
              variant={activeTab === 'logs' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('logs')}
              className="flex items-center flex-1"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Inventory Logs
            </Button>
            <Button
              variant={activeTab === 'catalog' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('catalog')}
              className="flex items-center flex-1"
            >
              <Store className="h-4 w-4 mr-2" />
              Product Catalog
            </Button>
          </div>

          <Separator />

          {/* Export Tab */}
          {activeTab === 'export' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Inventory Export Upload</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload inventory-export.csv with product catalog and stock levels across all locations. Stores will be automatically created or updated based on location columns.
                </p>
                
                <div className="mb-4">
                  <label className="text-sm font-medium mb-2 block">Upload CSV File</label>
                  <div className="flex items-center space-x-4">
                    <input ref={exportFileRef} type="file" accept=".csv" onChange={handleExportFileSelect} className="hidden" />
                    <Button type="button" variant="outline" onClick={() => exportFileRef.current?.click()} className="flex items-center">
                      <File className="h-4 w-4 mr-2" />
                      Choose CSV File
                    </Button>
                    {exportFile && (
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4 text-green-600" />
                        <div className="flex flex-col">
                          <span className="text-sm text-green-600">{exportFile.name}</span>
                          <span className="text-xs text-muted-foreground">{(exportFile.size / 1024 / 1024).toFixed(2)} MB</span>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => {
                          setExportFile(null);
                          setExportData('');
                          if (exportFileRef.current) exportFileRef.current.value = '';
                        }}>Remove</Button>
                      </div>
                    )}
                  </div>
                </div>

                <label className="text-sm font-medium mb-2 block">CSV Data Preview</label>
                <textarea
                  className="w-full h-32 p-3 border rounded-md bg-background"
                  placeholder="CSV data will appear here..."
                  value={exportData}
                  onChange={(e) => setExportData(e.target.value)}
                  readOnly={exportFile && exportFile.size > 5 * 1024 * 1024}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Expected columns: Product Name, Barcode, Category, Brand, Retail price, Wholesale cost, and location columns
                </p>
              </div>
              <Button onClick={handleExportUpload} disabled={isLoading || (!exportData.trim() && !exportFile)} className="flex items-center">
                {isLoading ? (
                  <>
                    <div className="animate-spin h-4 w-4 mr-2 border-2 border-current border-t-transparent rounded-full" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4 mr-2" />
                    Process Inventory Export
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Logs Tab */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Inventory Logs Upload</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload inventory-logs.csv with transaction history across all stores. Products must exist in the database before uploading logs.
                </p>
                
                <div className="mb-4">
                  <label className="text-sm font-medium mb-2 block">Upload CSV File</label>
                  <div className="flex items-center space-x-4">
                    <input ref={logsFileRef} type="file" accept=".csv" onChange={handleLogsFileSelect} className="hidden" />
                    <Button type="button" variant="outline" onClick={() => logsFileRef.current?.click()} className="flex items-center">
                      <File className="h-4 w-4 mr-2" />
                      Choose CSV File
                    </Button>
                    {logsFile && (
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-green-600">{logsFile.name}</span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => {
                          setLogsFile(null);
                          setLogsData('');
                          if (logsFileRef.current) logsFileRef.current.value = '';
                        }}>Remove</Button>
                      </div>
                    )}
                  </div>
                </div>

                <label className="text-sm font-medium mb-2 block">CSV Data Preview</label>
                <textarea
                  className="w-full h-32 p-3 border rounded-md bg-background"
                  placeholder="CSV data will appear here..."
                  value={logsData}
                  onChange={(e) => setLogsData(e.target.value)}
                  readOnly={logsFile && logsFile.size > 5 * 1024 * 1024}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Expected columns: Date, Type, SKU, Barcode, Product, Employee, Location, Opening, Change, Closing, Notes
                </p>
              </div>
              <Button onClick={handleLogsUpload} disabled={isLoading || (!logsData.trim() && !logsFile)} className="flex items-center">
                {isLoading ? (
                  <>
                    <div className="animate-spin h-4 w-4 mr-2 border-2 border-current border-t-transparent rounded-full" />
                    Processing...
                  </>
                ) : (
                  <>
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Process Inventory Logs
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Catalog Tab */}
          {activeTab === 'catalog' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Product Catalog Upload</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload product-catalog.csv to bulk update product details. Products are matched by GTIN/barcode across all stores.
                </p>
                
                <div className="mb-4">
                  <label className="text-sm font-medium mb-2 block">Upload CSV File</label>
                  <div className="flex items-center space-x-4">
                    <input ref={catalogFileRef} type="file" accept=".csv" onChange={handleCatalogFileSelect} className="hidden" />
                    <Button type="button" variant="outline" onClick={() => catalogFileRef.current?.click()} className="flex items-center">
                      <File className="h-4 w-4 mr-2" />
                      Choose CSV File
                    </Button>
                    {catalogFile && (
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4 text-green-600" />
                        <div className="flex flex-col">
                          <span className="text-sm text-green-600">{catalogFile.name}</span>
                          <span className="text-xs text-muted-foreground">{(catalogFile.size / 1024 / 1024).toFixed(2)} MB</span>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => {
                          setCatalogFile(null);
                          setCatalogData('');
                          if (catalogFileRef.current) catalogFileRef.current.value = '';
                        }}>Remove</Button>
                      </div>
                    )}
                  </div>
                </div>

                <label className="text-sm font-medium mb-2 block">CSV Data Preview</label>
                <textarea
                  className="w-full h-32 p-3 border rounded-md bg-background"
                  placeholder="CSV data will appear here..."
                  value={catalogData}
                  onChange={(e) => setCatalogData(e.target.value)}
                  readOnly={catalogFile && catalogFile.size > 5 * 1024 * 1024}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Expected columns: Product Name, Barcode, Category, Brand, Retail price, Wholesale cost, Description, Image URL
                </p>
              </div>
              <Button onClick={handleCatalogUpload} disabled={isLoading || (!catalogData.trim() && !catalogFile)} className="flex items-center">
                {isLoading ? (
                  <>
                    <div className="animate-spin h-4 w-4 mr-2 border-2 border-current border-t-transparent rounded-full" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Store className="h-4 w-4 mr-2" />
                    Process Product Catalog
                  </>
                )}
              </Button>
            </div>
          )}

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

      <CSVUploadConfirmation
        isOpen={showConfirmDialog}
        onClose={handleCancelUpload}
        onConfirm={handleConfirmUpload}
        confirmData={confirmData}
        isLoading={isLoading}
      />

      <UploadProgressModal
        isOpen={showProgressModal}
        uploadType={uploadType}
        fileSize={currentFileSize}
      />
    </div>
  );
};

export default GlobalUploadPage;
