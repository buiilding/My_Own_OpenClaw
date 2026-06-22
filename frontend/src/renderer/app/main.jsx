/**
 * Provides the main module for the renderer UI.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import MinimalChatPillApp from './MinimalChatPillApp';
import MinimalResponseOverlayApp from './MinimalResponseOverlayApp';
import ToolGhostDebugApp from './ToolGhostDebugApp';
import { DesktopInteractionRuntimeClient } from './runtime/desktopInteractionRuntimeClient';
import { DesktopStartupRuntimeClient } from './runtime/desktopStartupRuntimeClient';

// This is the standard entry point for a React application.
// StrictMode causes double rendering in development - disable in production for performance
const isDev = import.meta.env.DEV;
DesktopInteractionRuntimeClient.installInteractionLogger();
const root = ReactDOM.createRoot(document.getElementById('root'));
const view = DesktopStartupRuntimeClient.getRendererEntrypointView();
const RootComponent = view === 'minimal-chat-pill'
  ? MinimalChatPillApp
  : view === 'minimal-response-overlay'
    ? MinimalResponseOverlayApp
    : view === 'tool-ghost-debug'
      ? ToolGhostDebugApp
      : App;

if (isDev) {
  root.render(
    <React.StrictMode>
      <RootComponent />
    </React.StrictMode>
  );
} else {
  root.render(<RootComponent />);
}
