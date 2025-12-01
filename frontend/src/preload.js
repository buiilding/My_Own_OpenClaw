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
      'wakeword-audio-chunk',
      'wakeword-enable',
      'wakeword-disable',
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  // Receive messages from main process
  on: (channel, func) => {
    const validChannels = [
      'from-backend',
      'ipc-status',
      'log',
      'wakeword-detected',
      'wakeword-status',
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
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.once(channel, (event, ...args) => func(...args));
    }
  },
});
