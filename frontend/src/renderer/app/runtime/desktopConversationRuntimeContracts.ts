/**
 * Exposes SDK conversation runtime contracts for renderer feature clients.
 */

import {
  ConversationContinuityService,
} from '../../../../../packages/windie-sdk-js/src/runtime/ConversationContinuityService.js';
import {
  SDK_RUNTIME_COMMANDS,
} from '../../../../../packages/windie-sdk-js/src/runtime/SdkRuntimeCommands.js';
import {
  buildModelSettingsPatch,
} from '../../../../../packages/windie-sdk-js/src/settings/modelSelection.js';
import {
  resolveCorrelationId,
  resolveToolBundleCorrelationId,
  resolveToolCallCorrelationId,
  resolveToolOutputCorrelationId,
} from '../../../../../packages/windie-sdk-js/src/tools/toolCorrelationIds.js';

export type {
  AgentRuntimeTransport,
  CompactedReplaySnapshot,
  ConversationEvent,
  ConversationMetadata,
  CurrentTurnProjection,
  CurrentTurnToolEvent,
  DisplayConversation,
  JsonRecord,
  ListConversationOptions,
  SdkDisplayRow,
  TraceTimelineEntry,
  TurnInputResource,
} from '../../../../../packages/windie-sdk-js/src/conversation/types.js';
export type {
  ConversationMetadataInvalidationListener,
} from '../../../../../packages/windie-sdk-js/src/runtime/ConversationContinuityService.js';
export type {
  AgentModelSelection,
} from '../../../../../packages/windie-sdk-js/src/settings/modelSelection.js';

export const DesktopConversationRuntimeContracts = Object.freeze({
  ConversationContinuityService,
  SDK_RUNTIME_COMMANDS,
  buildModelSettingsPatch,
  resolveCorrelationId,
  resolveToolBundleCorrelationId,
  resolveToolCallCorrelationId,
  resolveToolOutputCorrelationId,
});
