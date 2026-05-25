const {
  broadcastTypedBackendEvent,
  getRendererChannelsForBackendEvent,
} = require('../../frontend/src/main/ipc/ipc_backend_event_channels.cjs');

describe('ipc backend event typed renderer channels', () => {
  test('routes settings and model control events to settings channel', () => {
    expect(getRendererChannelsForBackendEvent({ type: 'models-listed' })).toEqual([
      'backend-settings-event',
    ]);
    expect(getRendererChannelsForBackendEvent({ type: 'settings-updated' })).toEqual([
      'backend-settings-event',
    ]);
    expect(getRendererChannelsForBackendEvent({ type: 'error' })).toEqual([
      'backend-settings-event',
    ]);
  });

  test('routes agent capability and audio side-channel events to named channels', () => {
    expect(getRendererChannelsForBackendEvent({ type: 'client-tool-manifest' })).toEqual([
      'agent-capability-event',
    ]);
    expect(getRendererChannelsForBackendEvent({ type: 'remote-tool-catalog' })).toEqual([
      'agent-capability-event',
    ]);
    expect(getRendererChannelsForBackendEvent({ type: 'audio-chunk' })).toEqual([
      'audio-chunk',
    ]);
  });

  test('ignores chat stream events so SDK projection remains the live-state path', () => {
    expect(getRendererChannelsForBackendEvent({ type: 'streaming-response' })).toEqual([]);
    expect(getRendererChannelsForBackendEvent({ type: 'tool-call' })).toEqual([]);
    expect(getRendererChannelsForBackendEvent({ type: 'streaming-complete' })).toEqual([]);
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
