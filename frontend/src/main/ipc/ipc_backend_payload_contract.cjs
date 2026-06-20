/**
 * Electron main compatibility facade for the SDK backend payload contract.
 */

const {
  filterBackendPayload,
} = require('../../../../packages/windie-sdk-js/cjs/transport/backendPayloadContract.js');

module.exports = {
  filterBackendPayload,
};
