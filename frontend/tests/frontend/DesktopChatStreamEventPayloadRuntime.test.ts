/**
 * Covers desktop chat stream event payload runtime behavior in the frontend test suite.
 */

import { DesktopChatStreamEventPayloadRuntime } from '../../src/renderer/app/runtime/desktopChatStreamEventPayloadRuntime';

const {
  buildCompactedReplaySnapshot,
  buildCompactionDebugInfo,
  buildTokenCountsFromPayload,
  getCompactionReplacementHistoryEntries,
  resolveErrorText,
  resolveCompactionErrorText,
  resolveConversationStreamEventPayload,
  resolveConversationStreamEventUserId,
  resolveLocalUserMessageText,
  resolveTerminalErrorPayload,
  resolveToolSchemasMetadataPayload,
  shouldIgnoreStreamError,
} = DesktopChatStreamEventPayloadRuntime;

describe('desktopChatStreamEventPayloadRuntime', () => {
  test('shouldIgnoreStreamError matches settings-update failures', () => {
    expect(shouldIgnoreStreamError({ message: 'Failed to update settings: x' })).toBe(true);
    expect(shouldIgnoreStreamError({ content: 'Failed to update settings: y' })).toBe(true);
    expect(shouldIgnoreStreamError({ message: 'Different failure' })).toBe(false);
    expect(shouldIgnoreStreamError(undefined)).toBe(false);
  });

  test('shouldIgnoreStreamError matches recoverable streamed tool-call parse failures', () => {
    expect(shouldIgnoreStreamError({
      content: (
        'Unexpected system error: Invalid response from stream: '
        + 'failed to parse streamed tool-call arguments for id=tool_bad name=run_shell_command. '
        + 'Raw arguments preview: \'{"command":"cat > index.html << \\"EOF\\""}\''
      ),
    })).toBe(true);
  });

  test('resolveErrorText prefers payload content then message then fallback', () => {
    expect(resolveErrorText({ content: 'content-error', message: 'message-error' })).toBe('content-error');
    expect(resolveErrorText({ content: '', message: 'message-error' })).toBe('message-error');
    expect(resolveErrorText({ content: '', message: '' })).toBe('An error occurred');
    expect(resolveErrorText(undefined)).toBe('An error occurred');
  });

  test('normalizes terminal token-count payloads for renderer state', () => {
    expect(buildTokenCountsFromPayload({
      prompt_tokens: 12,
      visible_output_tokens: 3,
      thinking_tokens: null,
      output_tokens_total: 5,
      total_tokens: 17,
      conversation_tokens: 120,
      usage_source: 'provider',
      cached_tokens: null,
      cache_hit: false,
      cache_status: 'miss',
      ignored_extra: 'drop-me',
    })).toEqual({
      prompt_tokens: 12,
      visible_output_tokens: 3,
      thinking_tokens: null,
      output_tokens_total: 5,
      total_tokens: 17,
      conversation_tokens: 120,
      usage_source: 'provider',
      cached_tokens: null,
      cache_hit: false,
      cache_status: 'miss',
    });

    expect(buildTokenCountsFromPayload({
      prompt_tokens: Number.POSITIVE_INFINITY,
      usage_source: 'backend-debug',
      cache_status: 'warm',
      cache_hit: 'false',
    })).toEqual({});
  });

  test('normalizes SDK conversation event payload access', () => {
    const payload = { content: 'hello' };

    expect(resolveConversationStreamEventPayload({ payload })).toBe(payload);
    expect(resolveConversationStreamEventPayload({ payload: null })).toBeNull();
    expect(resolveConversationStreamEventPayload({ payload: ['not-record'] as any })).toBeNull();
    expect(resolveConversationStreamEventPayload(null)).toBeNull();
  });

  test('normalizes SDK conversation event user id access', () => {
    expect(resolveConversationStreamEventUserId({
      payload: { userId: ' user-1 ' },
    })).toBe('user-1');
    expect(resolveConversationStreamEventUserId({
      payload: { userId: '' },
    })).toBeNull();
    expect(resolveConversationStreamEventUserId({
      payload: { user_id: 'legacy-user' },
    })).toBeNull();
    expect(resolveConversationStreamEventUserId(null)).toBeNull();
  });

  test('normalizes terminal error payloads to public message fields', () => {
    expect(resolveTerminalErrorPayload({
      message: 'message-error',
      content: 'content-error',
      rawEvent: { debug: true },
    })).toEqual({
      message: 'message-error',
      content: 'content-error',
    });
  });

  test('normalizes local-user message text aliases', () => {
    expect(resolveLocalUserMessageText({ text: 'hello', content: 'fallback' })).toBe('hello');
    expect(resolveLocalUserMessageText({ content: 'fallback' })).toBe('fallback');
    expect(resolveLocalUserMessageText({ text: 7, content: null })).toBeNull();
    expect(resolveLocalUserMessageText(undefined)).toBeNull();
  });

  test('normalizes compaction payload aliases for renderer side effects', () => {
    const payload = {
      before_tokens: 10,
      afterTokens: 4,
      removed_messages: 2,
      summary_preview: 'short',
      summaryText: 'full',
      skipped_reason: '',
      replacement_history_preview: [
        {
          role: 'assistant',
          message_type: 'context_compaction',
          content: 'summary',
          tool_name: 'compact',
          tool_call_id: 'tool-1',
        },
      ],
      replacement_history_entries: [
        { role: 'assistant', content: 'summary', message_type: 'context_compaction' },
      ],
    };

    expect(buildCompactionDebugInfo(payload)).toEqual(expect.objectContaining({
      beforeTokens: 10,
      afterTokens: 4,
      removedMessages: 2,
      summaryPreview: 'short',
      summaryText: 'full',
      replacementHistoryPreview: [
        {
          role: 'assistant',
          messageType: 'context_compaction',
          content: 'summary',
          toolName: 'compact',
          toolCallId: 'tool-1',
        },
      ],
    }));
    expect(getCompactionReplacementHistoryEntries(payload)).toEqual([
      expect.objectContaining({ message_type: 'context_compaction' }),
    ]);
  });

  test('normalizes compaction failure error text', () => {
    expect(resolveCompactionErrorText({ error: ' failed to compact ' })).toBe('failed to compact');
    expect(resolveCompactionErrorText({ error: '' })).toBe('');
    expect(resolveCompactionErrorText({ error: 7 })).toBe('');
    expect(resolveCompactionErrorText(undefined)).toBe('');
  });

  test('buildCompactedReplaySnapshot creates stable replay snapshots from runtime payload', () => {
    const snapshot = buildCompactedReplaySnapshot({
      eventId: 'event-1',
      type: 'compaction_applied',
      conversationRef: 'conversation-1',
      turnRef: 'turn-1',
      revisionId: 'rev-1',
      timestamp: '2026-06-19T00:00:00.000Z',
      payload: {
        generationId: 'generation-1',
        replacementHistoryEntries: [
          { role: 'assistant', content: 'summary', message_type: 'context_compaction' },
        ],
      },
    } as any, 'conversation-1');

    expect(snapshot).toEqual(expect.objectContaining({
      generationId: 'generation-1',
      conversationRef: 'conversation-1',
      sourceRevisionId: 'rev-1',
      sourceTurnRef: 'turn-1',
      entryCount: 1,
      complete: true,
      active: true,
    }));
  });

  test('normalizes tool-schema metadata aliases before message updates', () => {
    expect(resolveToolSchemasMetadataPayload({
      toolSchemas: [{ name: 'read_file' }],
    })).toEqual({
      toolSchemas: [{ name: 'read_file' }],
      tool_schemas: [{ name: 'read_file' }],
    });
    expect(resolveToolSchemasMetadataPayload({
      tool_schemas: [{ name: 'replace' }],
      toolSchemas: [{ name: 'read_file' }],
    })).toEqual({
      tool_schemas: [{ name: 'replace' }],
      toolSchemas: [{ name: 'read_file' }],
    });
  });
});
