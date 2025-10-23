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
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>Assistant</h2>
        </div>
        <nav className="sidebar-nav">
          <ul>
            <li className="active">Chat</li>
            {/* Future navigation links will go here */}
          </ul>
        </nav>
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
