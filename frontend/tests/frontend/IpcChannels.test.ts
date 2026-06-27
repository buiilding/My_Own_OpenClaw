/**
 * Covers ipc channels. behavior in the frontend test suite.
 */

import sharedIpcChannels from '../../src/shared/ipcChannels.json';
import {
  INVOKE_CHANNELS,
  ON_CHANNELS,
  SEND_CHANNELS,
} from '../../src/renderer/infrastructure/ipc/channels';

describe('renderer IPC channel registry', () => {
  test('exports channel constants from the shared JSON registry', () => {
    expect(SEND_CHANNELS).toEqual(sharedIpcChannels.SEND_CHANNELS);
    expect(INVOKE_CHANNELS).toEqual(sharedIpcChannels.INVOKE_CHANNELS);
    expect(ON_CHANNELS).toEqual(sharedIpcChannels.ON_CHANNELS);
  });
});
