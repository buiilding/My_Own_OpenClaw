import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockInvoke = jest.fn();

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args) => mockInvoke(...args),
  },
  INVOKE_CHANNELS: {
    LIST_CONVERSATIONS: 'list-conversations',
    DELETE_CONVERSATION: 'delete-conversation',
  },
}));

jest.mock('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter', () => ({
  getTranscriptSessionInfo: () => ({ sessionId: 'session-1', userId: 'peter-bui' }),
}));

describe('EpisodicMemorySection delete', () => {
  const originalConfirm = window.confirm;

  beforeEach(() => {
    mockInvoke.mockReset();
    window.confirm = jest.fn(() => true);
  });

  afterEach(() => {
    window.confirm = originalConfirm;
  });

  test('right click shows delete menu and invokes delete', async () => {
    mockInvoke.mockImplementation((channel) => {
      if (channel === 'list-conversations') {
        return Promise.resolve({
          success: true,
          data: {
            conversations: [
              {
                conversation_id: 'c-1',
                first_timestamp: '2026-02-02T21:00:00Z',
                last_timestamp: '2026-02-02T21:02:00Z',
                entry_count: 2,
                record_kind: 'transcript',
                model_id: 'gpt-4o-mini',
                model_provider: 'openai',
              },
            ],
          },
        });
      }
      if (channel === 'delete-conversation') {
        return Promise.resolve({ success: true, data: { deleted_count: 2 } });
      }
      return Promise.resolve({ success: true, data: {} });
    });

    const { default: EpisodicMemorySection } = await import(
      '../../frontend/src/renderer/features/dashboard/components/sections/EpisodicMemorySection'
    );

    render(<EpisodicMemorySection />);

    await screen.findByText('Conversation 1');

    fireEvent.contextMenu(screen.getByText('Conversation 1').closest('button'));

    await screen.findByRole('menu');
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('delete-conversation', {
        userId: 'peter-bui',
        conversationId: 'c-1',
        recordKind: 'transcript',
      });
    });

    // Reload list after delete.
    await waitFor(() => {
      const listCalls = mockInvoke.mock.calls.filter((call) => call[0] === 'list-conversations');
      expect(listCalls.length).toBeGreaterThan(1);
    });
  });
});

