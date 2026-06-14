/**
 * Provides the backend socket factory module for the committed JavaScript SDK runtime.
 */

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWindieSdkBackendSocket = createWindieSdkBackendSocket;
function createWindieSdkBackendSocket({ WebSocketImpl, wsUrl, wsOrigin, headers, }) {
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
