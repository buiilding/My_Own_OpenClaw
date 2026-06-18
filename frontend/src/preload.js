/**
 * Preload script for the renderer process.
 * Exposes necessary Node.js/Electron APIs to the sandboxed renderer.
 */

const { contextBridge, ipcRenderer } = require('electron');

const IPC_CHANNELS_ARGUMENT_PREFIX = '--desktop-runtime-ipc-channels=';

function loadIpcChannels(argv = process.argv) {
  const serializedRegistry = argv.find(
    (value) => typeof value === 'string' && value.startsWith(IPC_CHANNELS_ARGUMENT_PREFIX),
  );

  if (!serializedRegistry) {
    throw new Error('Missing preload IPC channel registry argument');
  }

  return JSON.parse(decodeURIComponent(
    serializedRegistry.slice(IPC_CHANNELS_ARGUMENT_PREFIX.length),
  ));
}

const { SEND_CHANNELS, INVOKE_CHANNELS, ON_CHANNELS } = loadIpcChannels();

const VALID_SEND_CHANNELS = new Set(Object.values(SEND_CHANNELS));
const VALID_INVOKE_CHANNELS = new Set(Object.values(INVOKE_CHANNELS));
const VALID_ON_CHANNELS = new Set(Object.values(ON_CHANNELS));

const DESKTOP_RUNTIME_INVOKE_CHANNELS = Object.freeze({
  INVOKE: INVOKE_CHANNELS.DESKTOP_RUNTIME_INVOKE,
});

contextBridge.exposeInMainWorld('ipc', {
  // Send messages from renderer to main process
  send: (channel, data) => {
    if (VALID_SEND_CHANNELS.has(channel)) {
      ipcRenderer.send(channel, data);
      return;
    }
    throw new Error(`Invalid send channel: ${channel}`);
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
      // Deliberately strip event as it includes `sender`
      const subscription = (event, ...args) => func(...args);
      ipcRenderer.once(channel, subscription);

      // Return a cleanup function
      return () => ipcRenderer.removeListener(channel, subscription);
    }
  },
});

const agentSdkCommandBridge = {
  invoke: (command, payload) => {
    if (typeof command !== 'string' || !command.trim()) {
      return Promise.reject(new Error('Invalid Agent SDK command'));
    }
    if (!VALID_INVOKE_CHANNELS.has(DESKTOP_RUNTIME_INVOKE_CHANNELS.INVOKE)) {
      return Promise.reject(new Error('Agent SDK invoke channel is not available'));
    }
    return ipcRenderer.invoke(DESKTOP_RUNTIME_INVOKE_CHANNELS.INVOKE, {
      command,
      payload: payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload
      : {},
    });
  },
};

contextBridge.exposeInMainWorld('agentSdk', agentSdkCommandBridge);
