/**
 * Provides the chat context module for the renderer UI.
 */

import { createContext } from 'react';

const EMPTY_CHAT_CONTEXT = Object.freeze({});
const ChatContext = createContext(undefined);

export { ChatContext, EMPTY_CHAT_CONTEXT };
