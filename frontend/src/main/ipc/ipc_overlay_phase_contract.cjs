/**
 * Defines IPC overlay phase contracts for the Electron main process.
 */

const responseOverlayPhaseContract = require('../../shared/response_overlay_phase_contract.json');

const RESPONSE_OVERLAY_PHASES = new Set(responseOverlayPhaseContract.phases || []);

const RESPONSE_OVERLAY_METADATA_KEYS = [...(responseOverlayPhaseContract.metadata_keys || [])];

const RESPONSE_OVERLAY_PREFLIGHT_SOURCE = responseOverlayPhaseContract.preflight?.source;
const RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF = responseOverlayPhaseContract.preflight?.guard_ref;

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

function normalizeResponseOverlayMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const normalized = {};
  for (const key of RESPONSE_OVERLAY_METADATA_KEYS) {
    const value = metadata[key];
    if (key === 'attempt' || key === 'max_attempts') {
      const normalizedNumber = normalizeOverlayNumber(value);
      if (normalizedNumber !== null) {
        normalized[key] = normalizedNumber;
      }
      continue;
    }
    const normalizedString = normalizeOverlayString(value);
    if (normalizedString !== null) {
      normalized[key] = normalizedString;
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function areResponseOverlayMetadataEqual(left, right) {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  for (const key of RESPONSE_OVERLAY_METADATA_KEYS) {
    if (left[key] !== right[key]) {
      return false;
    }
  }
  return true;
}

function createResponseOverlayPhaseContractRuntime() {
  return {
    hasPhase: phase => RESPONSE_OVERLAY_PHASES.has(phase),
    normalizeMetadata: normalizeResponseOverlayMetadata,
    areMetadataEqual: areResponseOverlayMetadataEqual,
    normalizeEventString: normalizeOverlayString,
    normalizeEventNumber: normalizeOverlayNumber,
  };
}

module.exports = {
  createResponseOverlayPhaseContractRuntime,
  createResponseOverlayPhaseEnum,
  RESPONSE_OVERLAY_METADATA_KEYS,
  RESPONSE_OVERLAY_PHASES,
  RESPONSE_OVERLAY_PREFLIGHT_GUARD_REF,
  RESPONSE_OVERLAY_PREFLIGHT_SOURCE,
};
