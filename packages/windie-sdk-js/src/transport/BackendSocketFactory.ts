/**
 * Provides the backend socket factory module for the TypeScript SDK runtime.
 */

import type { WebSocketConstructor, WebSocketLike } from './AgentSession.js';

export type AgentBackendSocketOptions = {
  WebSocketImpl: WebSocketConstructor;
  wsUrl: string;
  wsOrigin?: string;
  headers?: Record<string, string>;
};

export function createAgentBackendSocket({
  WebSocketImpl,
  wsUrl,
  wsOrigin,
  headers,
}: AgentBackendSocketOptions): WebSocketLike {
  if (!WebSocketImpl) {
    throw new Error('Agent SDK backend socket requires WebSocketImpl');
  }
  if (!wsUrl) {
    throw new Error('Agent SDK backend socket requires wsUrl');
  }
  return new WebSocketImpl(wsUrl, {
    origin: wsOrigin,
    headers: headers || {},
  });
}
