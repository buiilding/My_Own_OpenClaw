/**
 * Owns renderer dashboard conversation grouping rules for the app runtime.
 */

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

function normalizeWorkspaceGroupKey(conversation) {
  const workspacePath = typeof conversation?.workspace_path === 'string'
    ? conversation.workspace_path.trim()
    : '';
  return workspacePath || '__no_workspace__';
}

function normalizeWorkspaceGroupTitle(conversation) {
  const workspaceName = typeof conversation?.workspace_name === 'string'
    ? conversation.workspace_name.trim()
    : '';
  if (workspaceName) {
    return workspaceName;
  }
  const workspacePath = typeof conversation?.workspace_path === 'string'
    ? conversation.workspace_path.trim()
    : '';
  if (!workspacePath) {
    return 'No workspace';
  }
  const segments = workspacePath.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] || workspacePath;
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

function buildWorkspaceConversationGroups(conversations, options = {}) {
  const { pinnedConversationRefs = [] } = options;
  const pinnedSet = new Set(pinnedConversationRefs);
  const groupsByKey = new Map();

  conversations.forEach((conversation, index) => {
    const groupKey = normalizeWorkspaceGroupKey(conversation);
    const timestampValue = Date.parse(conversation?.last_timestamp || '');
    const item = {
      key: conversation?.conversation_id || `workspace-conversation-${index}`,
      title: typeof conversation?.title === 'string' && conversation.title.trim()
        ? conversation.title.trim()
        : 'New chat',
      conversation,
      isPinned: pinnedSet.has(conversation?.conversation_id),
      timestampValue: Number.isNaN(timestampValue) ? 0 : timestampValue,
    };

    if (!groupsByKey.has(groupKey)) {
      groupsByKey.set(groupKey, {
        key: groupKey,
        title: normalizeWorkspaceGroupTitle(conversation),
        workspacePath: typeof conversation?.workspace_path === 'string'
          ? conversation.workspace_path.trim()
          : '',
        items: [],
        hasPinnedConversation: false,
        latestTimestampValue: item.timestampValue,
      });
    }

    const group = groupsByKey.get(groupKey);
    group.items.push(item);
    group.hasPinnedConversation = group.hasPinnedConversation || item.isPinned;
    group.latestTimestampValue = Math.max(group.latestTimestampValue, item.timestampValue);
  });

  return Array.from(groupsByKey.values())
    .map((group) => ({
      ...group,
      items: group.items.sort((left, right) => {
        if (left.isPinned !== right.isPinned) {
          return left.isPinned ? -1 : 1;
        }
        return right.timestampValue - left.timestampValue;
      }),
    }))
    .sort((left, right) => {
      if (left.hasPinnedConversation !== right.hasPinnedConversation) {
        return left.hasPinnedConversation ? -1 : 1;
      }
      return right.latestTimestampValue - left.latestTimestampValue;
    });
}

export { buildConversationGroups, buildWorkspaceConversationGroups };
