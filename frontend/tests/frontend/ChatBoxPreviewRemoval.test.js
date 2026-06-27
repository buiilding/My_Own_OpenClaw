/**
 * Covers chat box preview removal. behavior in the frontend test suite.
 */

import { fireEvent, render, screen } from '@testing-library/react';

import AttachmentPreviewRow from '../../src/renderer/features/minimalChatPill/components/AttachmentPreviewRow';

describe('chatbox preview removal', () => {
  test('preview remove buttons pass stable attachment ids', () => {
    const onRemoveImage = jest.fn();
    const onRemoveFile = jest.fn();

    render(
      <AttachmentPreviewRow
        clipboardImages={[{ id: 'image-1', previewUrl: 'data:image/png;base64,a' }]}
        readableFiles={[{ id: 'file-1', filename: 'notes.txt', filePath: '/tmp/notes.txt' }]}
        onRemoveImage={onRemoveImage}
        onRemoveFile={onRemoveFile}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove screenshot 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove attached file 1' }));

    expect(onRemoveImage).toHaveBeenCalledWith('image-1');
    expect(onRemoveFile).toHaveBeenCalledWith('file-1');
  });
});
