/**
 * Coordinates the ipc channel registry runtime for the Electron main process.
 */

const IPC_CHANNELS = require('../../shared/ipcChannels.json');

const IPC_CHANNELS_ARGUMENT_PREFIX = '--windie-ipc-channels=';

function buildPreloadIpcChannelsArgument(channelRegistry = IPC_CHANNELS) {
  return `${IPC_CHANNELS_ARGUMENT_PREFIX}${encodeURIComponent(JSON.stringify(channelRegistry))}`;
}

module.exports = {
  IPC_CHANNELS,
  IPC_CHANNELS_ARGUMENT_PREFIX,
  buildPreloadIpcChannelsArgument,
};
