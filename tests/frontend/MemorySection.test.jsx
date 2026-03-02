import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const MEMORY_RETRIEVAL_INJECTION_STORAGE_KEY = 'desktop-assistant-memory-retrieval-injection-enabled';

const mockInvoke = jest.fn();
let mockSessionInfo = { conversationRef: null, userId: 'default_user' };

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args) => mockInvoke(...args),
  },
  INVOKE_CHANNELS: {
    LIST_EPISODIC_MEMORIES: 'list-episodic-memories',
    LIST_SEMANTIC_MEMORIES: 'list-semantic-memories',
    DELETE_EPISODIC_MEMORY: 'delete-episodic-memory',
    DELETE_SEMANTIC_MEMORY: 'delete-semantic-memory',
  },
}));

jest.mock('../../frontend/src/renderer/infrastructure/transcript/TranscriptWriter', () => ({
  getTranscriptSessionInfo: () => mockSessionInfo,
}));

describe('MemorySection', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockSessionInfo = { conversationRef: null, userId: 'default_user' };
    window.localStorage.removeItem(MEMORY_RETRIEVAL_INJECTION_STORAGE_KEY);
  });

  test('loads episodic and semantic memories without using conversation list', async () => {
    mockInvoke.mockImplementation(async (channel) => {
      if (channel === 'list-episodic-memories') {
        return {
          success: true,
          data: {
            memories: [
              {
                id: 'ep-1',
                content: 'User: discuss quarterly roadmap\nAssistant: drafted milestones',
                timestamp: '2026-02-25T08:00:00Z',
                metadata: { source: 'interaction_completed' },
              },
            ],
          },
        };
      }

      if (channel === 'list-semantic-memories') {
        return {
          success: true,
          data: {
            memories: [
              {
                id: 'sem-1',
                content: 'Summary: Prefers concise answers\nFacts:\n- Likes bullet points',
                timestamp: '2026-02-25T08:10:00Z',
                metadata: { source: 'semantic_summary' },
              },
            ],
          },
        };
      }

      return { success: true, data: {} };
    });

    const { default: MemorySection } = await import(
      '../../frontend/src/renderer/features/dashboard/components/sections/MemorySection'
    );

    render(<MemorySection />);

    await screen.findByText('Interaction memories and short-lived context snapshots');

    expect(mockInvoke).toHaveBeenCalledWith('list-episodic-memories', {
      userId: 'default_user',
      limit: 200,
    });
    expect(mockInvoke).toHaveBeenCalledWith('list-semantic-memories', {
      userId: 'default_user',
      limit: 200,
    });

    await screen.findByText(/discuss quarterly roadmap/i);
    expect(screen.queryByText('Conversation 1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Semantic/i }));
    await screen.findByText('Prefers concise answers');

    fireEvent.click(screen.getByRole('button', { name: /Procedural/i }));
    expect(screen.getByText('No memories found')).toBeInTheDocument();
  });

  test('left close button calls onClose', async () => {
    mockInvoke.mockImplementation(async (channel) => {
      if (channel === 'list-episodic-memories' || channel === 'list-semantic-memories') {
        return { success: true, data: { memories: [] } };
      }
      return { success: true, data: {} };
    });

    const { default: MemorySection } = await import(
      '../../frontend/src/renderer/features/dashboard/components/sections/MemorySection'
    );

    const onClose = jest.fn();
    render(<MemorySection onClose={onClose} />);
    await screen.findByText('No memories found');

    fireEvent.click(screen.getByRole('button', { name: 'Close memory' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('semantic delete routes through delete-semantic-memory', async () => {
    mockInvoke.mockImplementation(async (channel) => {
      if (channel === 'list-episodic-memories') {
        return { success: true, data: { memories: [] } };
      }

      if (channel === 'list-semantic-memories') {
        return {
          success: true,
          data: {
            memories: [
              {
                id: 'sem-del-1',
                content: 'Summary: Uses markdown\nFacts:\n- Prefers concise replies',
                timestamp: '2026-02-25T08:10:00Z',
                metadata: { source: 'semantic_summary' },
              },
            ],
          },
        };
      }

      if (channel === 'delete-semantic-memory') {
        return { success: true, data: { deleted: true } };
      }

      return { success: true, data: {} };
    });

    const { default: MemorySection } = await import(
      '../../frontend/src/renderer/features/dashboard/components/sections/MemorySection'
    );

    render(<MemorySection />);

    fireEvent.click(await screen.findByRole('button', { name: /Semantic/i }));
    const deleteButton = await screen.findByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('delete-semantic-memory', {
        userId: 'default_user',
        memoryId: 'sem-del-1',
      });
    });
  });

  test('episodic delete routes through delete-episodic-memory', async () => {
    mockInvoke.mockImplementation(async (channel) => {
      if (channel === 'list-episodic-memories') {
        return {
          success: true,
          data: {
            memories: [
              {
                id: 'ep-del-1',
                content: 'User: remove this memory',
                timestamp: '2026-02-25T08:00:00Z',
                metadata: { source: 'interaction_completed' },
              },
            ],
          },
        };
      }
      if (channel === 'list-semantic-memories') {
        return { success: true, data: { memories: [] } };
      }
      if (channel === 'delete-episodic-memory') {
        return { success: true, data: { deleted: true } };
      }
      return { success: true, data: {} };
    });

    const { default: MemorySection } = await import(
      '../../frontend/src/renderer/features/dashboard/components/sections/MemorySection'
    );

    render(<MemorySection />);

    const deleteButton = await screen.findByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('delete-episodic-memory', {
        userId: 'default_user',
        memoryId: 'ep-del-1',
      });
    });
  });

  test('deletes semantic memory with one click and does not show confirmation dialog', async () => {
    mockInvoke.mockImplementation(async (channel) => {
      if (channel === 'list-episodic-memories') {
        return { success: true, data: { memories: [] } };
      }
      if (channel === 'list-semantic-memories') {
        return {
          success: true,
          data: {
            memories: [
              {
                id: 'sem-del-no-confirm-1',
                content: 'Summary: Prefers no confirmation modals',
                timestamp: '2026-02-25T08:10:00Z',
                metadata: { source: 'semantic_summary' },
              },
            ],
          },
        };
      }
      if (channel === 'delete-semantic-memory') {
        return { success: true, data: { deleted: true } };
      }
      return { success: true, data: {} };
    });

    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const { default: MemorySection } = await import(
      '../../frontend/src/renderer/features/dashboard/components/sections/MemorySection'
    );

    try {
      render(<MemorySection />);
      fireEvent.click(await screen.findByRole('button', { name: /Semantic/i }));
      fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('delete-semantic-memory', {
          userId: 'default_user',
          memoryId: 'sem-del-no-confirm-1',
        });
      });
      expect(confirmSpy).not.toHaveBeenCalled();
    } finally {
      confirmSpy.mockRestore();
    }
  });

  test('persists memory retrieval injection toggle state in localStorage', async () => {
    mockInvoke.mockImplementation(async (channel) => {
      if (channel === 'list-episodic-memories' || channel === 'list-semantic-memories') {
        return { success: true, data: { memories: [] } };
      }
      return { success: true, data: {} };
    });

    const { default: MemorySection } = await import(
      '../../frontend/src/renderer/features/dashboard/components/sections/MemorySection'
    );

    window.localStorage.setItem(MEMORY_RETRIEVAL_INJECTION_STORAGE_KEY, 'false');
    render(<MemorySection />);
    await screen.findByText('No memories found');

    const toggle = screen.getByRole('checkbox', { name: 'Memory on or off' });
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(window.localStorage.getItem(MEMORY_RETRIEVAL_INJECTION_STORAGE_KEY)).toBe('true');
  });

  test('episodic search matches assistant responses', async () => {
    mockInvoke.mockImplementation(async (channel) => {
      if (channel === 'list-episodic-memories') {
        return {
          success: true,
          data: {
            memories: [
              {
                id: 'ep-assistant-search-1',
                content: 'User: what should I pack?\nAssistant: Bring a waterproof jacket and trail shoes.',
                timestamp: '2026-02-25T08:00:00Z',
                metadata: { source: 'interaction_completed' },
              },
            ],
          },
        };
      }
      if (channel === 'list-semantic-memories') {
        return { success: true, data: { memories: [] } };
      }
      return { success: true, data: {} };
    });

    const { default: MemorySection } = await import(
      '../../frontend/src/renderer/features/dashboard/components/sections/MemorySection'
    );

    render(<MemorySection />);
    await screen.findByText(/what should I pack\?/i);

    fireEvent.change(screen.getByPlaceholderText('Search memories...'), {
      target: { value: 'trail shoes' },
    });

    await screen.findByText(/what should I pack\?/i);
    expect(screen.queryByText('No memories found')).not.toBeInTheDocument();
  });
});
