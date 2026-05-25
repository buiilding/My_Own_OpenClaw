import { fireEvent, render, screen } from '@testing-library/react';

import ChatBoxImagePreviewRow from '../../frontend/src/renderer/features/chat/components/chatbox/ChatBoxImagePreviewRow';
import { removePreviewAttachmentByIdOrIndex } from '../../frontend/src/renderer/features/chat/components/chatbox/chatBoxPreviewRemoval';

describe('chatbox preview removal', () => {
  test('removes preview attachments by stable id', () => {
    const items = [
      { id: 'keep', filename: 'keep.txt' },
      { id: 'remove', filename: 'remove.txt' },
    ];

    expect(removePreviewAttachmentByIdOrIndex(items, 'remove', 0)).toEqual([
      { id: 'keep', filename: 'keep.txt' },
    ]);
  });

  test('removes preview attachments by fallback index when id is missing', () => {
    const items = [
      { filename: 'keep.txt' },
      { filename: 'remove.txt' },
    ];

    expect(removePreviewAttachmentByIdOrIndex(items, null, 1)).toEqual([
      { filename: 'keep.txt' },
    ]);
  });

  test('preview remove buttons pass fallback indexes for id-less attachments', () => {
    const onRemoveImage = jest.fn();
    const onRemoveFile = jest.fn();

    render(
      <ChatBoxImagePreviewRow
        clipboardImages={[{ previewUrl: 'data:image/png;base64,a' }]}
        readableFiles={[{ filename: 'notes.txt', filePath: '/tmp/notes.txt' }]}
        onRemoveImage={onRemoveImage}
        onRemoveFile={onRemoveFile}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove screenshot 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove attached file 1' }));

    expect(onRemoveImage).toHaveBeenCalledWith(null, 0);
    expect(onRemoveFile).toHaveBeenCalledWith(null, 0);
  });
});
