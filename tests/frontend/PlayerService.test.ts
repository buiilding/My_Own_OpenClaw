import { PlayerService } from '../../frontend/src/renderer/infrastructure/audio/PlayerService';

class MockAudioBuffer {
  private readonly channelData: Float32Array;

  constructor(length: number) {
    this.channelData = new Float32Array(length);
  }

  getChannelData(): Float32Array {
    return this.channelData;
  }
}

class MockAudioBufferSourceNode {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  connect = jest.fn();
  disconnect = jest.fn();
  start = jest.fn();
  stop = jest.fn();
}

class MockAudioContext {
  static instances: MockAudioContext[] = [];

  readonly destination = {};
  readonly sources: MockAudioBufferSourceNode[] = [];
  state: AudioContextState = 'running';
  resume = jest.fn().mockResolvedValue(undefined);
  close = jest.fn().mockResolvedValue(undefined);
  createBuffer = jest.fn((_: number, length: number) => new MockAudioBuffer(length) as unknown as AudioBuffer);
  createBufferSource = jest.fn(() => {
    const source = new MockAudioBufferSourceNode();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  });

  constructor() {
    MockAudioContext.instances.push(this);
  }
}

function encodeInt16Samples(samples: number[]): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((sample, index) => {
    view.setInt16(index * 2, sample, true);
  });
  return Buffer.from(bytes).toString('base64');
}

describe('PlayerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockAudioContext.instances = [];
    (window as any).AudioContext = MockAudioContext;
    (window as any).webkitAudioContext = undefined;
  });

  test('starts playback when first chunk is enqueued', () => {
    const service = new PlayerService();
    service.enqueueAudio({
      audio: encodeInt16Samples([0, 100, -100]),
      sample_rate: 16000,
    });

    const context = MockAudioContext.instances[0];
    expect(context.createBufferSource).toHaveBeenCalledTimes(1);
    expect(context.sources[0].start).toHaveBeenCalledWith(0);
    expect(service.getIsPlaying()).toBe(true);
  });

  test('plays queued chunks sequentially after source end', () => {
    const service = new PlayerService();
    const chunk = { audio: encodeInt16Samples([1, 2]), sample_rate: 16000 };

    service.enqueueAudio(chunk);
    service.enqueueAudio(chunk);

    const context = MockAudioContext.instances[0];
    expect(context.createBufferSource).toHaveBeenCalledTimes(1);

    context.sources[0].onended?.();
    expect(context.createBufferSource).toHaveBeenCalledTimes(2);
  });

  test('stopPlayback stops active source and prevents stale onended from continuing playback', () => {
    const service = new PlayerService();
    const chunk = { audio: encodeInt16Samples([1, 2]), sample_rate: 16000 };

    service.enqueueAudio(chunk);
    service.enqueueAudio(chunk);

    const context = MockAudioContext.instances[0];
    const firstSource = context.sources[0];

    service.stopPlayback();
    expect(firstSource.stop).toHaveBeenCalledWith(0);
    expect(firstSource.disconnect).toHaveBeenCalled();
    expect(service.getIsPlaying()).toBe(false);

    firstSource.onended?.();
    expect(context.createBufferSource).toHaveBeenCalledTimes(1);
  });

  test('cleanup closes audio context', () => {
    const service = new PlayerService();
    service.enqueueAudio({
      audio: encodeInt16Samples([0, 10]),
      sample_rate: 16000,
    });

    const context = MockAudioContext.instances[0];
    service.cleanup();
    expect(context.close).toHaveBeenCalledTimes(1);
  });
});
