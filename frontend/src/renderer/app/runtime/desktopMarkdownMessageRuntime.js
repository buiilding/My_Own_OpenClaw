/**
 * Provides renderer markdown message render-model helpers for presentation surfaces.
 */

import {
  extractTextFromHtml,
  toSanitizedMarkdownHtml,
  resolveLlmOutputContract,
} from './desktopMarkdownRuntimeClient';

function buildMarkdownRenderModel({
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

export const DesktopMarkdownMessageRuntime = Object.freeze({
  buildMarkdownRenderModel,
});
