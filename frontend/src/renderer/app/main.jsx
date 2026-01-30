import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// This is the standard entry point for a React application.
// StrictMode causes double rendering in development - disable in production for performance
const isDev = import.meta.env.DEV;
const root = ReactDOM.createRoot(document.getElementById('root'));

if (isDev) {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  root.render(<App />);
}
