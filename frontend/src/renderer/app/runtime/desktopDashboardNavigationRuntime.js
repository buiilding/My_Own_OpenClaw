/**
 * Owns renderer dashboard navigation descriptors for the app runtime.
 */

const DASHBOARD_PRIMARY_NAV_ITEMS = Object.freeze([
  Object.freeze({
    id: 'new-chat',
    label: 'New chat',
    iconKey: 'penSquare',
    hiddenWhenCollapsed: true,
  }),
  Object.freeze({ id: 'search', label: 'Search chats', iconKey: 'search' }),
]);

const DASHBOARD_PANEL_NAV_ITEMS = Object.freeze([
  Object.freeze({ id: 'memory', label: 'Memory', iconKey: 'brain' }),
  Object.freeze({ id: 'usage', label: 'Usage', iconKey: 'barChart3' }),
  Object.freeze({ id: 'models', label: 'Models', iconKey: 'cpu' }),
  Object.freeze({ id: 'mcps', label: 'MCPs', iconKey: 'cable' }),
]);

function cloneNavItem(item) {
  return { ...item };
}

function getDashboardPrimaryNavItems(options = {}) {
  const { collapsed = false } = options || {};
  return DASHBOARD_PRIMARY_NAV_ITEMS
    .filter((item) => !collapsed || item.hiddenWhenCollapsed !== true)
    .map(cloneNavItem);
}

function getDashboardPanelNavItems() {
  return DASHBOARD_PANEL_NAV_ITEMS.map(cloneNavItem);
}

function getDashboardNavigationItemIds() {
  return [
    ...DASHBOARD_PRIMARY_NAV_ITEMS,
    ...DASHBOARD_PANEL_NAV_ITEMS,
  ].map((item) => item.id);
}

function resolveDashboardNavigationLabel(itemId, fallback = 'Dashboard') {
  return [
    ...DASHBOARD_PRIMARY_NAV_ITEMS,
    ...DASHBOARD_PANEL_NAV_ITEMS,
  ].find((item) => item.id === itemId)?.label || fallback;
}

export {
  getDashboardNavigationItemIds,
  getDashboardPanelNavItems,
  getDashboardPrimaryNavItems,
  resolveDashboardNavigationLabel,
};
