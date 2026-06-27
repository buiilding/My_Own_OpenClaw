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

function isConversationViewUserDisplayRow(row: unknown): row is ConversationViewDisplayRow {
  return Boolean(
    row
      && typeof row === 'object'
      && (
        (row as Record<string, unknown>).role === 'user'
        || (row as Record<string, unknown>).type === 'user_message'
      ),
  );
}

function findConversationViewUserDisplayRowForTurn(
  conversationView: ConversationView | null | undefined,
  turnRef: string | null | undefined,
): ConversationViewDisplayRow | null {
  const targetTurnRef = exactTurnRef(turnRef);
  if (!targetTurnRef || !Array.isArray(conversationView?.displayRows)) {
    return null;
  }
  for (let index = conversationView.displayRows.length - 1; index >= 0; index -= 1) {
    const row = conversationView.displayRows[index];
    if (
      isConversationViewUserDisplayRow(row)
      && exactTurnRef(row.turnRef) === targetTurnRef
      && exactNonEmptyString(row.id)
    ) {
      return row;
    }
  }
  return null;
}

function hasConversationViewUserDisplayRows(
  conversationView: unknown,
): boolean {
  const displayRows = conversationView && typeof conversationView === 'object'
    ? (conversationView as { displayRows?: unknown[] | null }).displayRows
    : null;
  if (!Array.isArray(displayRows)) {
    return false;
  }
  return displayRows.some(isConversationViewUserDisplayRow);
}

export const DesktopConversationDisplayRowLookupRuntime = Object.freeze({
  findConversationViewUserDisplayRowForTurn,
  hasConversationViewUserDisplayRows,
});
