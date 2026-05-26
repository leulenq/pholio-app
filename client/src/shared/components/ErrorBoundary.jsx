import React from 'react';
import { ErrorStateCard } from './states';

/**
 * Error Boundary — catches render errors and shows the shared page-level pattern.
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
    console.error('ErrorBoundary caught an error:', error, errorInfo);
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
            eyebrow="Unexpected issue"
            title="Something went wrong"
            body="We hit an unexpected error. Your data is safe — try again or reload the page."
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
