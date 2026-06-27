/**
 * Covers player service. behavior in the frontend test suite.
 */

import { PlayerService } from '../../src/renderer/infrastructure/audio/PlayerService';

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

function enqueueTwoChunks(service: PlayerService) {
  const chunk = { audio: encodeInt16Samples([1, 2]), sample_rate: 16000 };
  service.enqueueAudio(chunk);
  service.enqueueAudio(chunk);
  return MockAudioContext.instances[0];
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
    const context = enqueueTwoChunks(service);
    expect(context.createBufferSource).toHaveBeenCalledTimes(1);

    context.sources[0].onended?.();
    expect(context.createBufferSource).toHaveBeenCalledTimes(2);
  });

  test('stopPlayback stops active source, closes context, and prevents queued playback', () => {
    const service = new PlayerService();
    const context = enqueueTwoChunks(service);
    const firstSource = context.sources[0];

    service.stopPlayback();
    expect(firstSource.stop).toHaveBeenCalledWith(0);
    expect(firstSource.disconnect).toHaveBeenCalled();
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(service.getIsPlaying()).toBe(false);

    firstSource.onended?.();
    expect(context.createBufferSource).toHaveBeenCalledTimes(1);
  });

  test('ignores stored onended callback after playback generation changes', () => {
    const service = new PlayerService();
    service.enqueueAudio({
      audio: encodeInt16Samples([1, 2]),
      sample_rate: 16000,
    });

    const context = MockAudioContext.instances[0];
    const staleOnEnded = context.sources[0].onended;
    service.stopPlayback();

    staleOnEnded?.();
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

  test('handles suspended audio context resume rejection without crashing playback', () => {
    const service = new PlayerService();
    const context = new MockAudioContext();
    context.state = 'suspended';
    context.resume.mockRejectedValueOnce(new Error('resume-failed'));
    (window as any).AudioContext = jest.fn(() => context);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    service.enqueueAudio({
      audio: encodeInt16Samples([10, -10]),
      sample_rate: 16000,
    });

    expect(context.createBufferSource).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  test('marks player idle when active source finishes and queue is empty', () => {
    const service = new PlayerService();
    service.enqueueAudio({
      audio: encodeInt16Samples([1, 2]),
      sample_rate: 16000,
    });

    const context = MockAudioContext.instances[0];
    expect(service.getIsPlaying()).toBe(true);

    context.sources[0].onended?.();
    expect(service.getIsPlaying()).toBe(false);
  });

  test('stopPlayback swallows source stop/disconnect and context close errors', () => {
    const service = new PlayerService();
    service.enqueueAudio({
      audio: encodeInt16Samples([3, 4]),
      sample_rate: 16000,
    });
    const context = MockAudioContext.instances[0];
    const source = context.sources[0];
    source.stop.mockImplementation(() => {
      throw new Error('stop-failed');
    });
    source.disconnect.mockImplementation(() => {
      throw new Error('disconnect-failed');
    });
    context.close.mockRejectedValueOnce(new Error('close-failed'));

    expect(() => service.stopPlayback()).not.toThrow();
    expect(service.getIsPlaying()).toBe(false);
  });

  test('continues to next chunk when source start throws during playback', () => {
    const service = new PlayerService();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const chunkA = { audio: encodeInt16Samples([3, 4]), sample_rate: 16000 };
    const chunkB = { audio: encodeInt16Samples([5, 6]), sample_rate: 16000 };
    const context = new MockAudioContext();
    let throwFirstStart = true;
    context.createBufferSource = jest.fn(() => {
      const source = new MockAudioBufferSourceNode();
      if (throwFirstStart) {
        source.start.mockImplementation(() => {
          throw new Error('start-failed');
        });
        throwFirstStart = false;
      }
      context.sources.push(source);
      return source as unknown as AudioBufferSourceNode;
    });
    (window as any).AudioContext = jest.fn(() => context);

    service.enqueueAudio(chunkA);
    service.enqueueAudio(chunkB);

    expect(context.createBufferSource).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(
      '[PlayerService] Error playing audio chunk:',
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  test('skips malformed chunks without blocking later playback', () => {
    const service = new PlayerService();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const atobSpy = jest.spyOn(window, 'atob');
    atobSpy.mockImplementationOnce(() => {
      throw new Error('decode-failed');
    });

    expect(() => {
      service.enqueueAudio({ audio: 'not-base64', sample_rate: 16000 });
    }).not.toThrow();
    expect(service.getIsPlaying()).toBe(false);

    service.enqueueAudio({
      audio: encodeInt16Samples([7, 8]),
      sample_rate: 16000,
    });

    const context = MockAudioContext.instances[0];
    expect(context.createBufferSource).toHaveBeenCalledTimes(1);
    expect(context.sources[0].start).toHaveBeenCalledWith(0);
    expect(errorSpy).toHaveBeenCalledWith(
      '[PlayerService] Error playing audio chunk:',
      expect.any(Error),
    );

    atobSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('drains queued malformed chunks without recursive playback', async () => {
    const service = new PlayerService();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const context = enqueueTwoChunks(service);
    context.sources[0].onended?.();
    expect(service.getIsPlaying()).toBe(true);

    const atobSpy = jest.spyOn(window, 'atob').mockImplementation(() => {
      throw new Error('decode-failed');
    });
    for (let index = 0; index < 1000; index += 1) {
      service.enqueueAudio({ audio: `bad-${index}`, sample_rate: 16000 });
    }

    context.sources[1].onended?.();
    expect(service.getIsPlaying()).toBe(false);

    for (let index = 0; index < 1000; index += 1) {
      await Promise.resolve();
    }

    expect(service.getIsPlaying()).toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1000);

    atobSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
