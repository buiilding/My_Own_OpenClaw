import PropTypes from 'prop-types';

export const conversationGroupsPropType = PropTypes.shape({
  today: PropTypes.array.isRequired,
  yesterday: PropTypes.array.isRequired,
  previous7Days: PropTypes.array.isRequired,
  older: PropTypes.array.isRequired,
}).isRequired;
