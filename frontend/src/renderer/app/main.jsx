import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ChatBoxApp from './ChatBoxApp';

// This is the standard entry point for a React application.
// StrictMode causes double rendering in development - disable in production for performance
const isDev = import.meta.env.DEV;
const root = ReactDOM.createRoot(document.getElementById('root'));
const view = new URLSearchParams(window.location.search).get('view');
const RootComponent = view === 'chatbox' ? ChatBoxApp : App;

if (isDev) {
  root.render(
    <React.StrictMode>
      <RootComponent />
    </React.StrictMode>
  );
} else {
  root.render(<RootComponent />);
}
