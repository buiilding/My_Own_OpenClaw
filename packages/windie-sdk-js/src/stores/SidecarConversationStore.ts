/**
 * Compatibility exports for the previous sidecar-named SDK conversation store module.
 */

export {
  LocalRuntimeConversationStore,
  LocalRuntimeConversationStore as SidecarConversationStore,
} from './LocalRuntimeConversationStore.js';

export type {
  LocalRuntimeConversationStoreEventWriteContext,
  LocalRuntimeConversationStoreEventWriteContext as SidecarConversationStoreEventWriteContext,
  LocalRuntimeConversationStoreEventWriteParams,
  LocalRuntimeConversationStoreEventWriteParams as SidecarConversationStoreEventWriteParams,
  LocalRuntimeConversationStoreOptions,
  LocalRuntimeConversationStoreOptions as SidecarConversationStoreOptions,
} from './LocalRuntimeConversationStore.js';
