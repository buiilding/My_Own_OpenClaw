/**
 * Provides the dashboard sidebar navigation module for the renderer UI.
 */

import PropTypes from 'prop-types';
import {
  PenSquare,
  Search,
  Brain,
  BarChart3,
  Cpu,
  Cable,
} from 'lucide-react';
import {
  getDashboardPanelNavItems,
  getDashboardPrimaryNavItems,
} from '../../../../app/runtime/desktopDashboardNavigationRuntime';

const DASHBOARD_NAV_ICONS = Object.freeze({
  penSquare: PenSquare,
  search: Search,
  brain: Brain,
  barChart3: BarChart3,
  cpu: Cpu,
  cable: Cable,
});

function SidebarItem({
  label,
  icon: Icon,
  onClick = undefined,
  isActive = false,
  collapsed = false,
}) {
  return (
    <button
      type="button"
      className={`cg-nav-item${isActive ? ' active' : ''}${collapsed ? ' collapsed' : ''}`.trim()}
      onClick={onClick}
      aria-label={label}
      title={collapsed ? label : undefined}
    >
      <span className="cg-nav-item-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      {!collapsed ? <span className="cg-nav-item-label">{label}</span> : null}
    </button>
  );
}

SidebarItem.propTypes = {
  label: PropTypes.string.isRequired,
  icon: PropTypes.elementType.isRequired,
  onClick: PropTypes.func,
  isActive: PropTypes.bool,
  collapsed: PropTypes.bool,
};

export default function DashboardSidebarNavigation({
  collapsed = false,
  onStartNewChat,
  onOpenSearch,
  onOpenMemory,
  onOpenUsage,
  onOpenModels,
  onOpenMcps,
  searchOpen,
  memoryOpen,
  usageOpen,
  modelsOpen,
  mcpsOpen,
}) {
  const primaryNavItems = getDashboardPrimaryNavItems({ collapsed });
  const panelNavItems = getDashboardPanelNavItems();
  const primaryActions = {
    'new-chat': onStartNewChat,
    search: onOpenSearch,
  };
  const panelActions = {
    memory: onOpenMemory,
    usage: onOpenUsage,
    models: onOpenModels,
    mcps: onOpenMcps,
  };
  const activeByItemId = {
    search: searchOpen,
    memory: memoryOpen,
    usage: usageOpen,
    models: modelsOpen,
    mcps: mcpsOpen,
  };

  const renderSidebarItem = (item, actionsById) => {
    const Icon = DASHBOARD_NAV_ICONS[item.iconKey] || PenSquare;
    return (
      <SidebarItem
        key={item.id}
        label={item.label}
        icon={Icon}
        onClick={actionsById[item.id]}
        isActive={activeByItemId[item.id] === true}
        collapsed={collapsed}
      />
    );
  };

  return (
    <>
      <nav className="cg-sidebar-nav">
        {primaryNavItems.map((item) => renderSidebarItem(item, primaryActions))}
      </nav>

      <div className="cg-sidebar-divider" />

      <nav className="cg-sidebar-nav">
        {panelNavItems.map((item) => renderSidebarItem(item, panelActions))}
      </nav>
    </>
  );
}

DashboardSidebarNavigation.propTypes = {
  collapsed: PropTypes.bool,
  onStartNewChat: PropTypes.func.isRequired,
  onOpenSearch: PropTypes.func.isRequired,
  onOpenMemory: PropTypes.func.isRequired,
  onOpenUsage: PropTypes.func.isRequired,
  onOpenModels: PropTypes.func.isRequired,
  onOpenMcps: PropTypes.func.isRequired,
  searchOpen: PropTypes.bool.isRequired,
  memoryOpen: PropTypes.bool.isRequired,
  usageOpen: PropTypes.bool.isRequired,
  modelsOpen: PropTypes.bool.isRequired,
  mcpsOpen: PropTypes.bool.isRequired,
};
