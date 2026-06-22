/**
 * Covers SDK display attachment presentation components.
 */

import { render, screen } from '@testing-library/react';
import AttachmentList from '../../frontend/src/renderer/features/chat/components/message/content/AttachmentList';

const mockUseResolvedArtifactImageSrc = jest.fn((attachment) => {
  const ref = attachment?.screenshotRef;
  return ref ? `resolved://${ref}` : null;
});

jest.mock('../../frontend/src/renderer/app/runtime/desktopArtifactRuntimeClient', () => ({
  DesktopArtifactRuntimeClient: {
    showImageContextMenu: jest.fn(),
  },
}));

jest.mock('../../frontend/src/renderer/app/runtime/desktopResolvedMessageScreenshotsRuntime', () => ({
  DesktopResolvedMessageScreenshotsRuntime: {
    useResolvedArtifactImageSrc: (...args) => mockUseResolvedArtifactImageSrc(...args),
  },
}));

describe('AttachmentList', () => {
  beforeEach(() => {
    mockUseResolvedArtifactImageSrc.mockClear();
    mockUseResolvedArtifactImageSrc.mockImplementation((attachment) => {
      const ref = attachment?.screenshotRef;
      return ref ? `resolved://${ref}` : null;
    });
  });

  test('renders ordered image, ready artifact, pending, and failed attachments', () => {
    render(
      <AttachmentList
        attachments={[
          {
            id: 'attachment-1',
            kind: 'image',
            source: 'user_included',
            status: 'materializing',
            previewSrc: 'data:image/png;base64,first',
          },
          {
            id: 'attachment-2',
            kind: 'image',
            source: 'camera_button',
            status: 'ready',
            screenshotRef: 'artifact-camera',
          },
          {
            id: 'attachment-3',
            kind: 'screenshot_request',
            source: 'camera_button',
            status: 'pending_capture',
          },
          {
            id: 'attachment-4',
            kind: 'image',
            source: 'user_included',
            status: 'failed',
          },
        ]}
      />,
    );

    expect(screen.getAllByRole('img').map((image) => image.getAttribute('src'))).toEqual([
      'data:image/png;base64,first',
      'resolved://artifact-camera',
    ]);
    expect(screen.getByText('Screenshot pending')).toBeInTheDocument();
    expect(screen.getByText('Attachment unavailable')).toBeInTheDocument();
  });

  test('omits pending and failed non-image states in compact surfaces', () => {
    render(
      <AttachmentList
        surface="compact"
        attachments={[
          {
            id: 'attachment-1',
            kind: 'screenshot_request',
            source: 'camera_button',
            status: 'pending_capture',
          },
          {
            id: 'attachment-2',
            kind: 'image',
            source: 'user_included',
            status: 'failed',
          },
        ]}
      />,
    );

    expect(screen.queryByText('Screenshot pending')).not.toBeInTheDocument();
    expect(screen.queryByText('Attachment unavailable')).not.toBeInTheDocument();
  });
  test('keeps preview visible while ready artifact source resolves', () => {
    mockUseResolvedArtifactImageSrc.mockReturnValue(null);

    const { rerender } = render(
      <AttachmentList
        attachments={[
          {
            id: 'attachment-stable',
            kind: 'image',
            source: 'user_included',
            status: 'materializing',
            previewSrc: 'data:image/png;base64,preview',
          },
        ]}
      />,
    );

    expect(screen.getByRole('img')).toHaveAttribute('src', 'data:image/png;base64,preview');

    rerender(
      <AttachmentList
        attachments={[
          {
            id: 'attachment-stable',
            kind: 'image',
            source: 'user_included',
            status: 'ready',
            screenshotRef: 'artifact-ready',
          },
        ]}
      />,
    );

    expect(screen.getByRole('img')).toHaveAttribute('src', 'data:image/png;base64,preview');

    mockUseResolvedArtifactImageSrc.mockReturnValue('resolved://artifact-ready');
    rerender(
      <AttachmentList
        attachments={[
          {
            id: 'attachment-stable',
            kind: 'image',
            source: 'user_included',
            status: 'ready',
            screenshotRef: 'artifact-ready',
          },
        ]}
      />,
    );

    expect(screen.getByRole('img')).toHaveAttribute('src', 'resolved://artifact-ready');
  });
});
