/** @jest-environment node */

const {
  configureDebugEnvRuntime,
  isDebugFlagEnabled,
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
  });
});
