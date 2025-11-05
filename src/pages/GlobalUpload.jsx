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
  
  // Bulk logs upload states
  const [bulkLogsFiles, setBulkLogsFiles] = useState([]);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [bulkResults, setBulkResults] = useState(null);
  
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
  const bulkLogsFolderRef = useRef(null);
  const bulkLogsFilesRef = useRef(null);

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

  // Bulk logs file handling
  const handleBulkLogsSelect = (e) => {
    const files = Array.from(e.target.files);
    const csvFiles = files.filter(file => 
      file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv')
    );
    
    if (csvFiles.length === 0) {
      setError('No valid CSV files selected');
      return;
    }
    
    const fileObjects = csvFiles.map(file => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      name: file.name,
      size: file.size,
      status: 'pending', // pending, processing, completed, error
      progress: 0,
      result: null,
      error: null
    }));
    
    setBulkLogsFiles(prev => [...prev, ...fileObjects]);
    setError('');
  };

  const removeBulkFile = (fileId) => {
    setBulkLogsFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const clearBulkQueue = () => {
    if (!isBulkProcessing) {
      setBulkLogsFiles([]);
      setBulkResults(null);
      setError('');
      setSuccess('');
    }
  };

  const processBulkLogs = async () => {
    if (bulkLogsFiles.length === 0) {
      setError('No files to process');
      return;
    }

    setIsBulkProcessing(true);
    setBulkProgress({ current: 0, total: bulkLogsFiles.length });
    setBulkResults(null);
    setError('');
    setSuccess('');

    const results = {
      totalFiles: bulkLogsFiles.length,
      successCount: 0,
      errorCount: 0,
      totalMovements: 0,
      totalProcessed: 0,
      totalSkipped: 0,
      productsCreated: 0,
      dateRange: { earliest: null, latest: null },
      errors: [],
      fileDetails: []
    };

    // Process files sequentially
    for (let i = 0; i < bulkLogsFiles.length; i++) {
      const fileObj = bulkLogsFiles[i];
      
      // Update file status to processing
      setBulkLogsFiles(prev => prev.map(f => 
        f.id === fileObj.id ? { ...f, status: 'processing', progress: 0 } : f
      ));

      try {
        // Read file content
        const csvData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsText(fileObj.file);
        });

        // Process the file
        const result = await uploadInventoryLogsFn({ csvData });

        // Update file status to completed
        setBulkLogsFiles(prev => prev.map(f => 
          f.id === fileObj.id 
            ? { ...f, status: 'completed', progress: 100, result } 
            : f
        ));

        // Aggregate results
        results.successCount++;
        results.totalMovements += result.totalMovements || 0;
        results.totalProcessed += result.movementsProcessed || 0;
        results.totalSkipped += result.skippedRows || 0;
        results.productsCreated += result.productsCreated || 0;
        
        results.fileDetails.push({
          filename: fileObj.name,
          status: 'success',
          movements: result.movementsProcessed || 0,
          total: result.totalMovements || 0,
          skipped: result.skippedRows || 0
        });

      } catch (err) {
        // Update file status to error
        setBulkLogsFiles(prev => prev.map(f => 
          f.id === fileObj.id 
            ? { ...f, status: 'error', progress: 0, error: err.message } 
            : f
        ));

        results.errorCount++;
        results.errors.push({
          filename: fileObj.name,
          error: err.message
        });

        results.fileDetails.push({
          filename: fileObj.name,
          status: 'error',
          error: err.message
        });
      }

      // Update overall progress
      setBulkProgress({ current: i + 1, total: bulkLogsFiles.length });
    }

    setBulkResults(results);
    setIsBulkProcessing(false);

    if (results.successCount > 0) {
      setSuccess(
        `Bulk upload complete! ${results.successCount}/${results.totalFiles} files processed successfully. ` +
        `${results.totalProcessed} movements added from ${results.totalMovements} total records.` +
        (results.productsCreated > 0 ? ` ${results.productsCreated} products auto-created.` : '')
      );
    }

    if (results.errorCount > 0) {
      setError(`${results.errorCount} file(s) failed to process. See details below.`);
    }
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
      
      let successMsg = `Logs processed successfully! ${result.movementsProcessed} movements processed from ${result.totalMovements} total records.`;
      
      if (result.productsCreated > 0) {
        successMsg += ` ${result.productsCreated} minimal product(s) auto-created from logs (will be enriched when inventory export is uploaded).`;
      }
      
      if (result.skippedRows > 0) {
        successMsg += ` ${result.skippedRows} rows skipped (missing GTIN).`;
      }
      
      setSuccess(successMsg);
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
          <div className="flex space-x-1 border-b border-border">
            <Button
              variant={activeTab === 'export' ? 'default' : 'ghost'}
              size="default"
              onClick={() => setActiveTab('export')}
              className={`flex items-center flex-1 rounded-b-none ${
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
              className={`flex items-center flex-1 rounded-b-none ${
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
              className={`flex items-center flex-1 rounded-b-none ${
                activeTab === 'catalog' 
                  ? 'bg-primary text-primary-foreground shadow-sm border-b-2 border-b-primary' 
                  : 'hover:bg-muted/50'
              }`}
            >
              <Store className="h-4 w-4 mr-2" />
              Product Catalog
            </Button>
          </div>

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
                      Processing...
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
            <div className="space-y-6">
              {/* Single File Upload */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Single File Upload</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Upload a single inventory-logs.csv file with transaction history.
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
                        Processing...
                      </>
                    ) : (
                      <>
                        <TrendingUp className="h-5 w-5 mr-2" />
                        Process Single File
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Bulk Upload Section */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Bulk Upload - Multiple Files</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Upload multiple inventory log files at once for historical data analysis. Select a folder or multiple CSV files.
                  </p>
                  
                  <div className="flex items-center space-x-4 mb-4">
                    <input 
                      ref={bulkLogsFolderRef} 
                      type="file" 
                      accept=".csv" 
                      webkitdirectory="true"
                      directory="true"
                      multiple 
                      onChange={handleBulkLogsSelect} 
                      className="hidden" 
                    />
                    <input 
                      ref={bulkLogsFilesRef} 
                      type="file" 
                      accept=".csv" 
                      multiple 
                      onChange={handleBulkLogsSelect} 
                      className="hidden" 
                    />
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => bulkLogsFolderRef.current?.click()}
                      disabled={isBulkProcessing}
                      className="flex items-center"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Choose Folder
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => bulkLogsFilesRef.current?.click()}
                      disabled={isBulkProcessing}
                      className="flex items-center"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Choose Multiple Files
                    </Button>
                    {bulkLogsFiles.length > 0 && (
                      <Button 
                        type="button" 
                        variant="ghost" 
                        onClick={clearBulkQueue}
                        disabled={isBulkProcessing}
                        className="text-destructive"
                      >
                        Clear All ({bulkLogsFiles.length})
                      </Button>
                    )}
                  </div>

                  {/* File Queue Display */}
                  {bulkLogsFiles.length > 0 && (
                    <div className="border rounded-lg p-4 space-y-2 max-h-96 overflow-y-auto">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">Upload Queue ({bulkLogsFiles.length} files)</h4>
                        {isBulkProcessing && (
                          <span className="text-sm text-muted-foreground">
                            Processing {bulkProgress.current} of {bulkProgress.total}...
                          </span>
                        )}
                      </div>
                      
                      {bulkLogsFiles.map((fileObj) => (
                        <div 
                          key={fileObj.id} 
                          className="flex items-center justify-between p-3 bg-muted rounded-md"
                        >
                          <div className="flex items-center space-x-3 flex-1">
                            <FileText className={`h-5 w-5 ${
                              fileObj.status === 'completed' ? 'text-green-600' :
                              fileObj.status === 'error' ? 'text-red-600' :
                              fileObj.status === 'processing' ? 'text-blue-600' :
                              'text-gray-400'
                            }`} />
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                <span className="text-sm font-medium">{fileObj.name}</span>
                                {fileObj.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-600" />}
                                {fileObj.status === 'error' && <AlertCircle className="h-4 w-4 text-red-600" />}
                                {fileObj.status === 'processing' && (
                                  <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
                                )}
                              </div>
                              <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                                <span>{(fileObj.size / 1024 / 1024).toFixed(2)} MB</span>
                                {fileObj.status === 'completed' && fileObj.result && (
                                  <span className="text-green-600">
                                    • {fileObj.result.movementsProcessed || 0} movements
                                  </span>
                                )}
                                {fileObj.status === 'error' && (
                                  <span className="text-red-600">• {fileObj.error}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          {!isBulkProcessing && fileObj.status === 'pending' && (
                            <Button 
                              type="button" 
                              variant="ghost" 
                              size="sm"
                              onClick={() => removeBulkFile(fileObj.id)}
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Upload Controls */}
                  {bulkLogsFiles.length > 0 && (
                    <div className="flex items-center space-x-4 mt-4">
                      <Button 
                        onClick={processBulkLogs} 
                        disabled={isBulkProcessing || bulkLogsFiles.length === 0}
                        size="lg"
                        className="flex items-center bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 py-6 text-base shadow-lg"
                      >
                        {isBulkProcessing ? (
                          <>
                            <div className="animate-spin h-5 w-5 mr-2 border-2 border-current border-t-transparent rounded-full" />
                            Processing {bulkProgress.current}/{bulkProgress.total}...
                          </>
                        ) : (
                          <>
                            <Upload className="h-5 w-5 mr-2" />
                            Upload All Files ({bulkLogsFiles.length})
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {/* Results Summary */}
                  {bulkResults && (
                    <div className="border rounded-lg p-4 mt-4 space-y-3 bg-muted/50">
                      <h4 className="font-medium flex items-center">
                        <CheckCircle className="h-5 w-5 mr-2 text-green-600" />
                        Bulk Upload Results
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <div className="text-2xl font-bold">{bulkResults.successCount}/{bulkResults.totalFiles}</div>
                          <div className="text-xs text-muted-foreground">Files Processed</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-green-600">{bulkResults.totalProcessed}</div>
                          <div className="text-xs text-muted-foreground">Movements Added</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-blue-600">{bulkResults.totalMovements}</div>
                          <div className="text-xs text-muted-foreground">Total Records</div>
                        </div>
                        {bulkResults.productsCreated > 0 && (
                          <div>
                            <div className="text-2xl font-bold text-purple-600">{bulkResults.productsCreated}</div>
                            <div className="text-xs text-muted-foreground">Products Created</div>
                          </div>
                        )}
                      </div>
                      
                      {bulkResults.errors.length > 0 && (
                        <div className="mt-4">
                          <h5 className="text-sm font-medium text-red-600 mb-2">Errors ({bulkResults.errors.length})</h5>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {bulkResults.errors.map((err, idx) => (
                              <div key={idx} className="text-sm text-red-600 bg-red-50 p-2 rounded">
                                <strong>{err.filename}:</strong> {err.error}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
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
                      Processing...
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
        onClose={() => setShowProgressModal(false)}
        uploadType={uploadType}
        fileSize={currentFileSize}
      />
    </div>
  );
};

export default GlobalUploadPage;
