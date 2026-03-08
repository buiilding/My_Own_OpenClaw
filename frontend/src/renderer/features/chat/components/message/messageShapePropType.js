import PropTypes from 'prop-types';

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
  thinkingText: PropTypes.string,
  thinkingSourceEventType: PropTypes.string,
  systemPrompt: PropTypes.shape({
    content: PropTypes.string,
    toolSchemas: PropTypes.any,
  }),
  toolSchemas: PropTypes.any,
});

export default messageShapePropType;
