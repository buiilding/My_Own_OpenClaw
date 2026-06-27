/**
 * Covers tool call message state. behavior in the frontend test suite.
 */

import {
  buildToolBundleMessageState,
  buildToolCallMessageState,
} from '../../src/renderer/infrastructure/transcript/toolCallMessageState';

describe('toolCallMessageState', () => {
  test('normalizes live tool-call payloads into one canonical message state', () => {
    expect(buildToolCallMessageState({
      rawToolCall: {
        id: 'call-1',
        name: 'browser.open',
        arguments: { url: 'https://example.com' },
      },
      fallbackToolName: 'browser.open',
      fallbackToolCallId: 'request-1',
      metadata: {
        source: 'backend',
      },
      toolCallDetails: {
        tool_name: 'browser.open',
      },
      correlationId: 'request-1',
    })).toEqual({
      text: JSON.stringify({
        id: 'call-1',
        name: 'browser.open',
        arguments: { url: 'https://example.com' },
        metadata: { source: 'backend' },
      }, null, 2),
      toolCallDisplayText: JSON.stringify({
        id: 'call-1',
        name: 'browser.open',
        arguments: { url: 'https://example.com' },
        metadata: { source: 'backend' },
      }, null, 2),
      toolCallDetails: {
        tool_name: 'browser.open',
      },
      correlationId: 'request-1',
    });
  });

  test('prefers raw parse-recovery preview text while preserving normalized metadata fields', () => {
    const messageState = buildToolCallMessageState({
      rawToolCall: {
        id: 'call-2',
        name: 'shell',
      },
      fallbackToolName: 'shell',
      metadata: {
        source: 'backend-recovery',
      },
      toolCallValidationFailed: true,
      rawToolCallPreview: 'shell("pwd")',
      parseError: 'bad json',
    });

    expect(messageState.text).toBe('shell("pwd")');
    expect(messageState.toolCallDisplayText).toBe('shell("pwd")');
    expect(messageState).not.toHaveProperty('modelFacingToolCall');
    expect(messageState.correlationId).toBe('call-2');
  });

  test('normalizes bundle payloads with consistent tool display structure', () => {
    expect(buildToolBundleMessageState({
      bundle_id: 'bundle-1',
      toolCalls: [
        {
          id: 'call-3',
          name: 'browser.open',
          arguments: { url: 'https://example.com' },
        },
      ],
    })).toEqual({
      text: JSON.stringify({
        bundle_id: 'bundle-1',
        tools: [{
          id: 'call-3',
          name: 'browser.open',
          arguments: { url: 'https://example.com' },
        }],
      }, null, 2),
      toolCallDisplayText: JSON.stringify({
        bundle_id: 'bundle-1',
        tools: [{
          id: 'call-3',
          name: 'browser.open',
          arguments: { url: 'https://example.com' },
        }],
      }, null, 2),
      toolCalls: [
        {
          id: 'call-3',
          name: 'browser.open',
          arguments: { url: 'https://example.com' },
        },
      ],
      toolCallDetails: {
        bundle_id: 'bundle-1',
        toolCalls: [
          {
            id: 'call-3',
            name: 'browser.open',
            arguments: { url: 'https://example.com' },
          },
        ],
      },
      correlationId: 'bundle-1',
    });
  });

  test('normalizes SDK-shaped bundle ids for live presentation payloads', () => {
    expect(buildToolBundleMessageState({
      bundleId: 'bundle-sdk',
      tools: [
        {
          name: 'read_file',
          args: { path: 'README.md' },
        },
      ],
    })).toEqual(expect.objectContaining({
      text: JSON.stringify({
        bundle_id: 'bundle-sdk',
        tools: [{
          name: 'read_file',
          arguments: { path: 'README.md' },
        }],
      }, null, 2),
      correlationId: 'bundle-sdk',
    }));
  });
});
