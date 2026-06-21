/**
 * Provides renderer markdown message render-model helpers for presentation surfaces.
 */

import { DesktopMarkdownRuntimeClient } from './desktopMarkdownRuntimeClient';

const {
  extractTextFromHtml,
  toSanitizedMarkdownHtml,
  resolveLlmOutputContract,
} = DesktopMarkdownRuntimeClient;

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
