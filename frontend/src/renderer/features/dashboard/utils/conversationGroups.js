function getConversationTimeBuckets() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  return { today, yesterday, sevenDaysAgo };
}

function createEmptyGroups() {
  return {
    today: [],
    yesterday: [],
    previous7Days: [],
    older: [],
  };
}

function normalizeMatchedRole(role) {
  if (typeof role !== 'string') {
    return '';
  }
  if (role === 'user') {
    return 'You';
  }
  if (role === 'assistant') {
    return 'Assistant';
  }
  return role;
}

function buildConversationGroups(conversations, options = {}) {
  const {
    pinnedConversationRefs = [],
    keyPrefix = 'conversation',
    includeSearchMetadata = false,
  } = options;

  const groups = createEmptyGroups();
  const { today, yesterday, sevenDaysAgo } = getConversationTimeBuckets();
  const pinnedSet = new Set(pinnedConversationRefs);

  conversations.forEach((conversation, index) => {
    const timestampValue = Date.parse(conversation?.last_timestamp || '');
    const conversationDate = Number.isNaN(timestampValue)
      ? new Date(0)
      : new Date(timestampValue);
    const resolvedTitle = typeof conversation?.title === 'string'
      ? conversation.title.trim()
      : '';
    const item = {
      key: conversation?.conversation_id || `${keyPrefix}-${index}`,
      title: resolvedTitle || 'New chat',
      conversation,
      isPinned: pinnedSet.has(conversation?.conversation_id),
    };

    if (includeSearchMetadata) {
      item.snippet = typeof conversation?.snippet === 'string' ? conversation.snippet.trim() : '';
      item.matchedRole = normalizeMatchedRole(conversation?.matched_role);
    }

    if (conversationDate >= today) {
      groups.today.push(item);
      return;
    }
    if (conversationDate >= yesterday) {
      groups.yesterday.push(item);
      return;
    }
    if (conversationDate >= sevenDaysAgo) {
      groups.previous7Days.push(item);
      return;
    }
    groups.older.push(item);
  });

  return groups;
}

export { buildConversationGroups };
