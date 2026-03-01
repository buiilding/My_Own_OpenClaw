import { useCallback, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Settings,
} from 'lucide-react';
import { useDismissOnOutside } from './useDismissOnOutside';

function SidebarUserButton({ collapsed = false, onClick, isExpanded = false }) {
  return (
    <button
      type="button"
      className={`cg-user-button${collapsed ? ' collapsed' : ''}`}
      onClick={onClick}
      aria-label="Open profile menu"
      aria-expanded={isExpanded}
      title={collapsed ? 'Profile menu' : undefined}
      data-testid="sidebar-user-menu-trigger"
    >
      <span className="cg-user-avatar" aria-hidden="true">U</span>
      {!collapsed ? (
        <span className="cg-user-meta">
          <span className="cg-user-name">User</span>
        </span>
      ) : null}
    </button>
  );
}

SidebarUserButton.propTypes = {
  collapsed: PropTypes.bool,
  onClick: PropTypes.func.isRequired,
  isExpanded: PropTypes.bool,
};

export default function DashboardSidebarUserMenu({ collapsed = false, onOpenSettings }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef(null);
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  useDismissOnOutside({
    isOpen: menuOpen,
    containerRef,
    onDismiss: closeMenu,
  });

  const handleOpenSettings = (tab = 'general') => {
    closeMenu();
    onOpenSettings(tab);
  };

  return (
    <div ref={containerRef} className={`cg-user-menu-wrap${collapsed ? ' collapsed' : ''}`}>
      <SidebarUserButton
        collapsed={collapsed}
        onClick={() => setMenuOpen((current) => !current)}
        isExpanded={menuOpen}
      />
      {menuOpen ? (
        <div
          className={`cg-user-menu${collapsed ? ' collapsed' : ''}`}
          role="menu"
          aria-label="Profile menu"
        >
          <div className="cg-user-menu-header">
            <span className="cg-user-avatar" aria-hidden="true">U</span>
            <div className="cg-user-menu-meta">
              <p>User</p>
              <span>@user</span>
            </div>
          </div>

          <button
            type="button"
            className="cg-user-menu-item"
            onClick={() => handleOpenSettings('general')}
            role="menuitem"
            data-testid="sidebar-user-menu-settings"
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

DashboardSidebarUserMenu.propTypes = {
  collapsed: PropTypes.bool,
  onOpenSettings: PropTypes.func.isRequired,
};
