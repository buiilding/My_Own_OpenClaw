/**
 * Covers tool output message state. behavior in the frontend test suite.
 */

import { buildToolOutputChatMessageState } from '../../src/renderer/infrastructure/transcript/toolOutputChatMessageState';

describe('toolOutputChatMessageState', () => {
  test('uses typed attachments and common tool-output fields without screenshot aliases', () => {
    const uuidSpy = jest.spyOn(crypto, 'randomUUID').mockReturnValue('tool-output-state-1');

    const message = buildToolOutputChatMessageState({
      outputText: 'clicked',
      sourceEventType: 'tool-output',
      sourceChannel: 'sdk:conversation-event',
      toolMetadata: { source: 'backend' },
      toolName: 'mouse_control',
      executionTime: 0.5,
      success: true,
      correlationId: 'req-1',
      toolOutputDetails: { request_id: 'req-1' },
      attachments: [{
        id: 'tool-output-state-1:attachment:000',
        kind: 'image',
        source: 'tool_result',
        status: 'ready',
        screenshotRef: 'artifact-shot-1',
      }],
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
      sourceChannel: 'sdk:conversation-event',
      toolMetadata: { source: 'backend' },
      toolName: 'mouse_control',
      executionTime: 0.5,
      success: true,
      correlationId: 'req-1',
      modelFacingToolOutput: 'clicked',
      toolOutputDetails: { request_id: 'req-1' },
      attachments: [{
        id: 'tool-output-state-1:attachment:000',
        kind: 'image',
        source: 'tool_result',
        status: 'ready',
        screenshotRef: 'artifact-shot-1',
      }],
      turnRef: 'turn-1',
      modelId: 'model-1',
      modelProvider: 'provider-1',
    });
    expect(message).not.toHaveProperty('screenshot');
    expect(message).not.toHaveProperty('screenshotRef');
    expect(message).not.toHaveProperty('screenshotUrl');
    expect(message).not.toHaveProperty('screenshotContentType');

    uuidSpy.mockRestore();
  });
});
