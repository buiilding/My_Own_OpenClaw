/**
 * Covers voice audio processor node. behavior in the frontend test suite.
 */

import { DesktopVoiceAudioProcessorNodeRuntime } from '../../src/renderer/app/runtime/desktopVoiceAudioProcessorNodeRuntime';

const { createAudioCaptureProcessorNode } = DesktopVoiceAudioProcessorNodeRuntime;

type MockWorkletNodeInstance = {
  connect: jest.Mock<void, [unknown]>;
  disconnect: jest.Mock<void, []>;
  port: { onmessage: ((event: MessageEvent<Float32Array>) => void) | null };
  options: unknown;
};

describe('voice audio processor node', () => {
  const originalAudioWorkletNode = (globalThis as any).AudioWorkletNode;
  const originalCreateObjectURL = (URL as any).createObjectURL;

  afterEach(() => {
    (globalThis as any).AudioWorkletNode = originalAudioWorkletNode;
    (URL as any).createObjectURL = originalCreateObjectURL;
    jest.restoreAllMocks();
  });

  test('rejects when AudioWorklet is unavailable', async () => {
    (globalThis as any).AudioWorkletNode = undefined;

    const sourceNode = { connect: jest.fn() };
    const audioContext = {
      destination: {},
      audioWorklet: undefined,
    };

    await expect(createAudioCaptureProcessorNode({
      audioContext: audioContext as unknown as AudioContext,
      sourceNode: sourceNode as unknown as MediaStreamAudioSourceNode,
      chunkSize: 1024,
      onChunk: jest.fn(),
    })).rejects.toThrow('AudioWorklet capture processor is unavailable');
    expect(sourceNode.connect).not.toHaveBeenCalled();
  });

  test('uses AudioWorklet path when available and forwards worklet chunks', async () => {
    (URL as any).createObjectURL = jest.fn(() => 'blob:desktop-runtime-audio-worklet');
    const createdNodes: MockWorkletNodeInstance[] = [];
    class MockAudioWorkletNode {
      connect = jest.fn<void, [unknown]>();
      disconnect = jest.fn<void, []>();
      port = { onmessage: null as ((event: MessageEvent<Float32Array>) => void) | null };
      options: unknown;

      constructor(_context: AudioContext, _name: string, options: unknown) {
        this.options = options;
        createdNodes.push(this);
      }
    }
    (globalThis as any).AudioWorkletNode = MockAudioWorkletNode;

    const onChunk = jest.fn();
    const sourceNode = { connect: jest.fn() };
    const addModule = jest.fn(async () => undefined);
    const audioContext = {
      destination: {},
      audioWorklet: { addModule },
    };

    const processorNode = await createAudioCaptureProcessorNode({
      audioContext: audioContext as unknown as AudioContext,
      sourceNode: sourceNode as unknown as MediaStreamAudioSourceNode,
      chunkSize: 2048,
      onChunk,
    });

    expect(addModule).toHaveBeenCalledTimes(1);
    expect(createdNodes).toHaveLength(1);
    const node = createdNodes[0];
    expect(sourceNode.connect).toHaveBeenCalledWith(node);
    expect(node.connect).toHaveBeenCalledWith(audioContext.destination);
    expect(node.options).toEqual(expect.objectContaining({
      processorOptions: { chunkSize: 2048 },
    }));

    node.port.onmessage?.({ data: new Float32Array([0.25]) } as MessageEvent<Float32Array>);
    expect(onChunk).toHaveBeenCalledWith(new Float32Array([0.25]));
    expect(processorNode).toBe(node as unknown as AudioNode);
  });

  test('loads worklet module only once per audio context', async () => {
    (URL as any).createObjectURL = jest.fn(() => 'blob:desktop-runtime-audio-worklet');
    class MockAudioWorkletNode {
      connect = jest.fn<void, [unknown]>();
      disconnect = jest.fn<void, []>();
      port = { onmessage: null as ((event: MessageEvent<Float32Array>) => void) | null };
      constructor() {}
    }
    (globalThis as any).AudioWorkletNode = MockAudioWorkletNode;

    const addModule = jest.fn(async () => undefined);
    const sourceNode = { connect: jest.fn() };
    const audioContext = {
      destination: {},
      audioWorklet: { addModule },
    };

    await createAudioCaptureProcessorNode({
      audioContext: audioContext as unknown as AudioContext,
      sourceNode: sourceNode as unknown as MediaStreamAudioSourceNode,
      chunkSize: 512,
      onChunk: jest.fn(),
    });
    await createAudioCaptureProcessorNode({
      audioContext: audioContext as unknown as AudioContext,
      sourceNode: sourceNode as unknown as MediaStreamAudioSourceNode,
      chunkSize: 512,
      onChunk: jest.fn(),
    });

    expect(addModule).toHaveBeenCalledTimes(1);
  });
});
