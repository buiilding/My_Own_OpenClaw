/**
 * Compatibility adapter for SDK display-row chat message projection.
 */

import {
  DesktopSdkDisplayChatMessageProjectionRuntime,
} from '../../app/runtime/desktopSdkDisplayChatMessageProjectionRuntime';

const {
  buildChatMessagesFromSdkDisplayRows,
} = DesktopSdkDisplayChatMessageProjectionRuntime;

export {
  buildChatMessagesFromSdkDisplayRows,
};
