/**
 * Preload script for the renderer process.
 * Exposes necessary Node.js/Electron APIs to the sandboxed renderer.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ipc', {
  // Send messages from renderer to main process
  send: (channel, data) => {
    const validChannels = [
      'to-backend',
      'move-chatbox-to',
      'wakeword-audio-chunk',
      'wakeword-enable',
      'wakeword-disable',
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  // Invoke async handlers (returns Promise)
  invoke: (channel, data) => {
    const validChannels = [
      'execute-tool',
      'upload-artifact',
      'get-system-state',
      'store-memory',
      'search-memory',
      'list-conversations',
      'get-conversation',
      'list-semantic-memories',
      'delete-conversation',
      'delete-semantic-memory',
      'store-transcript',
      'get-client-user-id',
      'set-overlay-ignore-mouse',
      'set-chatbox-size',
      'set-responsebox-size',
      'show-main-window',
      'show-chatbox',
      'hide-chatbox',
      'get-displays',
      'load-frontend-config',
      'save-frontend-config',
      'window-minimize',
      'window-toggle-maximize',
      'window-close',
    ];
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    }
    return Promise.reject(new Error(`Invalid invoke channel: ${channel}`));
  },
  // Receive messages from main process
  on: (channel, func) => {
    const validChannels = [
      'from-backend',
      'ipc-status',
      'log',
      'wakeword-detected',
      'wakeword-status',
      'wakeword-toggle',
      'chatbox-focus',
      'response-overlay-phase',
      'response-overlay-visibility',
    ];
    if (validChannels.includes(channel)) {
      // Deliberately strip event as it includes `sender`
      const subscription = (event, ...args) => func(...args);
      ipcRenderer.on(channel, subscription);

      // Return a cleanup function
      return () => ipcRenderer.removeListener(channel, subscription);
    }
  },
  // One-time listener
  once: (channel, func) => {
    const validChannels = [
      'from-backend',
      'ipc-status',
      'log',
      'wakeword-detected',
      'wakeword-status',
      'wakeword-toggle',
      'chatbox-focus',
      'response-overlay-phase',
      'response-overlay-visibility',
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.once(channel, (event, ...args) => func(...args));
    }
  },
});
