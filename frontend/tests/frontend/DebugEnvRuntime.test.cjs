/** @jest-environment node */

const {
  configureDebugEnvRuntime,
  isDebugFlagEnabled,
  isExactDebugFlagEnabled,
  resolveDebugEnvConfig,
} = require('../../src/main/app/debug_env.cjs');

const SAMPLE_DEBUG_ENV = Object.freeze({
  env: Object.freeze({
    streamEvents: 'SAMPLE_DEBUG_STREAM_EVENTS',
    toolScreenshot: 'SAMPLE_DEBUG_TOOL_SCREENSHOT',
    liveSurface: 'SAMPLE_DEBUG_LIVE_SURFACE',
    scriptedProvider: 'SAMPLE_ENABLE_SCRIPTED_PROVIDER',
  }),
});

describe('main debug env runtime', () => {
  afterEach(() => {
    configureDebugEnvRuntime();
  });

  test('uses generic debug env defaults', () => {
    expect(resolveDebugEnvConfig()).toMatchObject({
      streamEvents: 'AGENT_DEBUG_STREAM_EVENTS',
      toolScreenshot: 'AGENT_DEBUG_TOOL_SCREENSHOT',
      liveSurface: 'AGENT_DEBUG_LIVE_SURFACE',
      ipcStdout: 'AGENT_DEBUG_IPC_STDOUT',
      scriptedProvider: 'AGENT_ENABLE_SCRIPTED_PROVIDER',
    });
    expect(isDebugFlagEnabled('streamEvents', {
      AGENT_DEBUG_STREAM_EVENTS: '1',
    })).toBe(true);
    expect(isDebugFlagEnabled('streamEvents', {
      WINDIE_DEBUG_STREAM_EVENTS: '1',
    })).toBe(false);
  });

  test('uses configured host debug env names', () => {
    configureDebugEnvRuntime(SAMPLE_DEBUG_ENV);

    expect(isDebugFlagEnabled('streamEvents', {
      SAMPLE_DEBUG_STREAM_EVENTS: '1',
    })).toBe(true);
    expect(isDebugFlagEnabled('toolScreenshot', {
      SAMPLE_DEBUG_TOOL_SCREENSHOT: 'true',
    })).toBe(true);
    expect(isDebugFlagEnabled('liveSurface', {
      SAMPLE_DEBUG_LIVE_SURFACE: '0',
    })).toBe(false);
    expect(isDebugFlagEnabled('scriptedProvider', {
      SAMPLE_ENABLE_SCRIPTED_PROVIDER: '1',
    })).toBe(true);
    expect(isExactDebugFlagEnabled('scriptedProvider', '1', {
      SAMPLE_ENABLE_SCRIPTED_PROVIDER: 'true',
    })).toBe(false);
    expect(isExactDebugFlagEnabled('scriptedProvider', '1', {
      SAMPLE_ENABLE_SCRIPTED_PROVIDER: '1',
    })).toBe(true);
  });
});
