import { buildConversationGroups } from '../../frontend/src/renderer/features/dashboard/utils/conversationGroups';

function isoDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

describe('conversationGroups', () => {
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
});
