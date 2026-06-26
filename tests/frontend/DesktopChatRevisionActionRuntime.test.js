import {
  DesktopChatRevisionActionRuntime,
} from '../../frontend/src/renderer/app/runtime/desktopChatRevisionActionRuntime';

const {
  buildRevisionMenuItems,
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

  test('builds fork command input without renderer-owned fork ref', () => {
    expect(buildRevisionForkCommand({
      activeConversationRef: ' conv one ',
      revision: {
        revisionId: ' rev/base ',
      },
      userId: '',
    })).toEqual({
      actionId: 'fork:rev/base',
      input: {
        userId: 'default_user',
        conversationRef: 'conv one',
        sourceRevisionId: 'rev/base',
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

  test('builds revision menu item action state for rendering', () => {
    expect(buildRevisionMenuItems({
      activeRevisionId: ' rev-active ',
      revisionActionId: 'fork:rev-active',
      revisions: [
        {
          revisionId: 'rev-active',
          operation: 'user_edit',
        },
        {
          revisionId: 'revision-1234567890abcdef',
          operation: 'retry',
        },
        {
          operation: 'missing',
        },
      ],
    })).toEqual([
      {
        key: 'rev-active',
        revision: {
          revisionId: 'rev-active',
          operation: 'user_edit',
        },
        revisionId: 'rev-active',
        shortId: 'rev-active',
        metaLabel: 'active',
        isActive: true,
        checkoutDisabled: false,
        forkDisabled: true,
        forkAriaLabel: 'Fork revision rev-active',
      },
      {
        key: 'revision-1234567890abcdef',
        revision: {
          revisionId: 'revision-1234567890abcdef',
          operation: 'retry',
        },
        revisionId: 'revision-1234567890abcdef',
        shortId: 'revision-1...',
        metaLabel: 'retry',
        isActive: false,
        checkoutDisabled: false,
        forkDisabled: false,
        forkAriaLabel: 'Fork revision revision-1...',
      },
      {
        key: 'revision:2',
        revision: {
          operation: 'missing',
        },
        revisionId: null,
        shortId: 'revision',
        metaLabel: 'missing',
        isActive: false,
        checkoutDisabled: true,
        forkDisabled: true,
        forkAriaLabel: 'Fork revision revision',
      },
    ]);
  });
});
