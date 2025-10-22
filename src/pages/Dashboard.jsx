import React, { useState, useRef } from 'react';
import { useQuery, useAction } from 'wasp/client/operations';
import { Link } from 'wasp/client/router';
import { getUserStores, analyzeInventoryExport, uploadInventoryExport } from 'wasp/client/operations';
import { CreateStoreModal } from '../components/CreateStoreModal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Plus, Upload, TrendingUp, Menu, MapPin, Store, File, Database, AlertCircle, CheckCircle } from 'lucide-react';
import CSVUploadConfirmation from '../components/CSVUploadConfirmation';

const DashboardPage = () => {
  const { data: stores, isLoading, error, refetch } = useQuery(getUserStores);
  const analyzeInventoryExportFn = useAction(analyzeInventoryExport);
  const uploadInventoryExportFn = useAction(uploadInventoryExport);
  
  // Inventory upload state
  const [csvData, setCsvData] = useState('');
  const [csvFile, setCsvFile] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  
  // Confirmation dialog state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmData, setConfirmData] = useState(null);
  const [pendingUpload, setPendingUpload] = useState(null);
  
  // File input ref
  const fileInputRef = useRef(null);

  const handleFileSelect = (file) => {
    if (!file) return;

    if (file.type !== 'text/csv' && !file.name.toLowerCase().endsWith('.csv')) {
      setUploadError('Please select a valid CSV file');
      return;
    }

    console.log(`Selected file: ${file.name}, Size: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
    setCsvFile(file);

    const maxPreviewSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxPreviewSize) {
      setCsvData(`[Preview of ${file.name} - ${(file.size / 1024 / 1024).toFixed(2)}MB - Content not displayed for performance]`);
      setUploadError('');
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        setCsvData(e.target.result);
        setUploadError('');
      };
      reader.onerror = () => {
        setUploadError('Error reading file. Please try again.');
      };
      reader.readAsText(file);
    }
  };

  const handleUpload = async () => {
    if (!csvData.trim() && !csvFile) {
      setUploadError('Please select a CSV file or paste CSV data');
      return;
    }

    setIsUploading(true);
    setUploadError('');
    setUploadSuccess('');

    try {
      let data = csvData;
      
      // If we have a file but no data (large file), read the full file
      if (csvFile && !csvData.trim()) {
        data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsText(csvFile);
        });
      }

      // Phase 1: Analyze the CSV to show what will happen
      const analysis = await analyzeInventoryExportFn({ csvData: data, autoCreateStores: true });
      
      // Show confirmation dialog
      setConfirmData(analysis);
      setPendingUpload({ csvData: data, autoCreateStores: true });
      setShowConfirmDialog(true);
      
    } catch (err) {
      if (err.message.includes('413') || err.message.includes('Request failed with status code 413')) {
        setUploadError('File is too large for the server to process. The server has been configured to handle larger files, but you may need to restart the development server for changes to take effect.');
      } else if (err.message.includes('timeout') || err.message.includes('Processing timeout')) {
        setUploadError('Processing timeout: The file is too large or complex. Please try splitting your CSV into smaller files (max 50,000 rows).');
      } else if (err.message.includes('File too large') || err.message.includes('More than')) {
        setUploadError(err.message + ' Use the CSV splitter utility to break large files into smaller chunks.');
      } else {
        setUploadError('Error analyzing inventory export: ' + err.message);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirmUpload = async () => {
    if (!pendingUpload) return;

    setIsUploading(true);
    setUploadError('');
    setUploadSuccess('');

    try {
      const result = await uploadInventoryExportFn(pendingUpload);
      setUploadSuccess(`Export processed successfully! ${result.newProducts} new products, ${result.updatedProducts} updated products, ${result.unchangedProducts} unchanged products.`);
      setCsvData('');
      setCsvFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setShowConfirmDialog(false);
      setConfirmData(null);
      setPendingUpload(null);
      // Refresh stores to show any new ones created
      refetch();
    } catch (err) {
      setUploadError('Error uploading inventory export: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancelUpload = () => {
    setShowConfirmDialog(false);
    setConfirmData(null);
    setPendingUpload(null);
  };

  if (isLoading) return (
    <div className="space-y-4">
      <div className="animate-pulse h-8 bg-muted rounded w-1/3"></div>
      <div className="grid gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse h-24 bg-muted rounded"></div>
        ))}
      </div>
    </div>
  );
  
  if (error) return (
    <div className="text-center py-8">
      <div className="text-destructive mb-4">Error: {error}</div>
      <Button onClick={() => refetch()}>Try Again</Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Your Stores</h1>
          <p className="text-muted-foreground mt-1">
            Manage your retail locations and inventory
          </p>
        </div>
        <CreateStoreModal onStoreCreated={() => refetch()}>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create Store
          </Button>
        </CreateStoreModal>
      </div>

      {/* Quick Inventory Upload Section */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader>
          <CardTitle className="flex items-center text-blue-900">
            <Database className="h-5 w-5 mr-2" />
            Quick Inventory Upload
          </CardTitle>
          <CardDescription className="text-blue-700">
            Upload your inventory CSV file directly. Stores will be created automatically based on location columns in your CSV.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* File Upload Section */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Upload Inventory CSV
            </label>
            <div className="flex items-center space-x-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={(e) => handleFileSelect(e.target.files[0])}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center"
              >
                <File className="h-4 w-4 mr-2" />
                Choose CSV File
              </Button>
              {csvFile && (
                <div className="flex items-center space-x-2">
                  <File className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-green-600">{csvFile.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCsvFile(null);
                      setCsvData('');
                      if (fileInputRef.current) fileInputRef.current.value = '';
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

          <div>
            <label className="text-sm font-medium mb-2 block">
              Paste CSV Data
            </label>
            <textarea
              className="w-full h-32 p-3 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              placeholder="Paste your CSV data here or upload a file above..."
              value={csvData}
              onChange={(e) => setCsvData(e.target.value)}
              readOnly={csvFile && csvFile.size > 5 * 1024 * 1024}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Expected columns: Product Name, Barcode, Category, Brand, Retail price, Wholesale cost, and location columns
            </p>
          </div>

          <Button 
            onClick={handleUpload} 
            disabled={isUploading || (!csvData.trim() && !csvFile)}
            className="w-full"
          >
            {isUploading ? (
              <>
                <div className="animate-spin h-4 w-4 mr-2 border-2 border-current border-t-transparent rounded-full" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload Inventory
              </>
            )}
          </Button>

          {/* Status Messages */}
          {uploadError && (
            <div className="flex items-center space-x-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm text-destructive">{uploadError}</span>
            </div>
          )}
          
          {uploadSuccess && (
            <div className="flex items-center space-x-2 p-3 bg-green-50 border border-green-200 rounded-md">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-600">{uploadSuccess}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {stores.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Store className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No stores found</h3>
            <p className="text-muted-foreground text-center mb-6">
              Get started by creating your first store to begin tracking inventory and sales.
            </p>
            <CreateStoreModal onStoreCreated={() => refetch()}>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Store
              </Button>
            </CreateStoreModal>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {stores.map(store => (
            <Card key={store.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-xl">{store.name}</CardTitle>
                    <CardDescription className="flex items-center mt-1">
                      <MapPin className="h-4 w-4 mr-1" />
                      {store.location}
                    </CardDescription>
                  </div>
                  <Badge variant="outline">Active</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-2">
                    <Link to={`/store/${store.id}/upload`}>
                      <Button variant="outline" className="w-full justify-start">
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Inventory
                      </Button>
                    </Link>
                    <Link to={`/store/${store.id}/trends`}>
                      <Button variant="outline" className="w-full justify-start">
                        <TrendingUp className="h-4 w-4 mr-2" />
                        View Sales Trends
                      </Button>
                    </Link>
                    <Link to={`/store/${store.id}/menu`}>
                      <Button variant="outline" className="w-full justify-start">
                        <Menu className="h-4 w-4 mr-2" />
                        Generate Smart Menu
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Confirmation Dialog */}
      <CSVUploadConfirmation
        isOpen={showConfirmDialog}
        onClose={handleCancelUpload}
        onConfirm={handleConfirmUpload}
        confirmData={confirmData}
        isLoading={isUploading}
      />
    </div>
  );
};

export default DashboardPage;
