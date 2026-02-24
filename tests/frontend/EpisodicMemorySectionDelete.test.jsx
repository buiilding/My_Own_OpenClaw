import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockInvoke = jest.fn();
const mockSendRehydrateConversation = jest.fn();
const mockSetActiveConversationRef = jest.fn();
const mockUpdateTranscriptSession = jest.fn();
let mockSessionInfo = { conversationRef: null, userId: 'peter-bui' };
const ok = (data = {}) => Promise.resolve({ success: true, data });

const buildConversation = (overrides = {}) => ({
  conversation_id: 'c-1',
  first_timestamp: '2026-02-02T21:00:00Z',
  last_timestamp: '2026-02-02T21:02:00Z',
  entry_count: 2,
  record_kind: 'transcript',
  model_id: 'gpt-4o-mini',
  model_provider: 'openai',
  ...overrides,
});

const buildMemory = (overrides = {}) => ({
  id: 'm-1',
  content: 'hello',
  role: 'user',
  message_type: 'user',
  timestamp: '2026-02-02T21:00:00Z',
  metadata: {},
  ...overrides,
});

const mockInvokeHandlers = (handlers = {}) => {
  mockInvoke.mockImplementation((channel) => {
    const handler = handlers[channel];
    return handler ? handler() : ok();
  });
};

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
  getTranscriptSessionInfo: () => mockSessionInfo,
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
    mockSessionInfo = { conversationRef: null, userId: 'peter-bui' };
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
    mockInvokeHandlers({
      'list-conversations': () => ok({
        conversations: [
          buildConversation(),
        ],
      }),
      'delete-conversation': () => ok({ deleted_count: 2 }),
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
    mockInvokeHandlers({
      'list-conversations': () => ok({
        conversations: [
          buildConversation({
            conversation_id: 'conv_1',
            is_resumable: true,
          }),
        ],
      }),
      'get-conversation': () => ok({
        memories: [
          buildMemory({ screenshot: 'artifact-1' }),
          buildMemory({
            id: 'm-2',
            content: 'hi',
            role: 'assistant',
            message_type: 'llm-text',
            timestamp: '2026-02-02T21:00:02Z',
          }),
        ],
      }),
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

  test('does not show the currently active conversation in episodic list', async () => {
    mockSessionInfo = { conversationRef: 'conv_active', userId: 'peter-bui' };

    mockInvokeHandlers({
      'list-conversations': () => ok({
        conversations: [
          buildConversation({
            conversation_id: 'conv_active',
            last_timestamp: '2026-02-02T21:10:00Z',
            entry_count: 4,
          }),
          buildConversation({
            conversation_id: 'conv_old',
            first_timestamp: '2026-02-02T20:00:00Z',
            last_timestamp: '2026-02-02T20:10:00Z',
            entry_count: 3,
          }),
        ],
      }),
      'get-conversation': () => ok({ memories: [] }),
    });

    const { default: EpisodicMemorySection } = await import(
      '../../frontend/src/renderer/features/dashboard/components/sections/EpisodicMemorySection'
    );

    render(<EpisodicMemorySection />);

    await screen.findByText('1 conversation');
    expect(screen.queryByText('Conversation 2')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Conversation 1'));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('get-conversation', {
        userId: 'peter-bui',
        conversationId: 'conv_old',
        limit: 1000,
        recordKind: 'transcript',
      });
    });
  });
});
