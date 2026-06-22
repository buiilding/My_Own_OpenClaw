/**
 * Owns renderer browser audio-input device adapters for voice capture.
 */

type AudioContextConstructor = new (options?: AudioContextOptions) => AudioContext;

type AudioInputStreamOptions = {
  sampleRate: number;
  channelCount?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
};

type AudioInputContextOptions = {
  sampleRate: number;
};

function buildAudioInputConstraints(options: AudioInputStreamOptions): MediaTrackConstraints {
  const constraints: MediaTrackConstraints = {
    sampleRate: options.sampleRate,
    channelCount: options.channelCount ?? 1,
    echoCancellation: options.echoCancellation ?? true,
    noiseSuppression: options.noiseSuppression ?? true,
  };

  if (typeof options.autoGainControl === 'boolean') {
    constraints.autoGainControl = options.autoGainControl;
  }

  return constraints;
}

function getMediaDevices(): MediaDevices | null {
  return navigator.mediaDevices || null;
}

async function requestAudioInputStream(options: AudioInputStreamOptions): Promise<MediaStream> {
  const mediaDevices = getMediaDevices();
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
    throw new Error('Audio input capture is unavailable');
  }

  return mediaDevices.getUserMedia({
    audio: buildAudioInputConstraints(options),
  });
}

function createAudioInputContext(options: AudioInputContextOptions): AudioContext {
  const audioWindow = window as Window & typeof globalThis & {
    webkitAudioContext?: AudioContextConstructor;
  };
  const AudioContextCtor = audioWindow.AudioContext || audioWindow.webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error('AudioContext is unavailable');
  }

  return new AudioContextCtor({
    sampleRate: options.sampleRate,
  });
}

async function hasAvailableAudioInputDevice(): Promise<boolean> {
  const mediaDevices = getMediaDevices();
  if (!mediaDevices || typeof mediaDevices.enumerateDevices !== 'function') {
    return false;
  }

  try {
    const devices = await mediaDevices.enumerateDevices();
    return devices.some((device) => device.kind === 'audioinput');
  } catch {
    return false;
  }
}

function onAudioInputDeviceChange(handler: () => void): (() => void) | undefined {
  const mediaDevices = getMediaDevices();
  if (!mediaDevices || typeof mediaDevices.addEventListener !== 'function') {
    return undefined;
  }

  const listener: EventListener = () => {
    handler();
  };
  mediaDevices.addEventListener('devicechange', listener);
  return () => {
    mediaDevices.removeEventListener('devicechange', listener);
  };
}

export const DesktopVoiceAudioInputDeviceRuntime = Object.freeze({
  createAudioInputContext,
  hasAvailableAudioInputDevice,
  onAudioInputDeviceChange,
  requestAudioInputStream,
});
