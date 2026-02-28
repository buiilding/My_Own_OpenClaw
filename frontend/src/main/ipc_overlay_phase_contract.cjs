const responseOverlayPhaseContract = require('../shared/response_overlay_phase_contract.json');

const RESPONSE_OVERLAY_PHASES = new Set(responseOverlayPhaseContract.phases || []);

const RESPONSE_OVERLAY_METADATA_KEYS = [...(responseOverlayPhaseContract.metadata_keys || [])];

function createResponseOverlayPhaseEnum() {
  const phaseEnum = {};
  for (const phase of RESPONSE_OVERLAY_PHASES) {
    const enumKey = phase.toUpperCase().replace(/-/g, '_');
    phaseEnum[enumKey] = phase;
  }
  return Object.freeze(phaseEnum);
}

function normalizeOverlayString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOverlayNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

module.exports = {
  createResponseOverlayPhaseEnum,
  RESPONSE_OVERLAY_METADATA_KEYS,
  RESPONSE_OVERLAY_PHASES,
  normalizeOverlayNumber,
  normalizeOverlayString,
};
