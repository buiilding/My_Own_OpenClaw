/**
 * Preload script for the renderer process.
 * Exposes necessary Node.js/Electron APIs to the sandboxed renderer.
 */

const fs = require('node:fs');
const path = require('node:path');
const { contextBridge, ipcRenderer } = require('electron');

function loadIpcChannels() {
  const registryPath = path.join(__dirname, 'shared', 'ipcChannels.json');
  return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
}

const { SEND_CHANNELS, INVOKE_CHANNELS, ON_CHANNELS } = loadIpcChannels();

const VALID_SEND_CHANNELS = new Set(Object.values(SEND_CHANNELS));
const VALID_INVOKE_CHANNELS = new Set(Object.values(INVOKE_CHANNELS));
const VALID_ON_CHANNELS = new Set(Object.values(ON_CHANNELS));

contextBridge.exposeInMainWorld('ipc', {
  // Send messages from renderer to main process
  send: (channel, data) => {
    if (VALID_SEND_CHANNELS.has(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  // Invoke async handlers (returns Promise)
  invoke: (channel, data) => {
    if (VALID_INVOKE_CHANNELS.has(channel)) {
      return ipcRenderer.invoke(channel, data);
    }
    return Promise.reject(new Error(`Invalid invoke channel: ${channel}`));
  },
  // Receive messages from main process
  on: (channel, func) => {
    if (VALID_ON_CHANNELS.has(channel)) {
      // Deliberately strip event as it includes `sender`
      const subscription = (event, ...args) => func(...args);
      ipcRenderer.on(channel, subscription);

      // Return a cleanup function
      return () => ipcRenderer.removeListener(channel, subscription);
    }
  },
  // One-time listener
  once: (channel, func) => {
    if (VALID_ON_CHANNELS.has(channel)) {
      ipcRenderer.once(channel, (event, ...args) => func(...args));
    }
  },
});
