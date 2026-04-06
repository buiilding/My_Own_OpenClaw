const STORAGE_KEY = 'conversation-workspace-bindings';

function getLastPathSegment(pathValue = '') {
  if (typeof pathValue !== 'string') {
    return '';
  }
  const trimmed = pathValue.trim().replace(/[\\/]+$/, '');
  if (!trimmed) {
    return '';
  }
  const segments = trimmed.split(/[\\/]/).filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : trimmed;
}

function normalizeWorkspacePath(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function normalizeWorkspaceName(value, workspacePath) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  const fallbackName = getLastPathSegment(workspacePath);
  return fallbackName || '';
}

function normalizeConversationRef(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function normalizeWorkspaceBinding(binding = null) {
  const workspacePath = normalizeWorkspacePath(binding?.workspacePath);
  if (!workspacePath) {
    return {
      workspacePath: '',
      workspaceName: '',
    };
  }
  return {
    workspacePath,
    workspaceName: normalizeWorkspaceName(binding?.workspaceName, workspacePath),
  };
}

function readStoredBindings() {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return Object.entries(parsed).reduce((accumulator, [conversationRef, binding]) => {
      const normalizedConversationRef = normalizeConversationRef(conversationRef);
      if (!normalizedConversationRef) {
        return accumulator;
      }
      accumulator[normalizedConversationRef] = normalizeWorkspaceBinding(binding);
      return accumulator;
    }, {});
  } catch (_error) {
    return {};
  }
}

function writeStoredBindings(bindings) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch (_error) {
    // Ignore storage failures.
  }
}

let bindingCache = readStoredBindings();

export function workspaceSelectionToBinding(workspace = null) {
  return normalizeWorkspaceBinding({
    workspacePath: workspace?.activeWorkspacePath,
    workspaceName: workspace?.activeWorkspaceName,
  });
}

export function areWorkspaceBindingsEqual(left, right) {
  const normalizedLeft = normalizeWorkspaceBinding(left);
  const normalizedRight = normalizeWorkspaceBinding(right);
  return (
    normalizedLeft.workspacePath === normalizedRight.workspacePath
    && normalizedLeft.workspaceName === normalizedRight.workspaceName
  );
}

export function getConversationWorkspaceBinding(conversationRef) {
  const normalizedConversationRef = normalizeConversationRef(conversationRef);
  if (!normalizedConversationRef) {
    return normalizeWorkspaceBinding(null);
  }
  return bindingCache[normalizedConversationRef] || normalizeWorkspaceBinding(null);
}

export function setConversationWorkspaceBinding(conversationRef, binding = null) {
  const normalizedConversationRef = normalizeConversationRef(conversationRef);
  if (!normalizedConversationRef) {
    return normalizeWorkspaceBinding(null);
  }
  const normalizedBinding = normalizeWorkspaceBinding(binding);
  bindingCache = {
    ...bindingCache,
    [normalizedConversationRef]: normalizedBinding,
  };
  writeStoredBindings(bindingCache);
  return normalizedBinding;
}

export function clearConversationWorkspaceBinding(conversationRef) {
  const normalizedConversationRef = normalizeConversationRef(conversationRef);
  if (!normalizedConversationRef || !bindingCache[normalizedConversationRef]) {
    return;
  }
  const nextBindings = { ...bindingCache };
  delete nextBindings[normalizedConversationRef];
  bindingCache = nextBindings;
  writeStoredBindings(bindingCache);
}

export function resolveConversationWorkspaceBinding({
  conversation = null,
  memories = [],
} = {}) {
  const conversationBinding = normalizeWorkspaceBinding({
    workspacePath: conversation?.workspace_path,
    workspaceName: conversation?.workspace_name,
  });
  if (conversationBinding.workspacePath) {
    return conversationBinding;
  }

  if (!Array.isArray(memories)) {
    return normalizeWorkspaceBinding(null);
  }

  for (const memory of memories) {
    const metadata = memory?.metadata;
    const memoryBinding = normalizeWorkspaceBinding({
      workspacePath: metadata?.workspace_path,
      workspaceName: metadata?.workspace_name,
    });
    if (memoryBinding.workspacePath) {
      return memoryBinding;
    }
  }

  return normalizeWorkspaceBinding(null);
}
