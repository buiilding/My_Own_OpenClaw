import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockInvoke = jest.fn();
let mockSessionInfo = { conversationRef: null, userId: 'default_user' };

jest.mock('../../frontend/src/renderer/infrastructure/ipc/bridge', () => ({
  IpcBridge: {
    invoke: (...args) => mockInvoke(...args),
  },
  INVOKE_CHANNELS: {
    LIST_EPISODIC_MEMORIES: 'list-episodic-memories',
    LIST_SEMANTIC_MEMORIES: 'list-semantic-memories',
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
    window.confirm = jest.fn(() => true);
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
});
