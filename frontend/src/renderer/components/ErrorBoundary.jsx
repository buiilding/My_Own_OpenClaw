import React from 'react';
import PropTypes from 'prop-types';
import '../styles/ErrorBoundary.css';

/**
 * ErrorBoundary component catches JavaScript errors anywhere in its child component tree,
 * logs those errors, and displays a fallback UI instead of the component tree that crashed.
 *
 * @param {object} props - Component props.
 * @param {React.ReactNode} props.children - The child components to render.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // You can also log the error to an error reporting service
    console.error('Uncaught error in React component tree:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const showErrorDetails = process.env.NODE_ENV === 'development';
      return (
        <div className="error-boundary">
          <h2>Something went wrong.</h2>
          <p>Please restart the app or try the action again. Diagnostic details were written to the application logs.</p>
          {showErrorDetails ? (
            <details>
              {this.state.error && this.state.error.toString()}
              <br />
              {this.state.error?.stack}
            </details>
          ) : null}
        </div>
      );
    }

    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
};

export default ErrorBoundary;
