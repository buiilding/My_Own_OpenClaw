/**
 * Covers dashboard sidebar. behavior in the frontend test suite.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import DashboardSidebar from '../../src/renderer/features/dashboard/components/DashboardSidebar';

function buildProps(overrides = {}) {
  return {
    sidebarOpen: false,
    onExpandSidebar: jest.fn(),
    onCollapseSidebar: jest.fn(),
    onStartNewChat: jest.fn(),
    onOpenSearch: jest.fn(),
    onOpenMemory: jest.fn(),
    onOpenUsage: jest.fn(),
    onOpenModels: jest.fn(),
    onOpenMcps: jest.fn(),
    onOpenSettings: jest.fn(),
    searchOpen: false,
    memoryOpen: false,
    usageOpen: false,
    modelsOpen: false,
    mcpsOpen: false,
    isLoadingRecentConversations: false,
    recentConversationsError: '',
    recentWorkspaceGroups: [],
    onOpenConversation: jest.fn(),
    onRenameConversation: jest.fn(),
    onTogglePinConversation: jest.fn(),
    onDeleteConversation: jest.fn(),
    activeConversationRef: null,
    ...overrides,
  };
}

describe('DashboardSidebar collapsed header controls', () => {
  test('swaps brand icon to expand icon on hover and restores on mouse leave', () => {
    render(<DashboardSidebar {...buildProps()} />);

    const expandButton = screen.getByRole('button', { name: 'Expand sidebar' });
    expect(screen.getByTestId('sidebar-collapsed-brand-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-collapsed-expand-icon')).not.toBeInTheDocument();

    fireEvent.mouseEnter(expandButton);
    expect(screen.getByTestId('sidebar-collapsed-expand-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-collapsed-brand-icon')).not.toBeInTheDocument();

    fireEvent.mouseLeave(expandButton);
    expect(screen.getByTestId('sidebar-collapsed-brand-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-collapsed-expand-icon')).not.toBeInTheDocument();
  });

  test('does not swap to expand icon from keyboard focus alone', () => {
    render(<DashboardSidebar {...buildProps()} />);

    const expandButton = screen.getByRole('button', { name: 'Expand sidebar' });
    fireEvent.focus(expandButton);

    expect(screen.getByTestId('sidebar-collapsed-brand-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-collapsed-expand-icon')).not.toBeInTheDocument();
  });

  test('clears stale hover state after collapse-expand-collapse transitions', () => {
    const { rerender } = render(<DashboardSidebar {...buildProps({ sidebarOpen: false })} />);
    const collapsedExpandButton = screen.getByRole('button', { name: 'Expand sidebar' });

    fireEvent.mouseEnter(collapsedExpandButton);
    expect(screen.getByTestId('sidebar-collapsed-expand-icon')).toBeInTheDocument();

    rerender(<DashboardSidebar {...buildProps({ sidebarOpen: true })} />);
    rerender(<DashboardSidebar {...buildProps({ sidebarOpen: false })} />);

    expect(screen.getByTestId('sidebar-collapsed-brand-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-collapsed-expand-icon')).not.toBeInTheDocument();
  });

  test('uses explicit expand callback when collapsed expand button is clicked', () => {
    const onExpandSidebar = jest.fn();
    render(<DashboardSidebar {...buildProps({ onExpandSidebar, sidebarOpen: false })} />);

    fireEvent.click(screen.getByTestId('sidebar-expand-button'));
    expect(onExpandSidebar).toHaveBeenCalledTimes(1);
  });

  test('uses explicit collapse callback when expanded collapse button is clicked', () => {
    const onCollapseSidebar = jest.fn();
    render(<DashboardSidebar {...buildProps({ onCollapseSidebar, sidebarOpen: true })} />);

    fireEvent.click(screen.getByTestId('sidebar-collapse-button'));
    expect(onCollapseSidebar).toHaveBeenCalledTimes(1);
  });

  test('renders one new chat action in collapsed mode and triggers new chat from header', () => {
    const onStartNewChat = jest.fn();
    render(<DashboardSidebar {...buildProps({ onStartNewChat })} />);

    const newChatButtons = screen.getAllByRole('button', { name: 'New chat' });
    expect(newChatButtons).toHaveLength(1);

    fireEvent.click(newChatButtons[0]);
    expect(onStartNewChat).toHaveBeenCalledTimes(1);
  });

  test('profile menu settings action opens general settings tab', () => {
    const onOpenSettings = jest.fn();
    render(<DashboardSidebar {...buildProps({ onOpenSettings })} />);

    fireEvent.click(screen.getByTestId('sidebar-user-menu-trigger'));
    fireEvent.click(screen.getByTestId('sidebar-user-menu-settings'));

    expect(onOpenSettings).toHaveBeenCalledWith('general');
  });

  test('shows empty-state copy when chat list is empty without a load error', () => {
    render(<DashboardSidebar {...buildProps({ sidebarOpen: true })} />);

    expect(screen.getByText('No chats yet.')).toBeInTheDocument();
    expect(screen.queryByText('Unable to load chats.')).not.toBeInTheDocument();
  });

  test('opens MCPs from expanded product navigation', () => {
    const onOpenMcps = jest.fn();
    render(<DashboardSidebar {...buildProps({ sidebarOpen: true, onOpenMcps })} />);

    fireEvent.click(screen.getByRole('button', { name: 'MCPs' }));

    expect(onOpenMcps).toHaveBeenCalledTimes(1);
  });

  test('shows load error copy when chat list loading fails', () => {
    render(
      <DashboardSidebar
        {...buildProps({
          sidebarOpen: true,
          recentConversationsError: 'Local runtime not ready',
        })}
      />,
    );

    expect(screen.getByText('Unable to load chats.')).toBeInTheDocument();
  });
});
