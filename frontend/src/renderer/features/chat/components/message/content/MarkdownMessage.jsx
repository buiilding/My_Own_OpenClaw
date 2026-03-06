import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { toSanitizedMarkdownHtml } from '../../../../../infrastructure/markdown';
import { resolveLlmOutputContract } from '../../../../../infrastructure/llmOutputContract';

export default function MarkdownMessage({
  text,
  sender = 'assistant',
  modelProvider = null,
  modelId = null,
}) {
  const contract = useMemo(
    () => resolveLlmOutputContract(text ?? '', {
      provider: sender === 'assistant' ? modelProvider : null,
      modelId: sender === 'assistant' ? modelId : null,
      enableMath: sender === 'assistant',
      stripAccidentalHtmlTokens: sender === 'assistant',
    }),
    [text, sender, modelProvider, modelId],
  );
  const html = useMemo(
    () => toSanitizedMarkdownHtml(contract.markdown, { enableMath: contract.mathEnabled }),
    [contract.markdown, contract.mathEnabled],
  );
  return (
    <div
      className="message-content message-content-markdown"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

MarkdownMessage.propTypes = {
  text: PropTypes.string,
  sender: PropTypes.oneOf(['user', 'assistant']),
  modelProvider: PropTypes.string,
  modelId: PropTypes.string,
};
