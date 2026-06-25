/**
 * Defines skin-configured provider api keys prop type contracts for the renderer UI.
 */

import PropTypes from 'prop-types';

const providerApiKeyEntryPropType = PropTypes.shape({
  enabled: PropTypes.bool,
  api_key: PropTypes.string,
  has_saved_key: PropTypes.bool,
  clear_saved_key: PropTypes.bool,
});

export const providerApiKeysPropType = PropTypes.objectOf(providerApiKeyEntryPropType);
