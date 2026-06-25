import {
  DesktopChatRevisionActionRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopChatRevisionActionRuntime';

const {
  buildForkConversationRef,
  buildRevisionCheckoutCommand,
  buildRevisionForkCommand,
  normalizeRevisionId,
} = DesktopChatRevisionActionRuntime;

describe('DesktopChatRevisionActionRuntime', () => {
  test('normalizes revision ids', () => {
    expect(normalizeRevisionId(' rev-1 ')).toBe('rev-1');
    expect(normalizeRevisionId('   ')).toBeNull();
    expect(normalizeRevisionId(null)).toBeNull();
  });

  test('builds checkout command input', () => {
    expect(buildRevisionCheckoutCommand({
      activeConversationRef: ' conv-1 ',
      revisionId: ' rev-1 ',
      userId: ' user-1 ',
    })).toEqual({
      actionId: 'checkout:rev-1',
      input: {
        userId: 'user-1',
        conversationRef: 'conv-1',
        revisionId: 'rev-1',
      },
    });
  });

  test('returns null for incomplete checkout command input', () => {
    expect(buildRevisionCheckoutCommand({
      activeConversationRef: 'conv-1',
      revisionId: '',
    })).toBeNull();
    expect(buildRevisionCheckoutCommand({
      activeConversationRef: '',
      revisionId: 'rev-1',
    })).toBeNull();
  });

  test('builds fork command input with deterministic fork ref', () => {
    const now = () => 12345;

    expect(buildForkConversationRef('conv one', 'rev/base', now)).toBe('conv-one-fork-rev-base-9ix');
    expect(buildRevisionForkCommand({
      activeConversationRef: ' conv one ',
      revision: {
        revisionId: ' rev/base ',
      },
      userId: '',
      now,
    })).toEqual({
      actionId: 'fork:rev/base',
      input: {
        userId: 'default_user',
        conversationRef: 'conv one',
        sourceRevisionId: 'rev/base',
        newConversationRef: 'conv-one-fork-rev-base-9ix',
      },
    });
  });

  test('returns null for incomplete fork command input', () => {
    expect(buildRevisionForkCommand({
      activeConversationRef: 'conv-1',
      revision: {},
    })).toBeNull();
    expect(buildRevisionForkCommand({
      activeConversationRef: '',
      revision: { revisionId: 'rev-1' },
    })).toBeNull();
  });
});
