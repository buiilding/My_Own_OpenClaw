/** @jest-environment node */

const {
  handleRendererLiveSurfaceTrace,
  logLiveSurfaceTrace,
  summarizeCurrentTurn,
} = require('../../src/main/debug/live_surface_trace_runtime.cjs');
const {
  configureDebugEnvRuntime,
} = require('../../src/main/app/debug_env.cjs');

const sampleDebugConfig = Object.freeze({
  env: Object.freeze({
    chatPill: 'SAMPLE_DEBUG_CHAT_PILL',
    devUi: 'SAMPLE_DEV_UI',
    liveSurface: 'SAMPLE_DEBUG_LIVE_SURFACE',
    streamEvents: 'SAMPLE_DEBUG_STREAM_EVENTS',
  }),
});

describe('live_surface_trace_runtime', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    configureDebugEnvRuntime(sampleDebugConfig);
    delete process.env.SAMPLE_DEBUG_LIVE_SURFACE;
    delete process.env.SAMPLE_DEV_UI;
    delete process.env.SAMPLE_DEBUG_CHAT_PILL;
    delete process.env.SAMPLE_DEBUG_STREAM_EVENTS;
  });

  afterEach(() => {
    configureDebugEnvRuntime();
    process.env = originalEnv;
  });

  test('does not enable trace from dev UI mode alone', () => {
    process.env.SAMPLE_DEV_UI = '1';
    const log = jest.fn();

    logLiveSurfaceTrace('typing.show', {}, { log });

    expect(log).not.toHaveBeenCalled();
  });

  test('enables trace through the explicit live surface flag', () => {
    process.env.SAMPLE_DEBUG_LIVE_SURFACE = '1';
    const log = jest.fn();

    logLiveSurfaceTrace('typing.show', {}, { log });

    expect(log).toHaveBeenCalledWith('[LiveSurfaceTrace]', expect.objectContaining({
      event: 'typing.show',
    }));
  });

  test('summarizes current turn without raw text content', () => {
    const summary = summarizeCurrentTurn({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'streaming',
      assistantText: 'private assistant text',
      reasoningText: 'private reasoning',
      toolEvents: [{ id: 'tool-1' }],
      presentation: {
        typingVisible: false,
        overlayVisible: true,
        hasVisibleContent: true,
        entries: [{ id: 'entry-1', text: 'private rendered text' }],
        overlayIntent: {
          mode: 'response',
          staleGuardRef: 'turn-1',
        },
      },
    });

    expect(summary).toEqual(expect.objectContaining({
      conversationRef: 'conv-1',
      turnRef: 'turn-1',
      phase: 'streaming',
      overlayMode: 'response',
      guardRef: 'turn-1',
      assistantLength: 22,
      reasoningLength: 17,
      entryCount: 1,
      toolEventCount: 1,
    }));
    expect(JSON.stringify(summary)).not.toContain('private assistant text');
    expect(JSON.stringify(summary)).not.toContain('private rendered text');
  });

  test('logs normalized event payload when enabled', () => {
    process.env.SAMPLE_DEBUG_LIVE_SURFACE = '1';
    const log = jest.fn();

    logLiveSurfaceTrace('typing.show', {
      turnRef: 'turn-1',
      ignored: undefined,
    }, {
      log,
      processName: 'main',
    });

    expect(log).toHaveBeenCalledWith('[LiveSurfaceTrace]', expect.objectContaining({
      process: 'main',
      event: 'typing.show',
      turnRef: 'turn-1',
    }));
    expect(log.mock.calls[0][1]).not.toHaveProperty('ignored');
  });

  test('normalizes renderer trace payload without raw content', () => {
    process.env.SAMPLE_DEBUG_LIVE_SURFACE = '1';
    const log = jest.fn();

    expect(handleRendererLiveSurfaceTrace({
      event: 'renderer.overlay_view_model.resolved',
      process: 'main',
      ts: '2026-06-06T00:00:00.000Z',
      view: 'minimal-response-overlay',
      activeConversationRef: 'conv-1',
      messageText: 'private message',
      assistantText: 'private assistant',
      content: 'private content',
      textLength: 15,
      hasVisibleContent: true,
      entries: [{ text: 'private row' }],
      lastMessage: {
        sender: 'assistant',
        textLength: 9,
        text: 'private nested row',
      },
    }, { log })).toBe(true);

    const normalized = log.mock.calls[0][1];
    expect(normalized).toEqual(expect.objectContaining({
      process: 'renderer',
      event: 'renderer.overlay_view_model.resolved',
      view: 'minimal-response-overlay',
      activeConversationRef: 'conv-1',
      textLength: 15,
      hasVisibleContent: true,
      entries: { count: 1 },
      messageText: '[redacted:string:15]',
      assistantText: '[redacted:string:17]',
      content: '[redacted:string:15]',
      lastMessage: expect.objectContaining({
        sender: 'assistant',
        textLength: 9,
        text: '[redacted:string:18]',
      }),
    }));
    expect(JSON.stringify(normalized)).not.toContain('private');
    expect(normalized.ts).not.toBe('2026-06-06T00:00:00.000Z');
  });

  test('forwards renderer trace to the live surface logger', () => {
    process.env.SAMPLE_DEBUG_LIVE_SURFACE = '1';
    const log = jest.fn();

    expect(handleRendererLiveSurfaceTrace({
      event: 'typing.show',
      view: 'minimal-chat-pill',
      process: 'renderer',
      messageText: 'private message',
    }, { log })).toBe(true);

    expect(log).toHaveBeenCalledWith('[LiveSurfaceTrace]', expect.objectContaining({
      process: 'renderer',
      event: 'typing.show',
      view: 'minimal-chat-pill',
      messageText: '[redacted:string:15]',
    }));
  });

  test('ignores invalid renderer trace payloads', () => {
    expect(handleRendererLiveSurfaceTrace(null)).toBe(false);
    expect(handleRendererLiveSurfaceTrace([])).toBe(false);
  });
});
