import { useMemo, useRef } from 'react';
import { sanitizeMarkdownHtml, toSanitizedMarkdownHtml } from '../../infrastructure/markdown';
import { useResponseOverlayWindowSync } from '../chat/hooks/useResponseOverlayWindowSync';
import { RESPONSE_OVERLAY_LAYOUT_MODE } from '../chat/utils/overlay/responseOverlayLayoutMode';
import {
  buildCurrentTurnMessagesFromProjection,
  buildCurrentTurnResponseOverlayEntries,
} from '../chat/utils/state/chatBoxResponseState';
import { useMinimalCurrentTurn } from './useMinimalCurrentTurn';

function renderEntry(entry) {
  if (!entry) {
    return null;
  }
  if (entry.type === 'llm-text') {
    const markdownHtml = toSanitizedMarkdownHtml(entry.text || '', { enableMath: true });
    return (
      <div
        className="minimal-response-text minimal-response-markdown"
        dangerouslySetInnerHTML={{ __html: sanitizeMarkdownHtml(markdownHtml) }}
      />
    );
  }
  return (
    <div className={`minimal-response-text minimal-response-${entry.type || 'plain'}`}>
      {entry.text}
    </div>
  );
}

export default function MinimalResponseOverlay() {
  const shellRef = useRef(null);
  const { currentTurn, hasContent } = useMinimalCurrentTurn();
  const currentTurnMessages = useMemo(
    () => buildCurrentTurnMessagesFromProjection(currentTurn),
    [currentTurn],
  );
  const entries = useMemo(
    () => buildCurrentTurnResponseOverlayEntries(currentTurnMessages),
    [currentTurnMessages],
  );
  const visibleEntries = hasContent ? entries : [];
  const responseEntrySignature = visibleEntries
    .map((entry) => `${entry.id}:${entry.text}`)
    .join('\u0001');
  const isVisible = visibleEntries.length > 0;

  useResponseOverlayWindowSync({
    shellRef,
    isVisible,
    overlayLayoutMode: isVisible
      ? RESPONSE_OVERLAY_LAYOUT_MODE.RESPONSE
      : RESPONSE_OVERLAY_LAYOUT_MODE.HIDDEN,
    responseEntrySignature,
    showResponse: isVisible,
    thinkingText: currentTurn?.reasoningText || '',
  });

  if (!isVisible) {
    return null;
  }

  return (
    <div className="minimal-response-shell-wrap">
      <div className="minimal-response-shell" ref={shellRef}>
        <div className="minimal-response-panel">
          {visibleEntries.map((entry) => (
            <div
              key={entry.id}
              className={`minimal-response-entry minimal-response-entry-${entry.type || 'plain'}`}
            >
              {renderEntry(entry)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
