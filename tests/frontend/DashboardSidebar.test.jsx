import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import DashboardSidebar from '../../frontend/src/renderer/features/dashboard/components/DashboardSidebar';

function buildProps(overrides = {}) {
  return {
    sidebarOpen: false,
    onToggleSidebar: jest.fn(),
    onStartNewChat: jest.fn(),
    onOpenSearch: jest.fn(),
    onOpenMemory: jest.fn(),
    onOpenUsage: jest.fn(),
    onOpenModels: jest.fn(),
    onOpenSettings: jest.fn(),
    searchOpen: false,
    memoryOpen: false,
    usageOpen: false,
    modelsOpen: false,
    isLoadingRecentConversations: false,
    recentConversationsError: '',
    recentConversationGroups: {
      today: [],
      yesterday: [],
      previous7Days: [],
      older: [],
    },
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

  test('renders one new chat action in collapsed mode and triggers new chat from header', () => {
    const onStartNewChat = jest.fn();
    render(<DashboardSidebar {...buildProps({ onStartNewChat })} />);

    const newChatButtons = screen.getAllByRole('button', { name: 'New chat' });
    expect(newChatButtons).toHaveLength(1);

    fireEvent.click(newChatButtons[0]);
    expect(onStartNewChat).toHaveBeenCalledTimes(1);
  });
});
