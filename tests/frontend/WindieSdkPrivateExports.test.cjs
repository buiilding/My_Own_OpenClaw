/** @jest-environment node */

describe('@windie/sdk private helper exports', () => {
  test('transport module keeps websocket URL normalization private', () => {
    const sessionModule = require('../../packages/windie-sdk-js/cjs/transport/WindieAgentSession.js');

    expect(sessionModule.createWindieAgentSession).toBeDefined();
    expect(sessionModule.deriveWsUrl).toBeDefined();
    expect(sessionModule.normalizeWsUrl).toBeUndefined();
  });

  test('compacted replay store module exports only the public snapshot helper', () => {
    const replayModule = require('../../packages/windie-sdk-js/cjs/stores/compactedReplayEvents.js');

    expect(replayModule.latestCompactedReplayFromEvents).toBeDefined();
    expect(replayModule.compactedReplayFromEvent).toBeUndefined();
  });

  test('capability manifest module keeps summarization behind stamping API', () => {
    const manifestModule = require('../../packages/windie-sdk-js/cjs/runtime/CapabilityManifest.js');

    expect(manifestModule.stampAgentDefinitionCapabilityMetadata).toBeDefined();
    expect(manifestModule.setAgentDefinitionToolManifest).toBeDefined();
    expect(manifestModule.summarizeAgentDefinitionCapabilities).toBeUndefined();
  });
});
