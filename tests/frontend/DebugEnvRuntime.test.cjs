/** @jest-environment node */

const {
  configureDebugEnvRuntime,
  isDebugFlagEnabled,
  isExactDebugFlagEnabled,
  resolveDebugEnvConfig,
} = require('../../frontend/src/main/app/debug_env.cjs');
const {
  mainHostSkin,
} = require('../../frontend/src/main/app/main_host_skin.cjs');

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

  test('uses configured WindieOS debug env names from host skin', () => {
    configureDebugEnvRuntime(mainHostSkin.debug);

    expect(isDebugFlagEnabled('streamEvents', {
      WINDIE_DEBUG_STREAM_EVENTS: '1',
    })).toBe(true);
    expect(isDebugFlagEnabled('toolScreenshot', {
      WINDIE_DEBUG_TOOL_SCREENSHOT: 'true',
    })).toBe(true);
    expect(isDebugFlagEnabled('liveSurface', {
      WINDIE_DEBUG_LIVE_SURFACE: '0',
    })).toBe(false);
    expect(isDebugFlagEnabled('scriptedProvider', {
      WINDIE_ENABLE_SCRIPTED_PROVIDER: '1',
    })).toBe(true);
    expect(isExactDebugFlagEnabled('scriptedProvider', '1', {
      WINDIE_ENABLE_SCRIPTED_PROVIDER: 'true',
    })).toBe(false);
    expect(isExactDebugFlagEnabled('scriptedProvider', '1', {
      WINDIE_ENABLE_SCRIPTED_PROVIDER: '1',
    })).toBe(true);
  });
});
