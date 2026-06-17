/**
 * Implements the desktop conversation library client integration for the renderer UI.
 */

import {
  DesktopConversationContinuityService,
} from './desktopConversationContinuityService';
import { SDK_RUNTIME_COMMANDS } from '../../infrastructure/api/agentSdkClient';
import { invokeAgentSdkCommand } from './agentSdkCommandInvokeClient';

const CONVERSATION_METADATA_LIST_DIAGNOSTIC_PATH = 'conversation.metadata.list';
const LOCAL_RUNTIME_AVAILABILITY_ERROR_PATTERNS = Object.freeze([
  'local runtime not ready',
  'sidecar daemon request failed',
  'timed out waiting for sidecar daemon',
]);
const TRANSIENT_METADATA_LIST_ERROR_PATTERNS = Object.freeze([
  ...LOCAL_RUNTIME_AVAILABILITY_ERROR_PATTERNS,
  'request timed out',
  'failed to list stored conversations',
  'failed to fetch',
  'fetch failed',
  'econnrefused',
]);

function createDiagnosticId(prefix) {
  const randomUuid = globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${randomUuid}`;
}

function classifyDiagnosticError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  if (message.includes('active user id') || message.includes('active user')) {
    return 'active_user_id_required';
  }
  if (message.includes('does not match')) {
    return 'user_id_mismatch';
  }
  if (message.includes('memory store not initialized')) {
    return 'memory_store_not_initialized';
  }
  if (message.includes('sidecar') || message.includes('local runtime')) {
    return 'local_runtime_unavailable';
  }
  return 'runtime_error';
}

function isTransientMetadataListError(error) {
  const message = String(error?.message || error || '').trim().toLowerCase();
  if (!message) {
    return false;
  }
  return TRANSIENT_METADATA_LIST_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

function shortDiagnosticError(error) {
  const message = String(error?.message || error || 'Conversation metadata list failed')
    .replace(/\s+/g, ' ')
    .trim();
  return message.length > 160 ? `${message.slice(0, 157)}...` : message;
}

function emitConversationListDiagnostic(context, event) {
  const payload = {
    _diagnostics: context,
    stage: event.stage,
    status: event.status,
    runtime: event.runtime || 'renderer',
    durationMs: event.durationMs,
    data: {
      ...(event.data || {}),
      requestId: context.requestId,
    },
    error: event.error
      ? {
        code: classifyDiagnosticError(event.error),
        message: shortDiagnosticError(event.error),
      }
      : null,
  };
  void Promise.resolve(invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.DIAGNOSTICS_APPEND, payload)).catch(() => undefined);
}

function metadataToDashboardConversation(metadata) {
  return {
    conversation_id: metadata?.conversationRef,
    record_kind: 'chat_event',
    title: metadata?.title || metadata?.conversationRef || '',
    last_message: metadata?.lastMessage || '',
    last_timestamp: metadata?.updatedAt || '',
    entry_count: metadata?.eventCount || 0,
    workspace_path: metadata?.workspacePath || '',
    workspace_name: metadata?.workspaceName || '',
    snippet: metadata?.snippet || '',
    matched_role: metadata?.matchedRole || '',
  };
}

export const DesktopConversationLibraryClient = {
  isTransientMetadataListError,

  async listMetadata(userId, options) {
    const diagnostics = {
      path: CONVERSATION_METADATA_LIST_DIAGNOSTIC_PATH,
      traceId: createDiagnosticId('diag'),
      requestId: createDiagnosticId('req'),
    };
    if (typeof options?.onDiagnosticsContext === 'function') {
      options.onDiagnosticsContext(diagnostics);
    }
    const startedAt = Date.now();
    const hasUserId = typeof userId === 'string' && userId.trim().length > 0;
    emitConversationListDiagnostic(diagnostics, {
      stage: 'requested',
      status: 'succeeded',
      data: {
        hasUserId,
        userIdSource: options?.userIdSource || 'unknown',
        limit: options?.limit,
      },
    });
    emitConversationListDiagnostic(diagnostics, {
      stage: 'ipc_send',
      status: 'started',
      data: {
        hasUserId,
        limit: options?.limit,
      },
    });
    try {
      const metadata = await invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.CONVERSATIONS_LIST, {
        userId,
        limit: options?.limit,
        _diagnostics: diagnostics,
      });
      const resultCount = Array.isArray(metadata) ? metadata.length : 0;
      emitConversationListDiagnostic(diagnostics, {
        stage: 'ipc_send',
        status: 'succeeded',
        durationMs: Date.now() - startedAt,
        data: {
          hasUserId,
          limit: options?.limit,
          resultCount,
        },
      });
      emitConversationListDiagnostic(diagnostics, {
        stage: 'normalized',
        status: 'succeeded',
        durationMs: Date.now() - startedAt,
        data: {
          resultCount,
        },
      });
      return metadata;
    } catch (error) {
      emitConversationListDiagnostic(diagnostics, {
        stage: 'ipc_send',
        status: 'failed',
        durationMs: Date.now() - startedAt,
        data: {
          hasUserId,
          limit: options?.limit,
        },
        error,
      });
      throw error;
    }
  },

  emitConversationMetadataListRendered(diagnostics, event = {}) {
    if (!diagnostics) {
      return;
    }
    emitConversationListDiagnostic(diagnostics, {
      stage: 'rendered',
      status: event.status || 'succeeded',
      data: {
        resultCount: event.resultCount,
      },
      error: event.error,
    });
  },

  async loadForDisplay(userId, conversationRef) {
    const snapshot = await invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.CONVERSATION_LOAD_DISPLAY, {
      userId,
      conversationRef,
    });
    return snapshot?.display || { conversationRef, messages: [] };
  },

  async loadDisplayRows(userId, conversationRef) {
    const snapshot = await invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.CONVERSATION_LOAD_DISPLAY, {
      userId,
      conversationRef,
    });
    return Array.isArray(snapshot?.displayRows)
      ? snapshot.displayRows.filter((row) => row?.conversationRef === conversationRef)
      : [];
  },

  async deleteConversation(userId, conversationRef) {
    await invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.CONVERSATIONS_DELETE, {
      userId,
      conversationRef,
    });
  },

  async searchConversations(input) {
    const metadata = await invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.CONVERSATIONS_SEARCH, {
      userId: input.userId,
      query: input.query,
      limit: input.limit,
    });
    return Array.isArray(metadata)
      ? metadata.map(metadataToDashboardConversation)
      : [];
  },

  subscribeMetadataInvalidations(listener) {
    return DesktopConversationContinuityService.subscribeMetadataInvalidations(listener);
  },
};
