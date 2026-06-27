/**
 * Covers SDK display attachment presentation components.
 */

import { render, screen } from '@testing-library/react';
import AttachmentList from '../../src/renderer/features/chat/components/message/content/AttachmentList';
import UserMessage from '../../src/renderer/features/chat/components/message/content/UserMessage';

const mockResolvedAttachmentSources = new Map([
  ['attachment-2', 'resolved://artifact-camera'],
  ['attachment-tool-output', 'resolved://artifact-tool-output'],
  ['attachment-ready', 'resolved://artifact-ready'],
]);
const mockUseResolvedAttachmentImageSrc = jest.fn((attachment) => {
  const id = typeof attachment?.id === 'string' ? attachment.id : null;
  return id ? mockResolvedAttachmentSources.get(id) ?? null : null;
});

jest.mock('../../src/renderer/app/runtime/desktopArtifactRuntimeClient', () => ({
  DesktopArtifactRuntimeClient: {
    showImageContextMenu: jest.fn(),
  },
}));

jest.mock('../../src/renderer/app/runtime/desktopAttachmentImageRuntime', () => ({
  DesktopAttachmentImageRuntime: {
    useResolvedAttachmentImageSrc: (...args) => mockUseResolvedAttachmentImageSrc(...args),
  },
}));

describe('AttachmentList', () => {
  beforeEach(() => {
    mockUseResolvedAttachmentImageSrc.mockClear();
    mockUseResolvedAttachmentImageSrc.mockImplementation((attachment) => {
      const id = typeof attachment?.id === 'string' ? attachment.id : null;
      return id ? mockResolvedAttachmentSources.get(id) ?? null : null;
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

  test('marks tool output attachments with the full-card surface classes', () => {
    const { container } = render(
      <AttachmentList
        surface="tool-output"
        attachments={[
          {
            id: 'attachment-tool-output',
            kind: 'image',
            source: 'tool_result',
            status: 'ready',
            screenshotRef: 'artifact-tool-output',
          },
        ]}
      />,
    );

    expect(container.querySelector('.message-attachment-gallery--tool-output')).toBeTruthy();
    expect(screen.getByRole('img').closest('.message-attachment-image-container--tool-output')).toBeTruthy();
  });

  test('keeps preview visible while ready artifact source resolves', () => {
    mockUseResolvedAttachmentImageSrc.mockReturnValue(null);

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

    mockUseResolvedAttachmentImageSrc.mockReturnValue('resolved://artifact-ready');
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

describe('UserMessage attachments', () => {
  beforeEach(() => {
    mockUseResolvedAttachmentImageSrc.mockClear();
    mockUseResolvedAttachmentImageSrc.mockImplementation((attachment) => {
      const id = typeof attachment?.id === 'string' ? attachment.id : null;
      return id ? mockResolvedAttachmentSources.get(id) ?? null : null;
    });
  });

  test('renders typed attachments without filename metadata fallback', () => {
    render(
      <UserMessage
        message={{
          text: 'Please inspect this',
          attachments: [{
            id: 'attachment-ready',
            kind: 'image',
            source: 'user_included',
            status: 'ready',
            screenshotRef: 'artifact-ready',
          }],
        }}
      />,
    );

    expect(screen.getByRole('img')).toHaveAttribute('src', 'resolved://artifact-ready');
  });
});
