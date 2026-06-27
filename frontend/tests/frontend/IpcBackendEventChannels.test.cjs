/**
 * Covers ipc backend event channels. behavior in the frontend test suite.
 */

const {
  broadcastTypedBackendEvent,
} = require('../../src/main/ipc/ipc_backend_event_channels.cjs');

function expectBroadcastChannels(event, channels) {
  const broadcastToRenderers = jest.fn();

  broadcastTypedBackendEvent(event, broadcastToRenderers);

  expect(broadcastToRenderers.mock.calls.map(([channel]) => channel)).toEqual(channels);
  for (const channel of channels) {
    expect(broadcastToRenderers).toHaveBeenCalledWith(channel, event);
  }
}

describe('ipc backend event typed renderer channels', () => {
  test('routes settings and model control events to settings channel', () => {
    expectBroadcastChannels({ type: 'models-listed' }, ['backend-settings-event']);
    expectBroadcastChannels({ type: 'settings-updated' }, ['backend-settings-event']);
    expectBroadcastChannels({ type: 'error' }, ['backend-settings-event']);
  });

  test('routes agent capability and audio side-channel events to named channels', () => {
    expectBroadcastChannels({ type: 'client-tool-manifest' }, ['agent-capability-event']);
    expectBroadcastChannels({ type: 'remote-tool-catalog' }, ['agent-capability-event']);
    expectBroadcastChannels({ type: 'audio-chunk' }, ['audio-chunk']);
  });

  test('ignores chat stream events so SDK projection remains the live-state path', () => {
    expectBroadcastChannels({ type: 'streaming-response' }, []);
    expectBroadcastChannels({ type: 'tool-call' }, []);
    expectBroadcastChannels({ type: 'streaming-complete' }, []);
  });

  test('broadcasts each typed channel with the original payload', () => {
    const broadcastToRenderers = jest.fn();
    const event = {
      type: 'remote-tool-catalog',
      payload: { remote_tools: [{ name: 'web_search' }] },
    };

    broadcastTypedBackendEvent(event, broadcastToRenderers);

    expect(broadcastToRenderers).toHaveBeenCalledWith('agent-capability-event', event);
  });
});
