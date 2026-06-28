/**
 * Coordinates renderer chat message state builders and normalization helpers.
 */

import {
  normalizeIncomingText,
} from '../../infrastructure/text/incomingTextNormalization';
import {
  buildToolBundleMessageState,
  buildToolCallMessageState,
} from '../../infrastructure/transcript/toolCallMessageState';
import {
  buildToolCallChatMessageState,
} from '../../infrastructure/transcript/toolCallChatMessageState';
import {
  normalizeToolSchemaList,
} from '../../infrastructure/transcript/toolSchemaShape';

export const DesktopChatMessageRuntimeClient = Object.freeze({
  normalizeIncomingText,
  buildToolBundleMessageState,
  buildToolCallMessageState,
  buildToolCallChatMessageState,
  normalizeToolSchemaList,
});
