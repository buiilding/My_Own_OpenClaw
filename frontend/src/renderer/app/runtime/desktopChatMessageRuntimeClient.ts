/**
 * Coordinates renderer chat message state builders and normalization helpers.
 */

export {
  normalizeIncomingText,
} from '../../infrastructure/text/incomingTextNormalization';
export {
  buildToolBundleMessageState,
  buildToolCallMessageState,
} from '../../infrastructure/transcript/toolCallMessageState';
export {
  buildToolCallChatMessageState,
} from '../../infrastructure/transcript/toolCallChatMessageState';
export {
  buildToolOutputChatMessageState,
} from '../../infrastructure/transcript/toolOutputChatMessageState';
export {
  normalizeToolSchemaList,
} from '../../infrastructure/transcript/toolSchemaShape';
