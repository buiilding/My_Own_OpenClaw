/**
 * Covers desktop message content runtime behavior in the frontend test suite.
 */

import {
  MESSAGE_CONTENT_RENDER_KIND,
  resolveMessageContentPresentation,
} from '../../frontend/src/renderer/app/runtime/desktopMessageContentRuntime';

describe('desktopMessageContentRuntime', () => {
  test('classifies special message rows by canonical render kind', () => {
    expect(resolveMessageContentPresentation({ type: 'error' }).renderKind)
      .toBe(MESSAGE_CONTENT_RENDER_KIND.ERROR);
    expect(resolveMessageContentPresentation({ type: 'tool-output' }).renderKind)
      .toBe(MESSAGE_CONTENT_RENDER_KIND.TOOL_OUTPUT);
    expect(resolveMessageContentPresentation({ type: 'tool-call' }).renderKind)
      .toBe(MESSAGE_CONTENT_RENDER_KIND.TOOL_CALL);
    expect(resolveMessageContentPresentation({ type: 'tool-explanation' }).renderKind)
      .toBe(MESSAGE_CONTENT_RENDER_KIND.TOOL_EXPLANATION);
    expect(resolveMessageContentPresentation({ type: 'search-source' }).renderKind)
      .toBe(MESSAGE_CONTENT_RENDER_KIND.TOOL_EXPLANATION);
    expect(resolveMessageContentPresentation({ type: 'tool-actions-summary' }).renderKind)
      .toBe(MESSAGE_CONTENT_RENDER_KIND.TOOL_ACTIONS_SUMMARY);
  });

  test('classifies user screenshot rows through the screenshot runtime contract', () => {
    expect(resolveMessageContentPresentation({
      sender: 'user',
      text: 'show this',
      screenshotRef: 'artifact-1',
    }).renderKind).toBe(MESSAGE_CONTENT_RENDER_KIND.USER_WITH_SCREENSHOT);

    expect(resolveMessageContentPresentation({
      sender: 'assistant',
      text: 'tool screenshot',
      screenshotRef: 'artifact-1',
    }).renderKind).toBe(MESSAGE_CONTENT_RENDER_KIND.ASSISTANT_RESPONSE);
  });

  test('classifies assistant llm text rows and exposes visible text state', () => {
    expect(resolveMessageContentPresentation({
      sender: 'assistant',
      type: 'llm-text',
      text: 'Answer',
    })).toEqual({
      renderKind: MESSAGE_CONTENT_RENDER_KIND.ASSISTANT_RESPONSE,
      hasVisibleAssistantText: true,
    });

    expect(resolveMessageContentPresentation({
      sender: 'assistant',
      text: '   ',
      thinkingText: 'Reasoning',
    })).toEqual({
      renderKind: MESSAGE_CONTENT_RENDER_KIND.ASSISTANT_RESPONSE,
      hasVisibleAssistantText: false,
    });
  });

  test('uses markdown as the generic fallback kind', () => {
    expect(resolveMessageContentPresentation({
      sender: 'user',
      text: 'plain text',
    }).renderKind).toBe(MESSAGE_CONTENT_RENDER_KIND.MARKDOWN);

    expect(resolveMessageContentPresentation(null).renderKind)
      .toBe(MESSAGE_CONTENT_RENDER_KIND.MARKDOWN);
  });
});
