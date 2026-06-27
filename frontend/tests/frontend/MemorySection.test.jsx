/**
 * Covers memory section. behavior in the frontend test suite.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DesktopMemoryRetrievalPreferenceRuntime } from '../../src/renderer/app/runtime/desktopMemoryRetrievalPreferenceRuntime';

const MEMORY_RETRIEVAL_INJECTION_STORAGE_KEY = (
  DesktopMemoryRetrievalPreferenceRuntime.getMemoryRetrievalInjectionStorageKey()
);

const mockListEpisodicMemories = jest.fn();
const mockListSemanticMemories = jest.fn();
const mockDeleteMemoryItem = jest.fn();
const mockOnMemoryStoreChanged = jest.fn();
let mockSessionInfo = { conversationRef: null, userId: 'user-1' };
let memoryStoreChangedListener = null;

jest.mock('../../src/renderer/app/runtime/desktopMemoryRuntimeClient', () => ({
  DesktopMemoryRuntimeClient: {
    listEpisodicMemories: (...args) => mockListEpisodicMemories(...args),
    listSemanticMemories: (...args) => mockListSemanticMemories(...args),
    deleteMemoryItem: (...args) => mockDeleteMemoryItem(...args),
    onMemoryStoreChanged: (...args) => mockOnMemoryStoreChanged(...args),
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
    getTranscriptSessionInfo: () => mockSessionInfo,
  },
}));

describe('MemorySection', () => {
  beforeEach(() => {
    mockListEpisodicMemories.mockReset();
    mockListSemanticMemories.mockReset();
    mockDeleteMemoryItem.mockReset();
    mockListEpisodicMemories.mockResolvedValue([]);
    mockListSemanticMemories.mockResolvedValue([]);
    mockDeleteMemoryItem.mockResolvedValue(undefined);
    mockOnMemoryStoreChanged.mockReset();
    mockSessionInfo = { conversationRef: null, userId: 'user-1' };
    memoryStoreChangedListener = null;
    mockOnMemoryStoreChanged.mockImplementation((listener) => {
      memoryStoreChangedListener = listener;
      return jest.fn();
    });
    window.localStorage.removeItem(MEMORY_RETRIEVAL_INJECTION_STORAGE_KEY);
  });

  afterEach(() => {
    memoryStoreChangedListener = null;
  });

  test('loads episodic and semantic memories without using conversation list', async () => {
    mockListEpisodicMemories.mockResolvedValue([
      {
        id: 'ep-1',
        content: 'User: discuss quarterly roadmap\nAssistant: drafted milestones',
        timestamp: '2026-02-25T08:00:00Z',
        metadata: { source: 'interaction_completed' },
      },
    ]);
    mockListSemanticMemories.mockResolvedValue([
      {
        id: 'sem-1',
        content: 'Summary: Prefers concise answers\nFacts:\n- Likes bullet points',
        timestamp: '2026-02-25T08:10:00Z',
        metadata: { source: 'semantic_summary' },
      },
    ]);

    const { default: MemorySection } = await import(
      '../../src/renderer/features/dashboard/components/sections/MemorySection'
    );

    render(<MemorySection />);

    await screen.findByText('Interaction memories and short-lived context snapshots');

    expect(mockListEpisodicMemories).toHaveBeenCalledWith(200);
    expect(mockListSemanticMemories).toHaveBeenCalledWith(200);

    await screen.findByText(/discuss quarterly roadmap/i);
    expect(screen.queryByText('Conversation 1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Semantic/i }));
    await screen.findByText('Prefers concise answers');

    fireEvent.click(screen.getByRole('button', { name: /Procedural/i }));
    expect(screen.getByText('No memories found')).toBeInTheDocument();
  });

  test('left close button calls onClose', async () => {
    const { default: MemorySection } = await import(
      '../../src/renderer/features/dashboard/components/sections/MemorySection'
    );

    const onClose = jest.fn();
    render(<MemorySection onClose={onClose} />);
    await screen.findByText('No memories found');

    fireEvent.click(screen.getByRole('button', { name: 'Close memory' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('semantic delete routes through the memory runtime client', async () => {
    mockListSemanticMemories.mockResolvedValue([
      {
        id: 'sem-del-1',
        content: 'Summary: Uses markdown\nFacts:\n- Prefers concise replies',
        timestamp: '2026-02-25T08:10:00Z',
        metadata: { source: 'semantic_summary' },
      },
    ]);

    const { default: MemorySection } = await import(
      '../../src/renderer/features/dashboard/components/sections/MemorySection'
    );

    render(<MemorySection />);

    fireEvent.click(await screen.findByRole('button', { name: /Semantic/i }));
    const deleteButton = await screen.findByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockDeleteMemoryItem).toHaveBeenCalledWith({
        memoryId: 'sem-del-1',
        kind: 'semantic',
      });
    });
  });

  test('episodic delete routes through the memory runtime client', async () => {
    mockListEpisodicMemories.mockResolvedValue([
      {
        id: 'ep-del-1',
        content: 'User: remove this memory',
        timestamp: '2026-02-25T08:00:00Z',
        metadata: { source: 'interaction_completed' },
      },
    ]);

    const { default: MemorySection } = await import(
      '../../src/renderer/features/dashboard/components/sections/MemorySection'
    );

    render(<MemorySection />);

    const deleteButton = await screen.findByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockDeleteMemoryItem).toHaveBeenCalledWith({
        memoryId: 'ep-del-1',
        kind: 'episodic',
      });
    });
  });

  test('does not expose unsupported local add or edit actions', async () => {
    mockListEpisodicMemories.mockResolvedValue([
      {
        id: 'ep-readonly-1',
        content: 'User: remember this\nAssistant: persisted detail',
        timestamp: '2026-02-25T08:00:00Z',
        metadata: { source: 'interaction_completed' },
      },
    ]);

    const { default: MemorySection } = await import(
      '../../src/renderer/features/dashboard/components/sections/MemorySection'
    );

    render(<MemorySection />);
    await screen.findByText(/remember this/i);

    expect(screen.queryByRole('button', { name: /^Add$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  test('deletes semantic memory with one click and does not show confirmation dialog', async () => {
    mockListSemanticMemories.mockResolvedValue([
      {
        id: 'sem-del-no-confirm-1',
        content: 'Summary: Prefers no confirmation modals',
        timestamp: '2026-02-25T08:10:00Z',
        metadata: { source: 'semantic_summary' },
      },
    ]);

    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const { default: MemorySection } = await import(
      '../../src/renderer/features/dashboard/components/sections/MemorySection'
    );

    try {
      render(<MemorySection />);
      fireEvent.click(await screen.findByRole('button', { name: /Semantic/i }));
      fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

      await waitFor(() => {
        expect(mockDeleteMemoryItem).toHaveBeenCalledWith({
          memoryId: 'sem-del-no-confirm-1',
          kind: 'semantic',
        });
      });
      expect(confirmSpy).not.toHaveBeenCalled();
    } finally {
      confirmSpy.mockRestore();
    }
  });

  test('normalizes memory rows with runtime delete-routing fields', async () => {
    const {
      DesktopMemoryPresentationRuntime,
    } = await import(
      '../../src/renderer/app/runtime/desktopMemoryPresentationRuntime'
    );
    const {
      normalizeEpisodicMemoriesForDashboard,
      normalizeSemanticMemoriesForDashboard,
    } = DesktopMemoryPresentationRuntime;

    const episodicRow = normalizeEpisodicMemoriesForDashboard([{ id: 'ep-runtime-1', content: 'User: hi' }])[0];
    const semanticRow = normalizeSemanticMemoriesForDashboard([{ id: 'sem-runtime-1', content: 'Summary: hi' }])[0];

    expect(episodicRow).toMatchObject({
      runtimeMemoryId: 'ep-runtime-1',
      runtimeMemoryKind: 'episodic',
    });
    expect(semanticRow).toMatchObject({
      runtimeMemoryId: 'sem-runtime-1',
      runtimeMemoryKind: 'semantic',
    });
    expect(episodicRow).not.toHaveProperty('backendMemoryId');
    expect(semanticRow).not.toHaveProperty('backendType');
  });

  test('persists memory retrieval injection toggle state in localStorage', async () => {
    const { default: MemorySection } = await import(
      '../../src/renderer/features/dashboard/components/sections/MemorySection'
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
    mockListEpisodicMemories.mockResolvedValue([
      {
        id: 'ep-assistant-search-1',
        content: 'User: what should I pack?\nAssistant: Bring a waterproof jacket and trail shoes.',
        timestamp: '2026-02-25T08:00:00Z',
        metadata: { source: 'interaction_completed' },
      },
    ]);

    const { default: MemorySection } = await import(
      '../../src/renderer/features/dashboard/components/sections/MemorySection'
    );

    render(<MemorySection />);
    await screen.findByText(/what should I pack\?/i);

    fireEvent.change(screen.getByPlaceholderText('Search memories...'), {
      target: { value: 'trail shoes' },
    });

    await screen.findByText(/what should I pack\?/i);
    expect(screen.queryByText('No memories found')).not.toBeInTheDocument();
  });

  test('loads and refreshes memories without transcript session user id', async () => {
    mockSessionInfo = { conversationRef: null, userId: null };
    mockListEpisodicMemories
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'ep-refreshed-1',
          content: 'User: keep this\nAssistant: stored from completed turn',
          timestamp: '2026-06-05T08:00:00Z',
          metadata: { source: 'interaction_completed' },
        },
      ]);

    const { default: MemorySection } = await import(
      '../../src/renderer/features/dashboard/components/sections/MemorySection'
    );

    render(<MemorySection />);
    await screen.findByText('No memories found');

    await waitFor(() => {
      expect(mockOnMemoryStoreChanged).toHaveBeenCalledWith(expect.any(Function));
    });

    await act(async () => {
      memoryStoreChangedListener?.({
        type: 'memory_store_changed',
        payload: {
          userId: 'authenticated-user',
          memoryTypes: ['episodic'],
          reason: 'completed_turn',
          memoryId: 'ep-refreshed-1',
        },
      });
    });

    await screen.findByText(/keep this/i);
    expect(mockListEpisodicMemories).toHaveBeenCalledTimes(2);
    expect(mockListSemanticMemories).toHaveBeenCalledTimes(2);
  });

  test('refreshes memories when the SDK memory store changes for another user payload', async () => {
    mockListSemanticMemories
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'sem-refreshed-1',
          content: 'Summary: refreshed from authenticated memory user',
          timestamp: '2026-06-05T08:10:00Z',
          metadata: { source: 'semantic_summary' },
        },
      ]);

    const { default: MemorySection } = await import(
      '../../src/renderer/features/dashboard/components/sections/MemorySection'
    );

    render(<MemorySection />);
    await screen.findByText('No memories found');

    await act(async () => {
      memoryStoreChangedListener?.({
        type: 'memory_store_changed',
        payload: {
          userId: 'other-user',
          memoryTypes: ['semantic'],
          reason: 'completed_turn',
          memoryId: 'sem-refreshed-1',
        },
      });
    });

    fireEvent.click(await screen.findByRole('button', { name: /Semantic/i }));
    await screen.findByText(/authenticated memory user/i);
    expect(mockListEpisodicMemories).toHaveBeenCalledTimes(2);
    expect(mockListSemanticMemories).toHaveBeenCalledTimes(2);
  });
});
