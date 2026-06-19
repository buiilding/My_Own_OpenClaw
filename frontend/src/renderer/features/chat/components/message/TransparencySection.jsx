/**
 * Provides the transparency section module for the renderer UI.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import {
  resolveTransparencySectionContentPresentation,
  serializeTransparencySectionContent,
} from '../../../../app/runtime/desktopMessageTransparencyRuntime';

function TransparencySection({ title, content, metadata, type = 'text' }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleCopy = () => {
    if (content == null) return;
    const textToCopy = serializeTransparencySectionContent(content);
    navigator.clipboard.writeText(textToCopy);
  };

  const renderContent = () => {
    const presentation = resolveTransparencySectionContentPresentation(content, type);
    return <pre className={presentation.className}>{presentation.text}</pre>;
  };

  return (
    <div className="transparency-section">
      <div className="transparency-header-container">
        <button
          className="transparency-header"
          onClick={() => setIsExpanded(!isExpanded)}
          type="button"
        >
          <span className="transparency-title">
            {isExpanded ? '▼' : '▶'} {title}
          </span>
        </button>
        {isExpanded && (
          <button
            className="transparency-copy-btn"
            onClick={handleCopy}
            type="button"
          >
            Copy
          </button>
        )}
      </div>
      {isExpanded && (
        <div className="transparency-body">
          {metadata && (
            <div className="transparency-metadata">
              {Object.entries(metadata).map(([key, value]) => (
                <div key={key} className="transparency-metadata-item">
                  <strong>{key}:</strong> {String(value)}
                </div>
              ))}
            </div>
          )}
          <div className="transparency-content">
            {renderContent()}
          </div>
        </div>
      )}
    </div>
  );
}

TransparencySection.propTypes = {
  title: PropTypes.string.isRequired,
  content: (props, propName, componentName) => {
    const value = props[propName];
    // Allow null, undefined, string, object, or array
    if (value === null || value === undefined) {
      return null; // Valid
    }
    if (typeof value === 'string' || typeof value === 'object') {
      return null; // Valid
    }
    return new Error(
      `Invalid prop \`${propName}\` supplied to \`${componentName}\`. ` +
      `Expected string, object, array, null, or undefined, but got ${typeof value}.`
    );
  },
  metadata: PropTypes.object,
  type: PropTypes.oneOf(['text', 'json', 'system-prompt', 'xml']),
};

export default TransparencySection;
