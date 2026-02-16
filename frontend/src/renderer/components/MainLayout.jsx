import PropTypes from 'prop-types';
import '../styles/MainLayout.css';

/**
 * Provides the main structural layout for the application.
 * It includes a section selector sidebar and a main content panel.
 */
function MainLayout({ sections, activeSection, onSelectSection, content }) {
  return (
    <div className="main-layout">
      <div className="ambient-backdrop" aria-hidden="true" />
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand-mark">OC</div>
          <div className="brand-text">
            <h2>WindieOS</h2>
            <span>Desktop assistant</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          <ul>
            {sections.map((section) => {
              const isActive = section.id === activeSection;
              return (
                <li key={section.id} className={isActive ? 'active' : ''}>
                  <button type="button" onClick={() => onSelectSection(section.id)}>
                    <span className="nav-label">{section.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
      <main className="main-content">{content}</main>
    </div>
  );
}

MainLayout.propTypes = {
  sections: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    })
  ).isRequired,
  activeSection: PropTypes.string.isRequired,
  onSelectSection: PropTypes.func.isRequired,
  content: PropTypes.node.isRequired,
};

export default MainLayout;
