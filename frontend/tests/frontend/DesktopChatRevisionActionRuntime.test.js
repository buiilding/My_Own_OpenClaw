import {
  DesktopChatRevisionActionRuntime,
} from '../../src/renderer/app/runtime/desktopChatRevisionActionRuntime';
import {
  DesktopConversationContinuityService,
} from '../../src/renderer/app/runtime/desktopConversationContinuityService';

jest.mock('../../src/renderer/app/runtime/desktopConversationContinuityService', () => ({
  DesktopConversationContinuityService: {
    listRevisions: jest.fn(),
    checkoutRevision: jest.fn(),
    forkConversation: jest.fn(),
  },
}));

const {
  buildRevisionMenuItems,
  buildRevisionCheckoutCommand,
  buildRevisionForkCommand,
  executeRevisionCheckoutCommand,
  executeRevisionForkCommand,
  loadRevisionOptions,
  markActiveRevisionFromCheckoutResult,
  markActiveRevisionInList,
  normalizeRevisionId,
} = DesktopChatRevisionActionRuntime;

describe('DesktopChatRevisionActionRuntime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

  test('marks the active revision through the runtime helper', () => {
    expect(markActiveRevisionInList([
      {
        revisionId: 'rev-old',
        active: true,
      },
      {
        revisionId: ' rev-new ',
      },
      {
        operation: 'missing',
      },
    ], ' rev-new ')).toEqual([
      {
        revisionId: 'rev-old',
        active: false,
      },
      {
        revisionId: ' rev-new ',
        active: true,
      },
      {
        operation: 'missing',
        active: false,
      },
    ]);
  });

  test('marks the active revision from checkout runtime results', () => {
    expect(markActiveRevisionFromCheckoutResult([
      {
        revisionId: 'rev-old',
        active: true,
      },
      {
        revisionId: ' rev-new ',
      },
    ], {
      revisionId: ' rev-new ',
    })).toEqual([
      {
        revisionId: 'rev-old',
        active: false,
      },
      {
        revisionId: ' rev-new ',
        active: true,
      },
    ]);
  });

  test('loads revision options through continuity service', async () => {
    DesktopConversationContinuityService.listRevisions.mockResolvedValue([
      { revisionId: 'rev-1' },
    ]);

    await expect(loadRevisionOptions({
      activeConversationRef: ' conv-1 ',
      userId: '',
      limit: 10,
    })).resolves.toEqual([
      { revisionId: 'rev-1' },
    ]);

    expect(DesktopConversationContinuityService.listRevisions).toHaveBeenCalledWith(
      'default_user',
      'conv-1',
      10,
    );
  });

  test('executes revision checkout commands through continuity service', async () => {
    DesktopConversationContinuityService.checkoutRevision.mockResolvedValue({
      view: { conversationRef: 'conv-1' },
    });

    await expect(executeRevisionCheckoutCommand({
      actionId: 'checkout:rev-1',
      input: {
        userId: 'user-1',
        conversationRef: 'conv-1',
        revisionId: ' rev-1 ',
      },
    })).resolves.toEqual({
      actionId: 'checkout:rev-1',
      revisionId: 'rev-1',
      result: {
        view: { conversationRef: 'conv-1' },
      },
      view: { conversationRef: 'conv-1' },
    });

    expect(DesktopConversationContinuityService.checkoutRevision).toHaveBeenCalledWith({
      userId: 'user-1',
      conversationRef: 'conv-1',
      revisionId: ' rev-1 ',
    });
  });

  test('executes revision fork commands through continuity service', async () => {
    DesktopConversationContinuityService.forkConversation.mockResolvedValue({
      conversationRef: ' conv-fork ',
      view: { conversationRef: 'conv-fork' },
    });

    await expect(executeRevisionForkCommand({
      actionId: 'fork:rev-1',
      input: {
        userId: 'user-1',
        conversationRef: 'conv-1',
        sourceRevisionId: 'rev-1',
      },
    })).resolves.toEqual({
      actionId: 'fork:rev-1',
      conversationRef: 'conv-fork',
      result: {
        conversationRef: ' conv-fork ',
        view: { conversationRef: 'conv-fork' },
      },
      view: { conversationRef: 'conv-fork' },
    });

    expect(DesktopConversationContinuityService.forkConversation).toHaveBeenCalledWith({
      userId: 'user-1',
      conversationRef: 'conv-1',
      sourceRevisionId: 'rev-1',
    });
  });
});
