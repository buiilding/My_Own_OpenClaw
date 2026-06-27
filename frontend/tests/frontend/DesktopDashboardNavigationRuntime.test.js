/**
 * Covers renderer dashboard navigation runtime behavior.
 */

import { DesktopDashboardNavigationRuntime } from '../../src/renderer/app/runtime/desktopDashboardNavigationRuntime.js';

const {
  getDashboardNavigationItemIds,
  getDashboardPanelNavItems,
  getDashboardPrimaryNavItems,
  resolveDashboardNavigationLabel,
} = DesktopDashboardNavigationRuntime;

describe('desktopDashboardNavigationRuntime', () => {
  test('exposes ordered primary navigation descriptors and collapsed filtering', () => {
    expect(getDashboardPrimaryNavItems()).toEqual([
      {
        id: 'new-chat',
        label: 'New chat',
        iconKey: 'penSquare',
        hiddenWhenCollapsed: true,
      },
      { id: 'search', label: 'Search chats', iconKey: 'search' },
    ]);

    expect(getDashboardPrimaryNavItems({ collapsed: true })).toEqual([
      { id: 'search', label: 'Search chats', iconKey: 'search' },
    ]);
  });

  test('exposes ordered dashboard panel navigation descriptors', () => {
    expect(getDashboardPanelNavItems()).toEqual([
      { id: 'memory', label: 'Memory', iconKey: 'brain' },
      { id: 'usage', label: 'Usage', iconKey: 'barChart3' },
      { id: 'models', label: 'Models', iconKey: 'cpu' },
      { id: 'mcps', label: 'MCPs', iconKey: 'cable' },
    ]);

    expect(getDashboardNavigationItemIds()).toEqual([
      'new-chat',
      'search',
      'memory',
      'usage',
      'models',
      'mcps',
    ]);
  });

  test('resolves known item labels and unknown item fallback labels', () => {
    expect(resolveDashboardNavigationLabel('models')).toBe('Models');
    expect(resolveDashboardNavigationLabel('unknown')).toBe('Dashboard');
    expect(resolveDashboardNavigationLabel('unknown', 'Fallback')).toBe('Fallback');
  });
});
