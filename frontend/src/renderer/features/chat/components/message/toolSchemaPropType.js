/**
 * Defines tool schema prop type contracts for the renderer UI.
 */

import PropTypes from 'prop-types';

const toolSchemaFunctionPropType = PropTypes.shape({
  name: PropTypes.string,
  parameters: PropTypes.object,
});

const toolSchemaPropType = PropTypes.shape({
  type: PropTypes.string.isRequired,
  name: PropTypes.string,
  description: PropTypes.string,
  strict: PropTypes.bool,
  parameters: PropTypes.object,
  function: toolSchemaFunctionPropType,
});

export const toolSchemaListPropType = PropTypes.arrayOf(toolSchemaPropType);
