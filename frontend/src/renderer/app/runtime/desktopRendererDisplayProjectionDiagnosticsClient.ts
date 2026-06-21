/**
 * Persists sanitized renderer display projection diagnostics.
 */

import { AgentSdkCommandInvokeClient } from './agentSdkCommandInvokeClient';
import { DesktopConversationRuntimeContracts } from './desktopConversationRuntimeContracts';

export const RENDERER_DISPLAY_PROJECTION_DIAGNOSTIC_PATH = 'renderer.display_projection';

const {
  invokeAgentSdkCommand,
} = AgentSdkCommandInvokeClient;
const {
  SDK_RUNTIME_COMMANDS,
} = DesktopConversationRuntimeContracts;

function createDiagnosticId(prefix: string): string {
  const randomUuid = globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${randomUuid}`;
}

function diagnosticString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function appendDisplayRowsProjectionDiagnostic(payload: Record<string, unknown>): void {
  const conversationRef = diagnosticString(payload.conversationRef);
  void Promise.resolve(invokeAgentSdkCommand(SDK_RUNTIME_COMMANDS.DIAGNOSTICS_APPEND, {
    _diagnostics: {
      path: RENDERER_DISPLAY_PROJECTION_DIAGNOSTIC_PATH,
      traceId: createDiagnosticId('diag'),
      requestId: createDiagnosticId('req'),
      conversationRef,
    },
    stage: 'projected',
    status: 'succeeded',
    runtime: 'renderer',
    data: {
      ...payload,
      action: 'display_rows_projected',
      event: 'renderer.display_rows.projected',
    },
  })).catch(() => undefined);
}

export const DesktopRendererDisplayProjectionDiagnosticsClient = Object.freeze({
  appendDisplayRowsProjectionDiagnostic,
});
