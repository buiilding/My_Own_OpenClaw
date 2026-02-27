import PropTypes from 'prop-types';
import {
  PenSquare,
  Search,
  Brain,
  BarChart3,
  Cpu,
} from 'lucide-react';

const PRIMARY_NAV_ITEMS = Object.freeze([
  { id: 'new-chat', label: 'New chat', icon: PenSquare },
  { id: 'search', label: 'Search chats', icon: Search },
]);

const PRODUCT_NAV_ITEMS = Object.freeze([
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'usage', label: 'Usage', icon: BarChart3 },
  { id: 'models', label: 'Models', icon: Cpu },
]);

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
  searchOpen,
  memoryOpen,
  usageOpen,
  modelsOpen,
}) {
  const primaryNavItems = collapsed
    ? PRIMARY_NAV_ITEMS.filter((item) => item.id !== 'new-chat')
    : PRIMARY_NAV_ITEMS;

  return (
    <>
      <nav className="cg-sidebar-nav">
        {primaryNavItems.map((item) => (
          <SidebarItem
            key={item.id}
            label={item.label}
            icon={item.icon}
            onClick={item.id === 'new-chat' ? onStartNewChat : onOpenSearch}
            isActive={item.id === 'search' && searchOpen}
            collapsed={collapsed}
          />
        ))}
      </nav>

      <div className="cg-sidebar-divider" />

      <nav className="cg-sidebar-nav">
        {PRODUCT_NAV_ITEMS.map((item) => (
          <SidebarItem
            key={item.id}
            label={item.label}
            icon={item.icon}
            onClick={item.id === 'memory' ? onOpenMemory : item.id === 'usage' ? onOpenUsage : onOpenModels}
            isActive={item.id === 'memory' ? memoryOpen : item.id === 'usage' ? usageOpen : modelsOpen}
            collapsed={collapsed}
          />
        ))}
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
  searchOpen: PropTypes.bool.isRequired,
  memoryOpen: PropTypes.bool.isRequired,
  usageOpen: PropTypes.bool.isRequired,
  modelsOpen: PropTypes.bool.isRequired,
};

