import React from 'react';
import { ErrorStateCard } from './states';
import { reportReactError } from '../lib/error-monitoring';

/**
 * Error Boundary — catches render errors and shows the shared page-level pattern.
 * Production shows only recovery copy; technical details are reported, not rendered.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    reportReactError(error, errorInfo, {
      boundary: this.props.boundary || 'shared',
    });
    this.setState({ error, errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="ph-error-boundary">
          <ErrorStateCard
            variant="page"
            context="crash"
            severity="error"
            title="Something went wrong"
            body="We couldn't display this page. Try again, or reload the page."
            retry={{ label: 'Try again', onClick: this.handleReset }}
            secondaryAction={{
              label: 'Reload page',
              onClick: this.handleReload,
            }}
            supportingMeta={
              import.meta.env.DEV && this.state.error
                ? this.state.error.toString()
                : undefined
            }
          />
          {import.meta.env.DEV && this.state.errorInfo && (
            <details className="ph-error-boundary__details">
              <summary>Error details</summary>
              <pre>
                {this.state.error?.toString()}
                {this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
