/**
 * Covers conversation groups. behavior in the frontend test suite.
 */

import { DesktopDashboardConversationGroupRuntime } from '../../src/renderer/app/runtime/desktopDashboardConversationGroupRuntime';

const {
  buildConversationGroups,
  buildWorkspaceConversationGroups,
  getDashboardConversationGroupDescriptors,
  getDashboardConversationGroupKeys,
  getDashboardConversationGroupLabel,
  getDashboardSearchSnippetDisplayText,
} = DesktopDashboardConversationGroupRuntime;

function isoDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

describe('conversationGroups', () => {
  test('exposes ordered dashboard group descriptors for search rendering', () => {
    expect(getDashboardConversationGroupDescriptors()).toEqual([
      { key: 'today', label: 'Today' },
      { key: 'yesterday', label: 'Yesterday' },
      { key: 'previous7Days', label: 'Previous 7 days' },
      { key: 'older', label: 'Older' },
    ]);
    expect(getDashboardConversationGroupKeys()).toEqual([
      'today',
      'yesterday',
      'previous7Days',
      'older',
    ]);
    expect(getDashboardConversationGroupLabel('previous7Days')).toBe('Previous 7 days');
    expect(getDashboardConversationGroupLabel('unknown')).toBe('');
  });

  test('buckets conversations by timestamp and preserves pin flags', () => {
    const groups = buildConversationGroups([
      { conversation_id: 'today-1', title: 'Today', last_timestamp: isoDaysAgo(0) },
      { conversation_id: 'yesterday-1', title: 'Yesterday', last_timestamp: isoDaysAgo(1) },
      { conversation_id: 'week-1', title: 'This week', last_timestamp: isoDaysAgo(3) },
      { conversation_id: 'older-1', title: 'Older', last_timestamp: isoDaysAgo(20) },
    ], {
      pinnedConversationRefs: ['week-1'],
    });

    expect(groups.today).toHaveLength(1);
    expect(groups.yesterday).toHaveLength(1);
    expect(groups.previous7Days).toHaveLength(1);
    expect(groups.older).toHaveLength(1);
    expect(groups.previous7Days[0].isPinned).toBe(true);
    expect(groups.today[0].title).toBe('Today');
  });

  test('adds normalized search metadata when includeSearchMetadata is enabled', () => {
    const groups = buildConversationGroups([
      {
        conversation_id: 'search-1',
        title: 'Match',
        snippet: 'hello world',
        matched_role: 'user',
        last_timestamp: isoDaysAgo(0),
      },
    ], {
      includeSearchMetadata: true,
      keyPrefix: 'search-conversation',
    });

    expect(groups.today[0]).toEqual(expect.objectContaining({
      key: 'search-1',
      snippet: 'hello world',
      matchedRole: 'You',
    }));
  });

  test('builds search snippet display text with matched-role prefix rules', () => {
    expect(getDashboardSearchSnippetDisplayText({
      snippet: 'hello world',
      matchedRole: 'Assistant',
    })).toBe('Assistant: hello world');

    expect(getDashboardSearchSnippetDisplayText({
      snippet: 'assistant: already labeled',
      matchedRole: 'Assistant',
    })).toBe('assistant: already labeled');

    expect(getDashboardSearchSnippetDisplayText({
      snippet: 'plain snippet',
      matchedRole: '',
    })).toBe('plain snippet');

    expect(getDashboardSearchSnippetDisplayText({
      snippet: '',
      matchedRole: 'You',
    })).toBe('');
  });

  test('groups conversations by workspace and sorts pinned chats first within each group', () => {
    const groups = buildWorkspaceConversationGroups([
      {
        conversation_id: 'project-alpha-1',
        title: 'Project Alpha issue',
        workspace_path: '/work/project-alpha',
        workspace_name: 'Project Alpha',
        last_timestamp: isoDaysAgo(0),
      },
      {
        conversation_id: 'project-alpha-2',
        title: 'Project Alpha follow-up',
        workspace_path: '/work/project-alpha',
        workspace_name: 'Project Alpha',
        last_timestamp: isoDaysAgo(1),
      },
      {
        conversation_id: 'lode-1',
        title: 'Lodex plan',
        workspace_path: '/work/Lodex',
        workspace_name: 'Lodex',
        last_timestamp: isoDaysAgo(2),
      },
    ], {
      pinnedConversationRefs: ['project-alpha-2'],
    });

    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual(expect.objectContaining({
      key: '/work/project-alpha',
      title: 'Project Alpha',
    }));
    expect(groups[0].items.map((item) => item.key)).toEqual(['project-alpha-2', 'project-alpha-1']);
    expect(groups[1]).toEqual(expect.objectContaining({
      key: '/work/Lodex',
      title: 'Lodex',
    }));
  });

  test('groups SDK camelCase workspace metadata under the selected workspace', () => {
    const groups = buildWorkspaceConversationGroups([
      {
        conversation_id: 'project-alpha-1',
        title: 'Project Alpha issue',
        workspacePath: '/work/project-alpha',
        workspaceName: '',
        last_timestamp: isoDaysAgo(0),
      },
    ]);

    expect(groups).toEqual([
      expect.objectContaining({
        key: '/work/project-alpha',
        title: 'project-alpha',
        workspacePath: '/work/project-alpha',
      }),
    ]);
  });

  test('sorts workspace groups with pinned conversations before newer unpinned groups', () => {
    const groups = buildWorkspaceConversationGroups([
      {
        conversation_id: 'newer-unpinned',
        title: 'Newer unpinned chat',
        workspace_path: '/work/Newer',
        workspace_name: 'Newer',
        last_timestamp: isoDaysAgo(0),
      },
      {
        conversation_id: 'older-pinned',
        title: 'Older pinned chat',
        workspace_path: '/work/Older',
        workspace_name: 'Older',
        last_timestamp: isoDaysAgo(10),
      },
    ], {
      pinnedConversationRefs: ['older-pinned'],
    });

    expect(groups.map((group) => group.key)).toEqual(['/work/Older', '/work/Newer']);
    expect(groups[0]).toEqual(expect.objectContaining({
      hasPinnedConversation: true,
    }));
    expect(groups[1]).toEqual(expect.objectContaining({
      hasPinnedConversation: false,
    }));
  });
});
