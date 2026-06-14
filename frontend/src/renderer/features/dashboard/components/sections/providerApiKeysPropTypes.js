/**
 * Defines provider api keys prop types contracts for the renderer UI.
 */

import PropTypes from 'prop-types';

const providerApiKeyEntryPropType = PropTypes.shape({
  enabled: PropTypes.bool,
  api_key: PropTypes.string,
});

export const providerApiKeysPropType = PropTypes.shape({
  openai: providerApiKeyEntryPropType,
  anthropic: providerApiKeyEntryPropType,
  kimi_coding: providerApiKeyEntryPropType,
  google: providerApiKeyEntryPropType,
  openrouter: providerApiKeyEntryPropType,
  mistral: providerApiKeyEntryPropType,
});
