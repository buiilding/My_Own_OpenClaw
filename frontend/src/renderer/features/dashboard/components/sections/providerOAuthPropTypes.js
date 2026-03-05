import PropTypes from 'prop-types';

const providerOAuthEntryPropType = PropTypes.shape({
  connected: PropTypes.bool,
  access_token: PropTypes.string,
  refresh_token: PropTypes.string,
  expires_at: PropTypes.number,
  profile_id: PropTypes.string,
});

export const providerOAuthPropType = PropTypes.shape({
  openai_codex: providerOAuthEntryPropType,
});
