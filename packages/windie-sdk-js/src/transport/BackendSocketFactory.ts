/**
 * Provides the backend socket factory module for the TypeScript SDK runtime.
 */

import type { WebSocketConstructor, WebSocketLike } from './WindieAgentSession.js';

export type WindieSdkBackendSocketOptions = {
  WebSocketImpl: WebSocketConstructor;
  wsUrl: string;
  wsOrigin?: string;
  headers?: Record<string, string>;
};

export function createWindieSdkBackendSocket({
  WebSocketImpl,
  wsUrl,
  wsOrigin,
  headers,
}: WindieSdkBackendSocketOptions): WebSocketLike {
  if (!WebSocketImpl) {
    throw new Error('createWindieSdkBackendSocket requires WebSocketImpl');
  }
  if (!wsUrl) {
    throw new Error('createWindieSdkBackendSocket requires wsUrl');
  }
  return new WebSocketImpl(wsUrl, {
    origin: wsOrigin,
    headers: headers || {},
  });
}
