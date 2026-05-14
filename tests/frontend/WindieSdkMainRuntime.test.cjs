const { EventEmitter } = require('events');
const { createWindieSdkMainRuntime } = require('../../frontend/src/main/windie_sdk_runtime.cjs');

class FakeWebSocket extends EventEmitter {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances = [];

  constructor(url, options) {
    super();
    this.url = url;
    this.options = options;
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }

  send(message) {
    this.sent.push(message);
  }

  close() {
    this.readyState = 3;
    this.emit('close');
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open');
  }
}

describe('Windie SDK main runtime', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
  });

  test('owns backend websocket handshake and envelope sends for Electron main', async () => {
    const opened = jest.fn();
    const runtime = createWindieSdkMainRuntime({
      WebSocketImpl: FakeWebSocket,
      createMessageId: () => 'msg-1',
      getEndpoint: () => ({ wsUrl: 'wss://api.windieos.com/ws', wsOrigin: 'app://windie' }),
      getHeaders: () => ({ authorization: 'Bearer install-token' }),
      shouldConnect: () => true,
      buildHandshake: async () => ({ type: 'handshake', user_id: 'dev-user' }),
      onOpen: opened,
    });

    runtime.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    await Promise.resolve();

    expect(socket.url).toBe('wss://api.windieos.com/ws');
    expect(socket.options.headers.authorization).toBe('Bearer install-token');
    expect(JSON.parse(socket.sent[0])).toEqual({ type: 'handshake', user_id: 'dev-user' });
    expect(opened).toHaveBeenCalled();
    expect(runtime.sendEnvelope({
      type: 'query',
      payload: { text: 'hello' },
      userId: 'dev-user',
    })).toBe('msg-1');
    expect(JSON.parse(socket.sent[1])).toMatchObject({
      id: 'msg-1',
      type: 'query',
      payload: { text: 'hello' },
      user_id: 'dev-user',
    });
  });
});
