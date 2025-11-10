import React, { useState } from 'react';
import { useAction } from 'wasp/client/operations';
import { cleanupOctoberNovember2025 } from 'wasp/client/operations';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Trash2, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

const DataCleanupPage = () => {
  const cleanupFn = useAction(cleanupOctoberNovember2025);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleCleanup = async () => {
    // Double confirmation
    const confirmed = window.confirm(
      '⚠️ WARNING: This will delete ALL data for October and November 2025.\n\n' +
      'This includes:\n' +
      '- All inventory movements\n' +
      '- All weekly sales summaries\n' +
      '- All weekly category summaries\n' +
      '- All weekly brand summaries\n' +
      '- All inventory snapshots\n\n' +
      'This action CANNOT be undone!\n\n' +
      'Are you absolutely sure you want to proceed?'
    );

    if (!confirmed) {
      return;
    }

    // Second confirmation
    const doubleConfirmed = window.confirm(
      'FINAL CONFIRMATION:\n\n' +
      'You are about to permanently delete all October and November 2025 data.\n\n' +
      'Type "DELETE" in the next prompt to confirm.'
    );

    if (!doubleConfirmed) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const cleanupResult = await cleanupFn({});
      setResult(cleanupResult);
      console.log('✅ Cleanup complete:', cleanupResult);
    } catch (err) {
      setError(err.message || 'Cleanup failed');
      console.error('❌ Cleanup failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Data Cleanup</h1>
        <p className="text-muted-foreground">
          Delete October and November 2025 data to allow re-uploading with deduplication
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            October & November 2025 Cleanup
          </CardTitle>
          <CardDescription>
            This will permanently delete all inventory data for October 1 - November 30, 2025
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border border-red-500 bg-red-50 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-800 mb-2">Warning</h3>
                <p className="text-sm text-red-700">
                  This action will delete:
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>All InventoryMovement records (Oct 1 - Nov 30, 2025)</li>
                    <li>All WeeklySalesSummary records for overlapping weeks</li>
                    <li>All WeeklyCategorySummary records for overlapping weeks</li>
                    <li>All WeeklyBrandSummary records for overlapping weeks</li>
                    <li>All InventorySnapshot records uploaded during that period</li>
                  </ul>
                  <strong className="mt-2 block">This action cannot be undone!</strong>
                </p>
              </div>
            </div>
          </div>

          <Button
            onClick={handleCleanup}
            disabled={isLoading}
            variant="destructive"
            size="lg"
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Cleaning up...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete October & November 2025 Data
              </>
            )}
          </Button>

          {error && (
            <div className="border border-red-500 bg-red-50 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-red-800 mb-1">Error</h3>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {result && (
            <div className="border border-green-500 bg-green-50 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-green-800 mb-2">Cleanup Complete</h3>
                  <div className="text-sm text-green-700 space-y-1">
                    <p><strong>Movements deleted:</strong> {result.deleted.movements}</p>
                    <p><strong>Weekly Sales deleted:</strong> {result.deleted.weeklySales}</p>
                    <p><strong>Weekly Categories deleted:</strong> {result.deleted.weeklyCategories}</p>
                    <p><strong>Weekly Brands deleted:</strong> {result.deleted.weeklyBrands}</p>
                    <p><strong>Snapshots deleted:</strong> {result.deleted.snapshots}</p>
                    <p className="mt-2"><strong>Duration:</strong> {result.duration.toFixed(2)}s</p>
                    <p className="mt-2">{result.message}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Next Steps</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2">
            <li>After cleanup completes, you can re-upload your October and November inventory log files</li>
            <li>The new deduplication logic will prevent any duplicate records</li>
            <li>Your revenue charts should show a steadier trend after re-uploading</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
};

export default DataCleanupPage;

