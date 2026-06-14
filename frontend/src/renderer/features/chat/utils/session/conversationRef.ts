/**
 * Provides the conversation ref module for the renderer UI.
 */

export const createConversationRef = (): string => `conv_${crypto.randomUUID()}`;
