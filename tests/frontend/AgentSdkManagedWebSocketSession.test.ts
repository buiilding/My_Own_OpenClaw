/**
 * Covers Agent SDK managed websocket session behavior in the frontend test suite.
 */

import { EventEmitter } from 'events';

import {
  createManagedWebSocketSession,
} from '../../packages/windie-sdk-js/src/transport/ManagedWebSocketSession';

class FakeSocket extends EventEmitter {
  readyState = 0;
  sent: string[] = [];

  send(message: string): void {
    this.sent.push(message);
  }

  close(): void {
    this.readyState = 3;
    this.emit('close');
  }

  open(): void {
    this.readyState = 1;
    this.emit('open');
  }
}

class ThrowingSocket extends FakeSocket {
  send(_message: string): void {
    throw new Error('handshake send failed');
  }
}

describe('ManagedWebSocketSession', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  test('owns handshake, typed sends, and backend event parsing', async () => {
    const socket = new FakeSocket();
    const onEvent = jest.fn();
    const session = createManagedWebSocketSession({
      createSocket: () => socket,
      createMessageId: () => 'msg-1',
      getUserId: () => 'user-1',
      buildHandshake: () => ({ type: 'handshake', user_id: 'user-1' }),
      onEvent,
    });

    const connected = session.ensureConnected({ timeoutMs: 100 });
    socket.open();
    await connected;

    expect(JSON.parse(socket.sent[0])).toEqual({ type: 'handshake', user_id: 'user-1' });
    expect(session.sendQuery({ text: 'hello' })).toBe('msg-1');
    expect(session.sendToolResult({ request_id: 'req-1', success: true })).toBe('msg-1');
    expect(JSON.parse(socket.sent[1])).toMatchObject({
      id: 'msg-1',
      type: 'query',
      payload: { text: 'hello' },
      user_id: 'user-1',
    });
    expect(JSON.parse(socket.sent[2])).toMatchObject({
      id: 'msg-1',
      type: 'tool-result',
      payload: { request_id: 'req-1', success: true },
      user_id: 'user-1',
    });

    socket.emit('message', JSON.stringify({
      type: 'streaming-response',
      payload: { text: 'chunk' },
      conversation_ref: 'conv-1',
    }));
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'streaming-response',
      conversation_ref: 'conv-1',
    }));
  });

  test('rejects sends without an open socket or user id', async () => {
    const socket = new FakeSocket();
    const session = createManagedWebSocketSession({
      createSocket: () => socket,
      getUserId: () => null,
      buildHandshake: () => ({ type: 'handshake' }),
    });

    expect(session.sendQuery({ text: 'closed' })).toBeNull();
    const connected = session.ensureConnected({ timeoutMs: 100 });
    socket.open();
    await connected;
    expect(session.sendQuery({ text: 'missing user' })).toBeNull();
  });

  test('runs before-connect hooks and reconnects after an unexpected close', async () => {
    jest.useFakeTimers();
    try {
      const sockets = [new FakeSocket(), new FakeSocket()];
      const beforeConnect = jest.fn(async () => {});
      const onClose = jest.fn();
      const onSocketChange = jest.fn();
      const session = createManagedWebSocketSession({
        createSocket: () => sockets.shift() as FakeSocket,
        reconnectIntervalMs: 25,
        createMessageId: () => 'msg-1',
        getUserId: () => 'user-1',
        buildHandshake: () => ({ type: 'handshake', user_id: 'user-1' }),
        beforeConnect,
        onClose,
        onSocketChange,
      });

      const connected = session.ensureConnected({ reason: 'query', timeoutMs: 1000 });
      await Promise.resolve();
      expect(beforeConnect).toHaveBeenCalledWith({ reason: 'query' });
      const firstSocket = session.getSocket() as FakeSocket;
      firstSocket.open();
      await connected;

      firstSocket.close();
      expect(onSocketChange).toHaveBeenLastCalledWith(null);
      expect(onClose).toHaveBeenCalledWith(expect.objectContaining({
        closeReason: null,
        shouldReconnect: true,
        reconnectScheduled: false,
      }));

      jest.advanceTimersByTime(25);
      expect(session.getSocket()).not.toBe(firstSocket);
    } finally {
      jest.useRealTimers();
    }
  });

  test('falls back to the next endpoint after a pre-open socket error', async () => {
    const firstSocket = new FakeSocket();
    const secondSocket = new FakeSocket();
    const onFallback = jest.fn();
    const session = createManagedWebSocketSession({
      createSocket: jest.fn()
        .mockReturnValueOnce(firstSocket)
        .mockReturnValueOnce(secondSocket),
      getUserId: () => 'user-1',
      buildHandshake: () => ({ type: 'handshake', user_id: 'user-1' }),
      advanceEndpoint: jest.fn().mockReturnValueOnce(true),
      onFallback,
    });

    session.connect({ force: true });
    firstSocket.emit('error', new Error('connect failed'));

    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(session.getSocket()).toBe(secondSocket);
  });

  test('clears socket and reconnects fresh when handshake construction fails', async () => {
    const firstSocket = new FakeSocket();
    const secondSocket = new FakeSocket();
    const onHandshakeError = jest.fn();
    const onSocketChange = jest.fn();
    const createSocket = jest.fn()
      .mockReturnValueOnce(firstSocket)
      .mockReturnValueOnce(secondSocket);
    const buildHandshake = jest.fn()
      .mockImplementationOnce(() => {
        throw new Error('handshake build failed');
      })
      .mockReturnValueOnce({ type: 'handshake', user_id: 'user-1' });
    const session = createManagedWebSocketSession({
      createSocket,
      getUserId: () => 'user-1',
      buildHandshake,
      onHandshakeError,
      onSocketChange,
    });

    const firstConnect = session.ensureConnected({ reason: 'first', timeoutMs: 100 });
    firstSocket.open();

    await expect(firstConnect).rejects.toThrow('handshake build failed');
    expect(onHandshakeError).toHaveBeenCalledWith(expect.any(Error));
    expect(firstSocket.readyState).toBe(3);
    expect(session.getSocket()).toBeNull();
    expect(session.isOpen()).toBe(false);
    expect(onSocketChange).toHaveBeenLastCalledWith(null);

    const secondConnect = session.ensureConnected({ reason: 'second', timeoutMs: 100 });
    secondSocket.open();
    await secondConnect;

    expect(createSocket).toHaveBeenCalledTimes(2);
    expect(JSON.parse(secondSocket.sent[0])).toEqual({ type: 'handshake', user_id: 'user-1' });
    expect(session.getSocket()).toBe(secondSocket);
    expect(session.isOpen()).toBe(true);
  });

  test('closes and clears socket when handshake send fails', async () => {
    const socket = new ThrowingSocket();
    const onHandshakeError = jest.fn();
    const onSocketChange = jest.fn();
    const session = createManagedWebSocketSession({
      createSocket: () => socket,
      getUserId: () => 'user-1',
      buildHandshake: () => ({ type: 'handshake', user_id: 'user-1' }),
      onHandshakeError,
      onSocketChange,
    });

    const connected = session.ensureConnected({ reason: 'send-failure', timeoutMs: 100 });
    socket.open();

    await expect(connected).rejects.toThrow('handshake send failed');
    expect(onHandshakeError).toHaveBeenCalledWith(expect.any(Error));
    expect(socket.readyState).toBe(3);
    expect(session.getSocket()).toBeNull();
    expect(session.isOpen()).toBe(false);
    expect(onSocketChange).toHaveBeenLastCalledWith(null);
  });
});
