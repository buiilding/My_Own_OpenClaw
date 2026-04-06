import { buildToolOutputChatMessageState } from '../../frontend/src/renderer/infrastructure/transcript/toolOutputChatMessageState';

describe('toolOutputChatMessageState', () => {
  test('normalizes screenshots and common tool-output fields', () => {
    const uuidSpy = jest.spyOn(crypto, 'randomUUID').mockReturnValue('tool-output-state-1');

    const message = buildToolOutputChatMessageState({
      outputText: 'clicked',
      sourceEventType: 'tool-output',
      sourceChannel: 'from-backend',
      screenshot: 'inline-shot',
      screenshotRef: 'artifact-shot-1',
      screenshotUrl: null,
      toolMetadata: { source: 'backend' },
      toolName: 'mouse_control',
      executionTime: 0.5,
      success: true,
      correlationId: 'req-1',
      toolOutputDetails: { request_id: 'req-1' },
      turnRef: 'turn-1',
      modelId: 'model-1',
      modelProvider: 'provider-1',
    });

    expect(message).toEqual({
      id: 'tool-output-state-1',
      text: 'clicked',
      sender: 'assistant',
      type: 'tool-output',
      sourceEventType: 'tool-output',
      sourceChannel: 'from-backend',
      screenshot: null,
      screenshotRef: 'artifact-shot-1',
      screenshotUrl: expect.stringContaining('/api/artifacts/artifact-shot-1'),
      screenshotContentType: null,
      toolMetadata: { source: 'backend' },
      toolName: 'mouse_control',
      executionTime: 0.5,
      success: true,
      correlationId: 'req-1',
      modelFacingToolOutput: 'clicked',
      toolOutputDetails: { request_id: 'req-1' },
      turnRef: 'turn-1',
      modelId: 'model-1',
      modelProvider: 'provider-1',
    });

    uuidSpy.mockRestore();
  });
});
