/**
 * Covers desktop transcript session info runtime client behavior in the frontend test suite.
 */

import { act, renderHook } from '@testing-library/react';

import { DesktopTranscriptSessionInfoRuntimeClient } from '../../src/renderer/app/runtime/desktopTranscriptSessionInfoRuntimeClient';
import { DesktopTranscriptSessionRuntimeClient } from '../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient';

jest.mock('../../src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient', () => ({
  DesktopTranscriptSessionRuntimeClient: {
    getTranscriptSessionInfo: jest.fn(),
  },
}));

const mockGetTranscriptSessionInfo = DesktopTranscriptSessionRuntimeClient.getTranscriptSessionInfo;

describe('useDesktopTranscriptSessionInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTranscriptSessionInfo.mockReturnValue({
      conversationRef: null,
      userId: null,
    });
  });

  test('returns the current transcript session snapshot', () => {
    mockGetTranscriptSessionInfo.mockReturnValue({
      conversationRef: 'conv-1',
      userId: 'user-1',
    });

    const { result } = renderHook(() => (
      DesktopTranscriptSessionInfoRuntimeClient.useDesktopTranscriptSessionInfo()
    ));

    expect(result.current).toEqual({
      conversationRef: 'conv-1',
      userId: 'user-1',
    });
  });

  test('updates when transcript-session-update is emitted', () => {
    const snapshots = [
      { conversationRef: 'conv-a', userId: 'user-a' },
      { conversationRef: 'conv-b', userId: 'user-b' },
    ];
    mockGetTranscriptSessionInfo.mockImplementation(() => snapshots[0]);

    const { result } = renderHook(() => (
      DesktopTranscriptSessionInfoRuntimeClient.useDesktopTranscriptSessionInfo()
    ));
    expect(result.current).toEqual(snapshots[0]);

    mockGetTranscriptSessionInfo.mockImplementation(() => snapshots[1]);
    act(() => {
      window.dispatchEvent(new CustomEvent('transcript-session-update'));
    });

    expect(result.current).toEqual(snapshots[1]);
  });

  test('keeps equivalent snapshots referentially stable across rerenders', () => {
    mockGetTranscriptSessionInfo.mockReturnValue({
      conversationRef: 'conv-stable',
      userId: 'user-stable',
    });

    const { result, rerender } = renderHook(() => (
      DesktopTranscriptSessionInfoRuntimeClient.useDesktopTranscriptSessionInfo()
    ));
    const firstSnapshot = result.current;

    mockGetTranscriptSessionInfo.mockReturnValue({
      conversationRef: 'conv-stable',
      userId: 'user-stable',
    });
    rerender();

    expect(result.current).toBe(firstSnapshot);
  });
});
