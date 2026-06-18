/**
 * Provides the highlighted plain text module for the renderer UI.
 */

import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { highlightPlainTextToHtml } from '../../../../../app/runtime/desktopMarkdownRuntimeClient';

export default function HighlightedPlainText({
  as: Component = 'span',
  className = '',
  text = '',
  findQuery = '',
  findMatchIndexes = [],
  activeFindMatchIndex = null,
}) {
  const html = useMemo(() => highlightPlainTextToHtml(
    text,
    findQuery,
    findMatchIndexes,
    activeFindMatchIndex,
  ), [activeFindMatchIndex, findMatchIndexes, findQuery, text]);

  return (
    <Component
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

HighlightedPlainText.propTypes = {
  as: PropTypes.oneOf(['span', 'div', 'pre']),
  className: PropTypes.string,
  text: PropTypes.string,
  findQuery: PropTypes.string,
  findMatchIndexes: PropTypes.arrayOf(PropTypes.number),
  activeFindMatchIndex: PropTypes.number,
};
