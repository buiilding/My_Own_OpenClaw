/**
 * Provides the markdown message rendering module for the renderer UI.
 */

import {
  extractTextFromHtml,
  toSanitizedMarkdownHtml,
  resolveLlmOutputContract,
} from '../../../../app/runtime/desktopMarkdownRuntimeClient';

export function buildMarkdownRenderModel({
  text,
  sender = 'assistant',
}) {
  const contract = resolveLlmOutputContract(text ?? '', {
    enableMath: sender === 'assistant',
    normalizeTransportArtifacts: sender === 'assistant',
    stripAccidentalHtmlTokens: sender === 'assistant',
  });
  const html = toSanitizedMarkdownHtml(contract.markdown, { enableMath: contract.mathEnabled });
  return {
    contract,
    html,
    plainText: extractTextFromHtml(html),
  };
}
