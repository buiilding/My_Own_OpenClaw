function createWindieSdkBackendSocket({
  WebSocketImpl,
  wsUrl,
  wsOrigin,
  headers,
} = {}) {
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

module.exports = {
  createWindieSdkBackendSocket,
};
