import sharedIpcChannels from '../../frontend/src/shared/ipcChannels.json';
import {
  EXPECTED_SHARED_CHANNEL_REGISTRY,
  INVOKE_CHANNELS,
  ON_CHANNELS,
  SEND_CHANNELS,
  validateSharedChannelRegistry,
} from '../../frontend/src/renderer/infrastructure/ipc/channels';

describe('renderer IPC channel registry', () => {
  test('validates the shared JSON registry before exporting channel constants', () => {
    expect(validateSharedChannelRegistry(sharedIpcChannels)).toEqual(EXPECTED_SHARED_CHANNEL_REGISTRY);
    expect(SEND_CHANNELS).toEqual(EXPECTED_SHARED_CHANNEL_REGISTRY.SEND_CHANNELS);
    expect(INVOKE_CHANNELS).toEqual(EXPECTED_SHARED_CHANNEL_REGISTRY.INVOKE_CHANNELS);
    expect(ON_CHANNELS).toEqual(EXPECTED_SHARED_CHANNEL_REGISTRY.ON_CHANNELS);
  });

  test('rejects missing and drifted channel entries', () => {
    expect(() => validateSharedChannelRegistry({
      ...EXPECTED_SHARED_CHANNEL_REGISTRY,
      INVOKE_CHANNELS: {
        ...EXPECTED_SHARED_CHANNEL_REGISTRY.INVOKE_CHANNELS,
        WINDIE_SEND: undefined,
      },
    })).toThrow(/INVOKE_CHANNELS\.WINDIE_SEND/);

    expect(() => validateSharedChannelRegistry({
      ...EXPECTED_SHARED_CHANNEL_REGISTRY,
      SEND_CHANNELS: {
        ...EXPECTED_SHARED_CHANNEL_REGISTRY.SEND_CHANNELS,
        RENDERER_LOG: 'renamed-renderer-log',
      },
    })).toThrow(/SEND_CHANNELS\.RENDERER_LOG/);

    expect(() => validateSharedChannelRegistry({
      ...EXPECTED_SHARED_CHANNEL_REGISTRY,
      ON_CHANNELS: [],
    })).toThrow(/ON_CHANNELS must be an object/);
  });
});
