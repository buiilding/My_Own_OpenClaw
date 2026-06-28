/**
 * Owns targeted SDK ConversationView display-row lookup helpers.
 */

import type { ConversationView } from './desktopConversationRuntimeContracts';

type ConversationViewDisplayRow = ConversationView['displayRows'][number];
function exactNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    ? value
    : null;
}

function exactTurnRef(turnRef: string | null | undefined): string | null {
  return exactNonEmptyString(turnRef);
}

function exactConversationRef(conversationRef: unknown): string | null {
  return exactNonEmptyString(conversationRef);
}

function isConversationViewUserDisplayRow(
  row: unknown,
  viewConversationRef: string,
): row is ConversationViewDisplayRow {
  const source = row as Record<string, unknown>;
  return Boolean(
    row
      && typeof row === 'object'
      && exactConversationRef(source.conversationRef) === viewConversationRef
      && exactNonEmptyString(source.id)
      && source.role === 'user'
      && source.type === 'user_message',
  );
}

function findConversationViewUserDisplayRowForTurn(
  conversationView: ConversationView | null | undefined,
  turnRef: string | null | undefined,
): ConversationViewDisplayRow | null {
  const targetTurnRef = exactTurnRef(turnRef);
  const viewConversationRef = exactConversationRef(conversationView?.conversationRef);
  if (!targetTurnRef || !viewConversationRef || !Array.isArray(conversationView?.displayRows)) {
    return null;
  }
  for (let index = conversationView.displayRows.length - 1; index >= 0; index -= 1) {
    const row = conversationView.displayRows[index];
    if (
      isConversationViewUserDisplayRow(row, viewConversationRef)
      && exactTurnRef(row.turnRef) === targetTurnRef
    ) {
      return row;
    }
  }
  return null;
}

function hasConversationViewUserDisplayRows(
  conversationView: ConversationView | null | undefined,
): boolean {
  const viewConversationRef = exactConversationRef(conversationView?.conversationRef);
  const displayRows = conversationView?.displayRows;
  if (!viewConversationRef || !Array.isArray(displayRows)) {
    return false;
  }
  return displayRows.some((row) => isConversationViewUserDisplayRow(row, viewConversationRef));
}

export const DesktopConversationDisplayRowLookupRuntime = Object.freeze({
  findConversationViewUserDisplayRowForTurn,
  hasConversationViewUserDisplayRows,
});
