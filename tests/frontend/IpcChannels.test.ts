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
        SEND_CHAT_QUERY: undefined,
      },
    })).toThrow(/INVOKE_CHANNELS\.SEND_CHAT_QUERY/);

    expect(() => validateSharedChannelRegistry({
      ...EXPECTED_SHARED_CHANNEL_REGISTRY,
      SEND_CHANNELS: {
        ...EXPECTED_SHARED_CHANNEL_REGISTRY.SEND_CHANNELS,
        TO_BACKEND: 'renamed-to-backend',
      },
    })).toThrow(/SEND_CHANNELS\.TO_BACKEND/);

    expect(() => validateSharedChannelRegistry({
      ...EXPECTED_SHARED_CHANNEL_REGISTRY,
      ON_CHANNELS: [],
    })).toThrow(/ON_CHANNELS must be an object/);
  });
});
