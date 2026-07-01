/**
 * Provides the manual trail context panel for projected tool calls.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Activity,
  AppWindow,
  Clock,
  FileText,
  Globe2,
  Keyboard,
  Monitor,
  MousePointerClick,
  Search,
  Terminal,
  Wrench,
  X,
} from 'lucide-react';
import { DesktopTrailContextRuntime } from '../../../app/runtime/desktopTrailContextRuntime';

const {
  buildTrailContextEntries,
} = DesktopTrailContextRuntime;

const TRAIL_MIN_WIDTH = 280;
const TRAIL_DEFAULT_WIDTH = 320;
const TRAIL_MAX_WIDTH = 520;

const TRAIL_ICONS = Object.freeze({
  activity: Activity,
  app: AppWindow,
  browser: Globe2,
  clock: Clock,
  computer: MousePointerClick,
  file: FileText,
  keyboard: Keyboard,
  screenshot: Monitor,
  search: Search,
  terminal: Terminal,
  tool: Wrench,
});

function clampTrailWidth(width) {
  return Math.min(TRAIL_MAX_WIDTH, Math.max(TRAIL_MIN_WIDTH, width));
}

function TrailContextPanel({
  messages,
  onClose,
}) {
  const [width, setWidth] = useState(TRAIL_DEFAULT_WIDTH);
  const dragStateRef = useRef(null);
  const entries = useMemo(() => buildTrailContextEntries(messages, {
    fallbackDate: new Date(),
  }), [messages]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }
      setWidth(clampTrailWidth(dragState.startWidth + dragState.startX - event.clientX));
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
      document.body.classList.remove('trail-context-resizing');
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      document.body.classList.remove('trail-context-resizing');
    };
  }, []);

  const handleResizePointerDown = (event) => {
    event.preventDefault();
    dragStateRef.current = {
      startWidth: width,
      startX: event.clientX,
    };
    document.body.classList.add('trail-context-resizing');
  };

  return (
    <aside
      className="trail-context-panel"
      style={{ width: `${width}px` }}
      aria-label="Trail context"
    >
      <button
        type="button"
        className="trail-context-resize-handle"
        aria-label="Resize trail context"
        onPointerDown={handleResizePointerDown}
      />
      <div className="trail-context-header">
        <div className="trail-context-title">
          <Activity size={18} aria-hidden="true" />
          <span>Trail context</span>
        </div>
        <button
          type="button"
          className="trail-context-close"
          aria-label="Close trail context"
          title="Close trail context"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>
      <div className="trail-context-log" role="log" aria-live="polite">
        {entries.length > 0 ? entries.map((entry) => {
          const Icon = TRAIL_ICONS[entry.iconKey] || Wrench;
          return (
            <div className="trail-context-log-line" key={entry.id}>
              <span className="trail-context-log-icon" aria-hidden="true">
                <Icon size={15} />
              </span>
              <span className="trail-context-log-text" title={entry.actionText}>
                {entry.actionText}
              </span>
              <time className="trail-context-log-time">{entry.timeLabel}</time>
            </div>
          );
        }) : (
          <div className="trail-context-empty">No tool calls yet</div>
        )}
      </div>
    </aside>
  );
}

TrailContextPanel.propTypes = {
  messages: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    type: PropTypes.string,
    text: PropTypes.string,
    timestamp: PropTypes.string,
    toolCallDisplayText: PropTypes.string,
    toolCallDetails: PropTypes.object,
    toolName: PropTypes.string,
  })).isRequired,
  onClose: PropTypes.func.isRequired,
};

export default TrailContextPanel;
