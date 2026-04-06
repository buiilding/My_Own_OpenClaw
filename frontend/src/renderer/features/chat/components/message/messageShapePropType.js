import PropTypes from 'prop-types';
import { toolSchemaListPropType } from './toolSchemaPropType';

const messageShapePropType = PropTypes.shape({
  id: PropTypes.string.isRequired,
  text: PropTypes.string.isRequired,
  sender: PropTypes.oneOf(['user', 'assistant']).isRequired,
  isComplete: PropTypes.bool,
  type: PropTypes.string,
  feedback: PropTypes.oneOf(['like', 'dislike', null]),
  screenshot: PropTypes.string,
  screenshotRef: PropTypes.string,
  screenshotUrl: PropTypes.string,
  sourceEventType: PropTypes.string,
  sourceChannel: PropTypes.string,
  actionExplanations: PropTypes.arrayOf(PropTypes.string),
  thinkingText: PropTypes.string,
  thinkingSourceEventType: PropTypes.string,
  tokenCounts: PropTypes.shape({
    prompt_tokens: PropTypes.number,
    visible_output_tokens: PropTypes.number,
    thinking_tokens: PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([null])]),
    output_tokens_total: PropTypes.number,
    total_tokens: PropTypes.number,
    conversation_tokens: PropTypes.number,
    usage_source: PropTypes.oneOf(['provider', 'estimated']),
    cached_tokens: PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([null])]),
    cache_hit: PropTypes.oneOfType([PropTypes.bool, PropTypes.oneOf([null])]),
    cache_status: PropTypes.oneOfType([PropTypes.oneOf(['hit', 'miss', 'unknown']), PropTypes.oneOf([null])]),
  }),
  systemPrompt: PropTypes.shape({
    content: PropTypes.string,
    toolSchemas: toolSchemaListPropType,
  }),
  toolSchemas: toolSchemaListPropType,
});

export default messageShapePropType;
