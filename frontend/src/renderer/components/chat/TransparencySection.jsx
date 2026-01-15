import { useState } from 'react';
import PropTypes from 'prop-types';

function TransparencySection({ title, content, metadata, type = 'text' }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleCopy = () => {
    if (content == null) return; // Handle null/undefined
    const textToCopy = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    navigator.clipboard.writeText(textToCopy);
  };

  const renderContent = () => {
    // Handle null/undefined content
    if (content == null) {
      return <pre className="transparency-content-text">No content available</pre>;
    }

    if (type === 'json' || type === 'system-prompt') {
      try {
        const jsonContent = typeof content === 'string' ? JSON.parse(content) : content;
        return (
          <pre className="transparency-content-json">
            {JSON.stringify(jsonContent, null, 2)}
          </pre>
        );
      } catch (e) {
        return <pre className="transparency-content-text">{String(content)}</pre>;
      }
    }
    if (type === 'xml') {
      // For XML content (like full messages with system_context, memory tags, etc.)
      // Preserve formatting and show as preformatted text
      return <pre className="transparency-content-text" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{String(content)}</pre>;
    }
    return <pre className="transparency-content-text">{String(content)}</pre>;
  };

  return (
    <div className="transparency-section">
      <button
        className="transparency-header"
        onClick={() => setIsExpanded(!isExpanded)}
        type="button"
      >
        <span className="transparency-title">
          {isExpanded ? '▼' : '▶'} {title}
        </span>
        {isExpanded && (
          <button
            className="transparency-copy-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            type="button"
          >
            Copy
          </button>
        )}
      </button>
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

