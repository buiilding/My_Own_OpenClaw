/**
 * Provides the markdown message module for the renderer UI.
 */

import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { highlightSanitizedHtml } from '../../../../../infrastructure/markdown';
import { buildMarkdownRenderModel } from '../../../utils/message/markdownMessageRendering';

export default function MarkdownMessage({
  text,
  sender = 'assistant',
  findQuery = '',
  findMatchIndexes = [],
  activeFindMatchIndex = null,
}) {
  const renderModel = useMemo(
    () => buildMarkdownRenderModel({
      text,
      sender,
    }),
    [text, sender],
  );
  const html = useMemo(
    () => highlightSanitizedHtml(
      renderModel.html,
      findQuery,
      findMatchIndexes,
      activeFindMatchIndex,
    ),
    [activeFindMatchIndex, findMatchIndexes, findQuery, renderModel.html],
  );
  return (
    <div
      className="message-content message-content-markdown"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

MarkdownMessage.propTypes = {
  text: PropTypes.string,
  sender: PropTypes.oneOf(['user', 'assistant']),
  findQuery: PropTypes.string,
  findMatchIndexes: PropTypes.arrayOf(PropTypes.number),
  activeFindMatchIndex: PropTypes.number,
};
