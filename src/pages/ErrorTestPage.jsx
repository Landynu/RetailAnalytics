import { ErrorTest } from '../components/errors/ErrorTest';

/**
 * ErrorTestPage
 * A page for testing the ErrorBoundary functionality
 * Navigate to /error-test to access this page
 */
export default function ErrorTestPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <ErrorTest />
    </div>
  );
}
