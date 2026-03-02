import {
  buildReplayContextMessages,
} from '../../frontend/src/renderer/features/chat/utils/conversationReplayToolMessages';

describe('conversationReplayToolMessages', () => {
  test('keeps non-tool rows and matched tool call/output pairs', () => {
    const messages = [
      { id: 'm-1', type: 'llm-text', text: 'assistant intro' },
      { id: 'm-2', type: 'tool-call', correlationId: 'corr-1' },
      { id: 'm-3', type: 'tool-output', correlationId: 'corr-1' },
      { id: 'm-4', type: 'llm-text', text: 'assistant summary' },
      { id: 'm-5', type: 'tool-call', correlationId: 'corr-orphan' },
      { id: 'm-6', type: 'tool-output', correlationId: 'corr-missing-call' },
    ];

    expect(buildReplayContextMessages(messages).map((message) => message.id)).toEqual([
      'm-1',
      'm-2',
      'm-3',
      'm-4',
    ]);
  });

  test('matches output with idless pending tool call when id-specific match is missing', () => {
    const messages = [
      { id: 'm-1', type: 'tool-call', correlationId: '   ' },
      { id: 'm-2', type: 'tool-output', correlationId: 'corr-no-match' },
      { id: 'm-3', type: 'llm-text', text: 'tail' },
    ];

    expect(buildReplayContextMessages(messages).map((message) => message.id)).toEqual([
      'm-1',
      'm-2',
      'm-3',
    ]);
  });

  test('falls back to earliest pending call when output id is missing and no idless call exists', () => {
    const messages = [
      { id: 'm-1', type: 'tool-call', correlationId: 'corr-a' },
      { id: 'm-2', type: 'tool-call', correlationId: 'corr-b' },
      { id: 'm-3', type: 'tool-result', correlationId: '   ' },
      { id: 'm-4', type: 'llm-text', text: 'tail' },
    ];

    expect(buildReplayContextMessages(messages).map((message) => message.id)).toEqual([
      'm-1',
      'm-3',
      'm-4',
    ]);
  });

  test('matches calls and outputs when only payload/model-facing correlation ids are present', () => {
    const messages = [
      {
        id: 'm-1',
        type: 'tool-call',
        correlationId: '   ',
        toolCallDetails: { request_id: ' req-a ' },
      },
      {
        id: 'm-2',
        type: 'tool-output',
        correlationId: '   ',
        toolOutputDetails: { request_id: 'req-a' },
      },
      {
        id: 'm-3',
        type: 'tool-call',
        correlationId: '   ',
        modelFacingToolCall: { id: 'tool-call-model' },
      },
      {
        id: 'm-4',
        type: 'tool-output',
        correlationId: '   ',
        toolOutputDetails: { request_id: 'tool-call-model' },
      },
    ];

    expect(buildReplayContextMessages(messages).map((message) => message.id)).toEqual([
      'm-1',
      'm-2',
      'm-3',
      'm-4',
    ]);
  });
});
