"use strict";
/**
 * Provides the backend socket factory module for the TypeScript SDK runtime.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWindieSdkBackendSocket = exports.createAgentBackendSocket = void 0;
function createAgentBackendSocket({ WebSocketImpl, wsUrl, wsOrigin, headers, }) {
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
exports.createAgentBackendSocket = createAgentBackendSocket;
exports.createWindieSdkBackendSocket = createAgentBackendSocket;
