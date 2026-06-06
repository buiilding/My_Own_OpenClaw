/** @jest-environment node */

const {
  isLiveSurfaceTraceEnabled,
  logLiveSurfaceTrace,
  summarizeCurrentTurn,
} = require('../../frontend/src/main/live_surface_trace_runtime.cjs');

describe('live_surface_trace_runtime', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.WINDIE_DEBUG_LIVE_SURFACE;
    delete process.env.WINDIE_DEV_UI;
    delete process.env.WINDIE_DEBUG_CHAT_PILL;
    delete process.env.WINDIE_DEBUG_STREAM_EVENTS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('enables trace in dev UI mode', () => {
    process.env.WINDIE_DEV_UI = '1';

    expect(isLiveSurfaceTraceEnabled()).toBe(true);
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
    process.env.WINDIE_DEBUG_LIVE_SURFACE = '1';
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
});
