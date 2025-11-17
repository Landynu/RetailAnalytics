import React from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';

/**
 * ErrorFallback Component
 * Displays when an error is caught by ErrorBoundary
 */
export function ErrorFallback({ error, errorInfo, onReset }) {
  const isDevelopment = import.meta.env.DEV;

  const handleGoHome = () => {
    window.location.href = '/';
  };

  const handleReload = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="max-w-2xl w-full p-8">
        <div className="flex flex-col items-center text-center">
          {/* Error Icon */}
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Oops! Something went wrong
          </h1>

          {/* Message */}
          <p className="text-gray-600 mb-6">
            We're sorry, but something unexpected happened. Our team has been notified
            and we're working on fixing it.
          </p>

          {/* Error Details (only in development) */}
          {isDevelopment && error && (
            <div className="w-full mb-6">
              <details className="text-left bg-red-50 border border-red-200 rounded-lg p-4">
                <summary className="font-semibold text-red-900 cursor-pointer mb-2">
                  Error Details (Development Only)
                </summary>
                <div className="mt-2 space-y-2">
                  <div>
                    <p className="text-sm font-medium text-red-800">Error Message:</p>
                    <pre className="text-xs text-red-700 mt-1 whitespace-pre-wrap break-words">
                      {error.toString()}
                    </pre>
                  </div>
                  {errorInfo && (
                    <div>
                      <p className="text-sm font-medium text-red-800 mt-3">Stack Trace:</p>
                      <pre className="text-xs text-red-700 mt-1 overflow-auto max-h-48 whitespace-pre-wrap break-words">
                        {errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Button
              onClick={onReset}
              variant="default"
              className="flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </Button>
            <Button
              onClick={handleReload}
              variant="outline"
              className="flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Page
            </Button>
            <Button
              onClick={handleGoHome}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Home className="w-4 h-4" />
              Go Home
            </Button>
          </div>

          {/* Support Message */}
          <p className="text-sm text-gray-500 mt-6">
            If this problem persists, please contact support at{' '}
            <a
              href="mailto:support@yourdomain.com"
              className="text-emerald-600 hover:text-emerald-700 underline"
            >
              support@yourdomain.com
            </a>
          </p>
        </div>
      </Card>
    </div>
  );
}
