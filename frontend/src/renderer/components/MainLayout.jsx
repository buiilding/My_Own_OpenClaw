import PropTypes from 'prop-types';
import '../styles/MainLayout.css';

/**
 * Provides the main structural layout for the application.
 * It includes a sidebar for navigation and a main content area
 * where the primary interface is displayed.
 *
 * @param {object} props - The component's props.
 * @param {React.ReactNode} props.children - The child components to be rendered within the main content area.
 */
function MainLayout({ children }) {
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
            {/* <li>Settings</li> */}
            {/* <li>Memory</li> */}
          </ul>
        </nav>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}

MainLayout.propTypes = {
  children: PropTypes.node.isRequired,
};

export default MainLayout;
