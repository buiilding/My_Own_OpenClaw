/**
 * Builds SDK conversation revision command inputs for ChatInterface.
 */

import { DesktopConversationContinuityService } from './desktopConversationContinuityService';

function normalizeRevisionId(revisionId) {
  return typeof revisionId === 'string' && revisionId.trim() ? revisionId.trim() : null;
}

function normalizeConversationRef(conversationRef) {
  return typeof conversationRef === 'string' && conversationRef.trim()
    ? conversationRef.trim()
    : null;
}

function resolveUserId(userId) {
  return typeof userId === 'string' && userId.trim() ? userId.trim() : 'default_user';
}

function shortRevisionId(revisionId) {
  return typeof revisionId === 'string' && revisionId.length > 10
    ? `${revisionId.slice(0, 10)}...`
    : revisionId || 'revision';
}

function revisionOperationLabel(operation) {
  if (operation === 'user_edit' || operation === 'edit') {
    return 'edit';
  }
  return operation || 'revision';
}

function buildRevisionActionId(action, revisionId) {
  const normalizedRevisionId = normalizeRevisionId(revisionId);
  return normalizedRevisionId && (action === 'checkout' || action === 'fork')
    ? `${action}:${normalizedRevisionId}`
    : null;
}

function buildRevisionCheckoutCommand({
  activeConversationRef = null,
  revisionId = null,
  userId = null,
} = {}) {
  const normalizedConversationRef = normalizeConversationRef(activeConversationRef);
  const normalizedRevisionId = normalizeRevisionId(revisionId);
  if (!normalizedConversationRef || !normalizedRevisionId) {
    return null;
  }
  return {
    actionId: `checkout:${normalizedRevisionId}`,
    input: {
      userId: resolveUserId(userId),
      conversationRef: normalizedConversationRef,
      revisionId: normalizedRevisionId,
    },
  };
}

function buildRevisionForkCommand({
  activeConversationRef = null,
  revision = null,
  userId = null,
} = {}) {
  const normalizedConversationRef = normalizeConversationRef(activeConversationRef);
  const normalizedRevisionId = normalizeRevisionId(revision?.revisionId);
  if (!normalizedConversationRef || !normalizedRevisionId) {
    return null;
  }
  return {
    actionId: `fork:${normalizedRevisionId}`,
    input: {
      userId: resolveUserId(userId),
      conversationRef: normalizedConversationRef,
      sourceRevisionId: normalizedRevisionId,
    },
  };
}

function buildRevisionMenuItems({
  activeRevisionId = null,
  revisionActionId = null,
  revisions = [],
} = {}) {
  const normalizedActiveRevisionId = normalizeRevisionId(activeRevisionId);
  const activeActionId = typeof revisionActionId === 'string' ? revisionActionId : null;
  const revisionList = Array.isArray(revisions) ? revisions : [];
  return revisionList.map((revision, index) => {
    const revisionId = normalizeRevisionId(revision?.revisionId);
    const checkoutActionId = buildRevisionActionId('checkout', revisionId);
    const forkActionId = buildRevisionActionId('fork', revisionId);
    const shortId = shortRevisionId(revisionId);
    const isActive = Boolean(revisionId && revisionId === normalizedActiveRevisionId);
    return {
      key: revisionId || `revision:${index}`,
      revision,
      revisionId,
      shortId,
      metaLabel: isActive ? 'active' : revisionOperationLabel(revision?.operation),
      isActive,
      checkoutDisabled: !revisionId || activeActionId === checkoutActionId,
      forkDisabled: !revisionId || activeActionId === forkActionId,
      forkAriaLabel: `Fork revision ${shortId}`,
    };
  });
}

function markActiveRevisionInList(revisions = [], revisionId = null) {
  const normalizedRevisionId = normalizeRevisionId(revisionId);
  const revisionList = Array.isArray(revisions) ? revisions : [];
  return revisionList.map((revision) => ({
    ...revision,
    active: Boolean(
      normalizedRevisionId
        && normalizeRevisionId(revision?.revisionId) === normalizedRevisionId,
    ),
  }));
}

function markActiveRevisionFromCheckoutResult(revisions = [], checkoutResult = null) {
  return markActiveRevisionInList(revisions, checkoutResult?.revisionId);
}

async function loadRevisionOptions({
  activeConversationRef = null,
  limit = 50,
  userId = null,
} = {}) {
  const conversationRef = normalizeConversationRef(activeConversationRef);
  if (!conversationRef) {
    return [];
  }
  const revisions = await DesktopConversationContinuityService.listRevisions(
    resolveUserId(userId),
    conversationRef,
    limit,
  );
  return Array.isArray(revisions) ? revisions : [];
}

async function executeRevisionCheckoutCommand(command = null) {
  if (!command?.input) {
    return null;
  }
  const result = await DesktopConversationContinuityService.checkoutRevision(command.input);
  return {
    actionId: command.actionId ?? null,
    revisionId: normalizeRevisionId(command.input.revisionId),
    result,
    view: result?.view ?? null,
  };
}

async function executeRevisionForkCommand(command = null) {
  if (!command?.input) {
    return null;
  }
  const result = await DesktopConversationContinuityService.forkConversation(command.input);
  return {
    actionId: command.actionId ?? null,
    conversationRef: normalizeConversationRef(result?.conversationRef),
    result,
    view: result?.view ?? null,
  };
}

export const DesktopChatRevisionActionRuntime = Object.freeze({
  buildRevisionMenuItems,
  buildRevisionCheckoutCommand,
  buildRevisionForkCommand,
  executeRevisionCheckoutCommand,
  executeRevisionForkCommand,
  loadRevisionOptions,
  markActiveRevisionFromCheckoutResult,
  markActiveRevisionInList,
  normalizeRevisionId,
});
