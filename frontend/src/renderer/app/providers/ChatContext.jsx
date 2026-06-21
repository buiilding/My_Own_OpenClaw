/**
 * Provides the chat context module for the renderer UI.
 */

/* eslint-disable react-refresh/only-export-components */
import { createContext } from 'react';

export const EMPTY_CHAT_CONTEXT = Object.freeze({});
export const ChatContext = createContext(undefined);
