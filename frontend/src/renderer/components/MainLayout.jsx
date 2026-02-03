import PropTypes from 'prop-types';
import '../styles/MainLayout.css';

/**
 * Provides the main structural layout for the application.
 * It includes a sidebar and dedicated areas for the chat and settings panels.
 *
 * @param {object} props - The component's props.
 * @param {React.ReactNode} props.chat - The chat component.
 * @param {React.ReactNode} props.settings - The settings component.
 */
function MainLayout({ chat, settings }) {
  return (
    <div className="main-layout">
      <div className="ambient-backdrop" aria-hidden="true" />
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand-mark">OC</div>
          <div className="brand-text">
            <h2>OpenClaw</h2>
            <span>Desktop assistant</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          <ul>
            <li className="active">
              <span className="nav-label">Chat</span>
              <span className="nav-status">Active</span>
            </li>
            {/* Future navigation links will go here */}
          </ul>
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" aria-hidden="true" />
          <span>Ready</span>
        </div>
      </aside>
      <main className="main-content">{chat}</main>
      <aside className="settings-sidebar">{settings}</aside>
    </div>
  );
}

MainLayout.propTypes = {
  chat: PropTypes.node.isRequired,
  settings: PropTypes.node.isRequired,
};

export default MainLayout;
