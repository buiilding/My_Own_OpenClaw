import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockInvoke = jest.fn();
const mockSendRehydrateConversation = jest.fn();
const mockSetActiveConversationRef = jest.fn();
const mockUpdateTranscriptSession = jest.fn();

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args) => mockInvoke(...args),
  },
  INVOKE_CHANNELS: {
    LIST_CONVERSATIONS: 'list-conversations',
    GET_CONVERSATION: 'get-conversation',
    DELETE_CONVERSATION: 'delete-conversation',
  },
}));

jest.mock('../../frontend/src/renderer/infrastructure/api/client', () => ({
  ApiClient: {
    sendRehydrateConversation: (...args) => mockSendRehydrateConversation(...args),
  },
}));

jest.mock('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter', () => ({
  getTranscriptSessionInfo: () => ({ conversationRef: null, userId: 'peter-bui' }),
  setActiveConversationRef: (...args) => mockSetActiveConversationRef(...args),
  updateTranscriptSession: (...args) => mockUpdateTranscriptSession(...args),
}));

describe('EpisodicMemorySection delete', () => {
  const originalConfirm = window.confirm;

  beforeEach(() => {
    mockInvoke.mockReset();
    mockSendRehydrateConversation.mockReset();
    mockSetActiveConversationRef.mockReset();
    mockUpdateTranscriptSession.mockReset();
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: jest.fn(),
    });
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

  test('shows continue conversation action for resumable refs', async () => {
    mockInvoke.mockImplementation((channel) => {
      if (channel === 'list-conversations') {
        return Promise.resolve({
          success: true,
          data: {
            conversations: [
              {
                conversation_id: 'conv_1',
                first_timestamp: '2026-02-02T21:00:00Z',
                last_timestamp: '2026-02-02T21:02:00Z',
                entry_count: 2,
                record_kind: 'transcript',
                is_resumable: true,
                model_id: 'gpt-4o-mini',
                model_provider: 'openai',
              },
            ],
          },
        });
      }
      if (channel === 'get-conversation') {
        return Promise.resolve({
          success: true,
          data: {
            memories: [
              {
                id: 'm-1',
                content: 'hello',
                role: 'user',
                message_type: 'user',
                timestamp: '2026-02-02T21:00:00Z',
                screenshot: 'artifact-1',
                metadata: {},
              },
              {
                id: 'm-2',
                content: 'hi',
                role: 'assistant',
                message_type: 'llm-text',
                timestamp: '2026-02-02T21:00:02Z',
                metadata: {},
              },
            ],
          },
        });
      }
      return Promise.resolve({ success: true, data: {} });
    });

    const { default: EpisodicMemorySection } = await import(
      '../../frontend/src/renderer/features/dashboard/components/sections/EpisodicMemorySection'
    );

    const onSelectSection = jest.fn();
    render(<EpisodicMemorySection onSelectSection={onSelectSection} />);

    await screen.findByText('Conversation 1');
    fireEvent.click(screen.getByText('Conversation 1'));

    const continueButton = await screen.findByRole('button', { name: 'Continue conversation' });
    expect(continueButton).toBeEnabled();
    fireEvent.click(continueButton);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('get-conversation', {
        userId: 'peter-bui',
        conversationId: 'conv_1',
        limit: 1000,
        recordKind: 'transcript',
      });
      expect(screen.getByText('hello')).toBeInTheDocument();
      expect(screen.getByText('hi')).toBeInTheDocument();
    });
  });
});
