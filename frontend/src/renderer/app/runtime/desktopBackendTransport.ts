import type { BackendTransport } from '../../infrastructure/api/windieSdkClient';
import {
  DesktopBackendCommandRuntimeClient,
  type RehydrateConversationEntry,
  type SendConversationQueryInput,
} from './desktopBackendCommandRuntimeClient';
import { DesktopSettingsRuntimeClient } from './desktopSettingsRuntimeClient';

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function optionalStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const normalized = value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim());
  return normalized.length > 0 ? normalized : null;
}

export function createDesktopBackendTransport(workspacePath: string | null = null): BackendTransport {
  return {
    connect: async () => undefined,
    handshake: async () => undefined,
    sendQuery: async (payload) => {
      await DesktopBackendCommandRuntimeClient.sendQuery({
        text: optionalString(payload.text) ?? '',
        conversationRef: optionalString(payload.conversation_ref)
          ?? optionalString(payload.conversationRef)
          ?? '',
        screenshotRef: optionalString(payload.screenshot_ref)
          ?? optionalString(payload.screenshotRef),
        screenshotUrl: optionalString(payload.screenshot_url)
          ?? optionalString(payload.screenshotUrl),
        screenshotRefs: optionalStringArray(payload.screenshot_refs)
          ?? optionalStringArray(payload.screenshotRefs),
        captureMeta: (payload.capture_meta ?? payload.captureMeta ?? null) as SendConversationQueryInput['captureMeta'],
        attachmentContext: optionalString(payload.attachment_context)
          ?? optionalString(payload.attachmentContext),
        attachmentFilenames: optionalStringArray(payload.attachment_filenames)
          ?? optionalStringArray(payload.attachmentFilenames),
        screenshot: optionalString(payload.screenshot),
        workspacePath: optionalString(payload.workspace_path)
          ?? optionalString(payload.workspacePath)
          ?? workspacePath,
      });
      return optionalString(payload.turn_ref) ?? optionalString(payload.turnRef) ?? '';
    },
    sendToolResult: async () => undefined,
    sendToolBundleResult: async () => undefined,
    rehydrateConversation: async (payload) => {
      await DesktopBackendCommandRuntimeClient.rehydrateConversation({
        conversationRef: optionalString(payload.conversation_ref)
          ?? optionalString(payload.conversationRef)
          ?? '',
        messages: Array.isArray(payload.messages)
          ? payload.messages as RehydrateConversationEntry[]
          : [],
        workspacePath: optionalString(payload.workspace_path)
          ?? optionalString(payload.workspacePath)
          ?? workspacePath,
      });
    },
    compactHistory: async () => undefined,
    wakewordDetected: async () => undefined,
    updateSettings: async (payload) => {
      DesktopSettingsRuntimeClient.updateSettings(payload);
      return undefined;
    },
    listModels: async () => undefined,
    stop: async (payload) => {
      DesktopBackendCommandRuntimeClient.stop(
        optionalString(payload.conversation_ref) ?? optionalString(payload.conversationRef),
      );
    },
    subscribe: () => () => undefined,
    close: async () => undefined,
  };
}
