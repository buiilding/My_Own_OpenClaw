/**
 * Typed IPC Bridge.
 * Provides type-safe wrappers around window.ipc with channel validation.
 * No React dependencies - pure infrastructure code.
 */

import { SEND_CHANNELS, INVOKE_CHANNELS, ON_CHANNELS, type SendChannel, type InvokeChannel, type OnChannel } from './channels';

/**
 * Type definition for the raw window.ipc interface
 */
interface RawIpcInterface {
  send: (channel: string, data: any) => void;
  invoke: (channel: string, data: any) => Promise<any>;
  on: (channel: string, func: (...args: any[]) => void) => () => void;
  once: (channel: string, func: (...args: any[]) => void) => void;
}

/**
 * Extend Window interface to include ipc
 */
declare global {
  interface Window {
    ipc?: RawIpcInterface;
  }
}

/**
 * Get the raw IPC interface from window
 */
function getRawIpc(): RawIpcInterface {
  if (typeof window === 'undefined' || !window.ipc) {
    throw new Error('window.ipc is not available. Make sure preload.js is loaded.');
  }
  return window.ipc;
}

/**
 * Typed IPC Bridge class.
 * Provides type-safe methods for IPC communication.
 * 
 * Note: Channel validation is already performed in preload.js for security.
 * Runtime validation here is redundant in production but kept for development type safety.
 */
export class IpcBridge {
  // Pre-compute channel sets for O(1) lookup instead of O(n) array search
  // Only validate in development to avoid production overhead
  private static readonly SEND_CHANNEL_SET = new Set(Object.values(SEND_CHANNELS));
  private static readonly INVOKE_CHANNEL_SET = new Set(Object.values(INVOKE_CHANNELS));
  private static readonly ON_CHANNEL_SET = new Set(Object.values(ON_CHANNELS));
  private static readonly IS_DEV = import.meta.env.DEV;

  /**
   * Send a message to the main process (one-way, no response)
   * @param channel - Valid send channel name
   * @param data - Data to send
   */
  static send(channel: SendChannel, data: any): void {
    // Skip validation in production - preload.js already validates for security
    if (IpcBridge.IS_DEV && !IpcBridge.SEND_CHANNEL_SET.has(channel)) {
      throw new Error(`Invalid send channel: ${channel}`);
    }
    getRawIpc().send(channel, data);
  }

  /**
   * Invoke an async handler in the main process (returns Promise)
   * @param channel - Valid invoke channel name
   * @param data - Data to send
   * @returns Promise resolving to the handler's response
   */
  static async invoke<T = any>(channel: InvokeChannel, data?: any): Promise<T> {
    // Skip validation in production - preload.js already validates for security
    if (IpcBridge.IS_DEV && !IpcBridge.INVOKE_CHANNEL_SET.has(channel)) {
      throw new Error(`Invalid invoke channel: ${channel}`);
    }
    return getRawIpc().invoke(channel, data);
  }

  /**
   * Subscribe to messages from the main process
   * @param channel - Valid on channel name
   * @param handler - Function to handle incoming messages
   * @returns Cleanup function to unsubscribe
   */
  static on(channel: OnChannel, handler: (...args: any[]) => void): () => void {
    // Skip validation in production - preload.js already validates for security
    if (IpcBridge.IS_DEV && !IpcBridge.ON_CHANNEL_SET.has(channel)) {
      throw new Error(`Invalid on channel: ${channel}`);
    }
    return getRawIpc().on(channel, handler);
  }

  /**
   * Subscribe to a one-time message from the main process
   * @param channel - Valid on channel name
   * @param handler - Function to handle the message
   */
  static once(channel: OnChannel, handler: (...args: any[]) => void): void {
    // Skip validation in production - preload.js already validates for security
    if (IpcBridge.IS_DEV && !IpcBridge.ON_CHANNEL_SET.has(channel)) {
      throw new Error(`Invalid on channel: ${channel}`);
    }
    getRawIpc().once(channel, handler);
  }
}

/**
 * Export channel constants for convenience
 */
export { SEND_CHANNELS, INVOKE_CHANNELS, ON_CHANNELS };
