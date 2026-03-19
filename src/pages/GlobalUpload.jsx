import React, { useState, useRef } from 'react';
import { useAction } from 'wasp/client/operations';
import { uploadInventoryExport, uploadInventoryLogs, analyzeInventoryExport } from 'wasp/client/operations';
import { Link } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Separator } from '../components/ui/separator';
import { Upload, FileText, CheckCircle, AlertCircle, Database, TrendingUp, File, ArrowLeft, ArrowRight } from 'lucide-react';
import CSVUploadConfirmation from '../components/CSVUploadConfirmation';
import UploadProgressModal from '../components/UploadProgressModal';

const GlobalUploadPage = () => {
  const uploadInventoryExportFn = useAction(uploadInventoryExport);
  const uploadInventoryLogsFn = useAction(uploadInventoryLogs);
  const analyzeInventoryExportFn = useAction(analyzeInventoryExport);

  // Guided flow state
  const [step, setStep] = useState(1); // 1 = export, 2 = logs
  const [exportComplete, setExportComplete] = useState(false);
  const [logsComplete, setLogsComplete] = useState(false);

  // Export state
  const [exportFile, setExportFile] = useState(null);
  const [exportData, setExportData] = useState('');
  const exportFileRef = useRef(null);

  // Logs state (single file)
  const [logsFile, setLogsFile] = useState(null);
  const [logsData, setLogsData] = useState('');
  const logsFileRef = useRef(null);

  // Bulk logs state
  const [bulkLogsFiles, setBulkLogsFiles] = useState([]);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [bulkResults, setBulkResults] = useState(null);
  const bulkLogsFolderRef = useRef(null);
  const bulkLogsFilesRef = useRef(null);

  // Shared state
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Confirmation dialog state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmData, setConfirmData] = useState(null);
  const [pendingUpload, setPendingUpload] = useState(null);

  // Progress modal state
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [uploadType, setUploadType] = useState('');
  const [currentFileSize, setCurrentFileSize] = useState(0);

  // File handling
  const handleFileSelect = (file, setFile, setData) => {
    if (!file) return;
    if (file.type !== 'text/csv' && !file.name.toLowerCase().endsWith('.csv')) {
      setError('Please select a valid CSV file');
      return;
    }
    setFile(file);
    setError('');

    if (file.size <= 5 * 1024 * 1024) {
      const reader = new FileReader();
      reader.onload = (e) => setData(e.target.result);
      reader.onerror = () => setError('Error reading file. Please try again.');
      reader.readAsText(file);
    } else {
      setData(`[Large file: ${file.name} - ${(file.size / 1024 / 1024).toFixed(2)}MB]`);
    }
  };

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
      status: 'pending',
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
      errors: [],
      fileDetails: []
    };

    for (let i = 0; i < bulkLogsFiles.length; i++) {
      const fileObj = bulkLogsFiles[i];

      setBulkLogsFiles(prev => prev.map(f =>
        f.id === fileObj.id ? { ...f, status: 'processing', progress: 0 } : f
      ));

      try {
        const csvData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsText(fileObj.file);
        });

        const result = await uploadInventoryLogsFn({ csvData });

        setBulkLogsFiles(prev => prev.map(f =>
          f.id === fileObj.id
            ? { ...f, status: 'completed', progress: 100, result }
            : f
        ));

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
        setBulkLogsFiles(prev => prev.map(f =>
          f.id === fileObj.id
            ? { ...f, status: 'error', progress: 0, error: err.message }
            : f
        ));

        results.errorCount++;
        results.errors.push({ filename: fileObj.name, error: err.message });
        results.fileDetails.push({ filename: fileObj.name, status: 'error', error: err.message });
      }

      setBulkProgress({ current: i + 1, total: bulkLogsFiles.length });
    }

    setBulkResults(results);
    setIsBulkProcessing(false);
    setLogsComplete(true);

    if (results.successCount > 0) {
      setSuccess(
        `Bulk upload complete! ${results.successCount}/${results.totalFiles} files processed. ` +
        `${results.totalProcessed} movements added from ${results.totalMovements} total records.` +
        (results.productsCreated > 0 ? ` ${results.productsCreated} products auto-created.` : '')
      );
    }
    if (results.errorCount > 0) {
      setError(`${results.errorCount} file(s) failed to process. See details below.`);
    }
  };

  // Export upload handlers
  const handleExportUpload = async () => {
    if (!exportData.trim() && !exportFile) {
      setError('Please select a CSV file');
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
        setError('File is too large for the server to process. Please restart the development server.');
      } else if (err.message.includes('timeout') || err.message.includes('Processing timeout')) {
        setError('Processing timeout: Please split your CSV into smaller files (max 50,000 rows).');
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
      setSuccess(`Export processed! ${result.newProducts} new products, ${result.updatedProducts} updated, ${result.unchangedProducts} unchanged. ${result.storesCreated} stores across ${result.locations.length} locations.`);
      setExportData('');
      setExportFile(null);
      if (exportFileRef.current) exportFileRef.current.value = '';
      setConfirmData(null);
      setPendingUpload(null);
      setExportComplete(true);
      setStep(2);
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

  // Single logs upload handler
  const handleLogsUpload = async () => {
    if (!logsData.trim() && !logsFile) {
      setError('Please select a CSV file');
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

      let successMsg = `Logs processed! ${result.movementsProcessed} movements from ${result.totalMovements} records.`;
      if (result.productsCreated > 0) {
        successMsg += ` ${result.productsCreated} product(s) auto-created.`;
      }
      if (result.skippedRows > 0) {
        successMsg += ` ${result.skippedRows} rows skipped (missing GTIN).`;
      }

      setSuccess(successMsg);
      setLogsData('');
      setLogsFile(null);
      if (logsFileRef.current) logsFileRef.current.value = '';
      setLogsComplete(true);
    } catch (err) {
      if (err.message.includes('413')) {
        setError('File is too large. Please split into smaller files.');
      } else if (err.message.includes('timeout')) {
        setError('Processing timeout: Please split your CSV (max 50,000 rows).');
      } else {
        setError('Error uploading inventory logs: ' + err.message);
      }
    } finally {
      setIsLoading(false);
      setShowProgressModal(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Upload Data</h1>
          <p className="text-muted-foreground">Import your inventory export and transaction logs</p>
        </div>
        <Link to="/">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Dashboard
          </Button>
        </Link>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setStep(1)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            step === 1
              ? 'bg-primary text-primary-foreground'
              : exportComplete
                ? 'bg-green-100 text-green-800'
                : 'bg-muted text-muted-foreground'
          }`}
        >
          {exportComplete ? <CheckCircle className="h-4 w-4" /> : <Database className="h-4 w-4" />}
          1. Inventory Export
        </button>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <button
          onClick={() => setStep(2)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            step === 2
              ? 'bg-primary text-primary-foreground'
              : logsComplete
                ? 'bg-green-100 text-green-800'
                : 'bg-muted text-muted-foreground'
          }`}
        >
          {logsComplete ? <CheckCircle className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
          2. Inventory Logs
        </button>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
          <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
          <span className="text-sm text-destructive">{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
          <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
          <span className="text-sm text-green-600">{success}</span>
        </div>
      )}

      {/* Step 1: Inventory Export */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-lg">
              <Database className="h-5 w-5 mr-2" />
              Inventory Export
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Upload your inventory export CSV with product catalog and stock levels across all locations.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <input ref={exportFileRef} type="file" accept=".csv" onChange={(e) => handleFileSelect(e.target.files[0], setExportFile, setExportData)} className="hidden" />
              <Button type="button" variant="outline" onClick={() => exportFileRef.current?.click()} className="flex items-center">
                <File className="h-4 w-4 mr-2" />
                Choose CSV File
              </Button>
              {exportFile && (
                <div className="flex items-center gap-2">
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

            <div className="flex items-center justify-between pt-2">
              <Button
                variant="ghost"
                onClick={() => { setStep(2); setError(''); setSuccess(''); }}
              >
                Skip, already done
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
              <Button
                onClick={handleExportUpload}
                disabled={isLoading || (!exportData.trim() && !exportFile)}
                size="lg"
                className="flex items-center font-semibold px-8"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin h-5 w-5 mr-2 border-2 border-current border-t-transparent rounded-full" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Database className="h-5 w-5 mr-2" />
                    Process Export
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Inventory Logs */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-lg">
              <TrendingUp className="h-5 w-5 mr-2" />
              Inventory Logs
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Upload inventory log CSVs with transaction history (sales, restocks, adjustments).
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Single File */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Single File</h4>
              <div className="flex items-center gap-4">
                <input ref={logsFileRef} type="file" accept=".csv" onChange={(e) => handleFileSelect(e.target.files[0], setLogsFile, setLogsData)} className="hidden" />
                <Button type="button" variant="outline" onClick={() => logsFileRef.current?.click()} className="flex items-center">
                  <File className="h-4 w-4 mr-2" />
                  Choose CSV File
                </Button>
                {logsFile && (
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-green-600">{logsFile.name}</span>
                    <span className="text-xs text-muted-foreground">({(logsFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => {
                      setLogsFile(null);
                      setLogsData('');
                      if (logsFileRef.current) logsFileRef.current.value = '';
                    }}>Remove</Button>
                  </div>
                )}
              </div>
              {logsFile && (
                <div className="flex justify-end">
                  <Button
                    onClick={handleLogsUpload}
                    disabled={isLoading || (!logsData.trim() && !logsFile)}
                    size="lg"
                    className="flex items-center font-semibold px-8"
                  >
                    {isLoading ? (
                      <>
                        <div className="animate-spin h-5 w-5 mr-2 border-2 border-current border-t-transparent rounded-full" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <TrendingUp className="h-5 w-5 mr-2" />
                        Process Logs
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>

            <Separator />

            {/* Bulk Upload */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Multiple Files</h4>
              <div className="flex items-center gap-3">
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
                <Button type="button" variant="outline" onClick={() => bulkLogsFolderRef.current?.click()} disabled={isBulkProcessing}>
                  <Upload className="h-4 w-4 mr-2" />
                  Choose Folder
                </Button>
                <Button type="button" variant="outline" onClick={() => bulkLogsFilesRef.current?.click()} disabled={isBulkProcessing}>
                  <FileText className="h-4 w-4 mr-2" />
                  Choose Files
                </Button>
                {bulkLogsFiles.length > 0 && (
                  <Button type="button" variant="ghost" onClick={clearBulkQueue} disabled={isBulkProcessing} className="text-destructive">
                    Clear ({bulkLogsFiles.length})
                  </Button>
                )}
              </div>

              {/* File Queue */}
              {bulkLogsFiles.length > 0 && (
                <div className="border rounded-lg p-3 space-y-2 max-h-72 overflow-y-auto">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{bulkLogsFiles.length} files queued</span>
                    {isBulkProcessing && (
                      <span className="text-xs text-muted-foreground">
                        {bulkProgress.current} / {bulkProgress.total}
                      </span>
                    )}
                  </div>
                  {bulkLogsFiles.map((fileObj) => (
                    <div key={fileObj.id} className="flex items-center justify-between p-2 bg-muted rounded-md text-sm">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FileText className={`h-4 w-4 flex-shrink-0 ${
                          fileObj.status === 'completed' ? 'text-green-600' :
                          fileObj.status === 'error' ? 'text-red-600' :
                          fileObj.status === 'processing' ? 'text-blue-600' :
                          'text-gray-400'
                        }`} />
                        <span className="truncate">{fileObj.name}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">{(fileObj.size / 1024 / 1024).toFixed(1)}MB</span>
                        {fileObj.status === 'completed' && <CheckCircle className="h-3 w-3 text-green-600 flex-shrink-0" />}
                        {fileObj.status === 'error' && <AlertCircle className="h-3 w-3 text-red-600 flex-shrink-0" />}
                        {fileObj.status === 'processing' && (
                          <div className="animate-spin h-3 w-3 border-2 border-blue-600 border-t-transparent rounded-full flex-shrink-0" />
                        )}
                      </div>
                      {!isBulkProcessing && fileObj.status === 'pending' && (
                        <Button type="button" variant="ghost" size="sm" className="h-6 px-2" onClick={() => removeBulkFile(fileObj.id)}>
                          Remove
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Process Button */}
              {bulkLogsFiles.length > 0 && (
                <div className="flex justify-end">
                  <Button
                    onClick={processBulkLogs}
                    disabled={isBulkProcessing || bulkLogsFiles.length === 0}
                    size="lg"
                    className="flex items-center font-semibold px-8"
                  >
                    {isBulkProcessing ? (
                      <>
                        <div className="animate-spin h-5 w-5 mr-2 border-2 border-current border-t-transparent rounded-full" />
                        Processing {bulkProgress.current}/{bulkProgress.total}...
                      </>
                    ) : (
                      <>
                        <Upload className="h-5 w-5 mr-2" />
                        Upload All ({bulkLogsFiles.length})
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Bulk Results */}
              {bulkResults && (
                <div className="border rounded-lg p-4 space-y-3 bg-muted/50">
                  <h4 className="font-medium flex items-center text-sm">
                    <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                    Results
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-xl font-bold">{bulkResults.successCount}/{bulkResults.totalFiles}</div>
                      <div className="text-xs text-muted-foreground">Files</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-green-600">{bulkResults.totalProcessed}</div>
                      <div className="text-xs text-muted-foreground">Movements</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-blue-600">{bulkResults.totalMovements}</div>
                      <div className="text-xs text-muted-foreground">Total Records</div>
                    </div>
                  </div>
                  {bulkResults.errors.length > 0 && (
                    <div className="space-y-1">
                      {bulkResults.errors.map((err, idx) => (
                        <div key={idx} className="text-xs text-red-600 bg-red-50 p-2 rounded">
                          <strong>{err.filename}:</strong> {err.error}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Back to Step 1 */}
            <div className="flex justify-start pt-2">
              <Button variant="ghost" onClick={() => { setStep(1); setError(''); setSuccess(''); }}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Export
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Done */}
      {exportComplete && logsComplete && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-6 w-6 text-green-600" />
                <div>
                  <p className="font-medium text-green-800">All uploads complete</p>
                  <p className="text-sm text-green-600">Your data is ready to analyze.</p>
                </div>
              </div>
              <Link to="/">
                <Button>
                  Go to Dashboard
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modals */}
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
