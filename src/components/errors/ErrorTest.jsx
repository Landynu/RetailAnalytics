import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';

/**
 * ErrorTest Component
 * A simple component to test ErrorBoundary functionality
 * This component will throw an error when the button is clicked
 */
export function ErrorTest() {
  const [shouldThrowError, setShouldThrowError] = useState(false);

  if (shouldThrowError) {
    // Intentionally throw an error to test ErrorBoundary
    throw new Error('Test error: ErrorBoundary is working correctly!');
  }

  return (
    <Card className="p-6 max-w-md mx-auto mt-8">
      <h2 className="text-xl font-bold mb-4">Error Boundary Test</h2>
      <p className="text-gray-600 mb-4">
        Click the button below to trigger an error and test the ErrorBoundary component.
      </p>
      <Button
        onClick={() => setShouldThrowError(true)}
        variant="destructive"
      >
        Throw Test Error
      </Button>
    </Card>
  );
}
