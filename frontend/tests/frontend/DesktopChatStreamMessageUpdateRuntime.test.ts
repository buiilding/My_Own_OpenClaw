/**
 * Covers desktop chat stream message update runtime behavior in the frontend test suite.
 */

import { DesktopChatStreamMessageUpdateRuntime } from '../../src/renderer/app/runtime/desktopChatStreamMessageUpdateRuntime';

const {
  buildAssistantMessageFullUpdate,
  buildLastAssistantLlmTextStreamTarget,
  buildLastBySenderStreamTarget,
  buildSystemPromptUpdate,
  buildUserMessageFullUpdate,
} = DesktopChatStreamMessageUpdateRuntime;

describe('desktopChatStreamMessageUpdateRuntime', () => {
  test('payload update builders normalize missing or non-string content', () => {
    expect(
      buildSystemPromptUpdate({
        content: 'prompt',
        tool_schemas: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }],
      }),
    ).toEqual({
      content: 'prompt',
      toolSchemas: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }],
    });
    expect(
      buildSystemPromptUpdate({
        content: 'prompt',
        tool_schemas: [{ type: 'function', name: 'run_shell_command', parameters: { type: 'object' } }],
      }),
    ).toEqual({
      content: 'prompt',
      toolSchemas: [{ type: 'function', function: { name: 'run_shell_command', parameters: { type: 'object' } } }],
    });
    expect(buildSystemPromptUpdate({ content: 'prompt', tool_schemas: ['a'] })).toEqual({
      content: 'prompt',
      toolSchemas: undefined,
    });
    expect(buildSystemPromptUpdate({ content: 5 as any })).toEqual({
      content: '',
      toolSchemas: undefined,
    });

    expect(buildUserMessageFullUpdate({ content: 'u', metadata: { x: 1 } })).toEqual({
      content: 'u',
      metadata: { x: 1 },
    });
    expect(buildUserMessageFullUpdate({ content: null as any })).toEqual({
      content: '',
      metadata: undefined,
    });

    expect(buildAssistantMessageFullUpdate({ content: 'a' })).toEqual({ content: 'a' });
    expect(buildAssistantMessageFullUpdate({ content: false as any })).toEqual({ content: '' });
  });

  test('normalizes mojibake and lone surrogates in streaming and payload updates', () => {
    expect(buildUserMessageFullUpdate({ content: 'bad\udc9d' })).toEqual({
      content: 'bad�',
      metadata: undefined,
    });

    expect(buildSystemPromptUpdate({
      content: 'Active: â€œProject Alpha â€” READMEâ€\u009d',
      tool_schemas: [],
    })).toEqual({
      content: 'Active: “Project Alpha — README”',
      toolSchemas: [],
    });

    expect(buildAssistantMessageFullUpdate({
      content: 'Done\udc9d',
    })).toEqual({
      content: 'Done�',
    });
  });

  test('preserves valid emoji surrogate pairs while replacing lone surrogates', () => {
    expect(buildUserMessageFullUpdate({ content: 'Hey! 👋' })).toEqual({
      content: 'Hey! 👋',
      metadata: undefined,
    });

    expect(buildAssistantMessageFullUpdate({
      content: 'Wave 👋 then lone \udc9d',
    })).toEqual({
      content: 'Wave 👋 then lone \uFFFD',
    });
  });

  test('builds stream update targets from runtime-owned event identity', () => {
    expect(buildLastBySenderStreamTarget('user', {
      turnRefForUpdate: 'turn-1',
    })).toEqual({
      kind: 'last_by_sender',
      sender: 'user',
      turnRef: 'turn-1',
    });
    expect(buildLastAssistantLlmTextStreamTarget({
      turnRefForUpdate: 'turn-2',
    })).toEqual({
      kind: 'last_assistant_llm_text',
      turnRef: 'turn-2',
    });
    expect(buildLastAssistantLlmTextStreamTarget(null)).toEqual({
      kind: 'last_assistant_llm_text',
      turnRef: undefined,
    });
  });
});
