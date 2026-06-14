/**
 * Provides the audio processor node module for the renderer UI.
 */

import type { LegacyAudioProcessorNode } from './audioCaptureCleanup';

const CAPTURE_WORKLET_NAME = 'windieos-capture-processor';
const workletLoadedContexts = new WeakSet<AudioContext>();

const WORKLET_SOURCE = `
class WindieOSCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const requestedChunkSize = Number(options?.processorOptions?.chunkSize);
    this.chunkSize = Number.isFinite(requestedChunkSize) && requestedChunkSize > 0
      ? Math.floor(requestedChunkSize)
      : 1024;
    this.pending = new Float32Array(0);
  }

  process(inputs) {
    const channel = inputs?.[0]?.[0];
    if (!channel || channel.length === 0) {
      return true;
    }

    const merged = new Float32Array(this.pending.length + channel.length);
    merged.set(this.pending, 0);
    merged.set(channel, this.pending.length);

    let offset = 0;
    while (offset + this.chunkSize <= merged.length) {
      const chunk = merged.slice(offset, offset + this.chunkSize);
      this.port.postMessage(chunk);
      offset += this.chunkSize;
    }
    this.pending = merged.slice(offset);
    return true;
  }
}

registerProcessor('${CAPTURE_WORKLET_NAME}', WindieOSCaptureProcessor);
`;

let workletSourceUrl: string | null = null;

type AudioProcessorFactoryParams = {
  audioContext: AudioContext;
  sourceNode: MediaStreamAudioSourceNode;
  chunkSize: number;
  onChunk: (chunk: Float32Array) => void;
};

type LegacyScriptProcessorFactory = (
  bufferSize: number,
  numberOfInputChannels: number,
  numberOfOutputChannels: number,
) => AudioNode;

function ensureWorkletSourceUrl(): string {
  if (workletSourceUrl) {
    return workletSourceUrl;
  }
  const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' });
  workletSourceUrl = URL.createObjectURL(blob);
  return workletSourceUrl;
}

async function tryCreateWorkletNode(
  params: AudioProcessorFactoryParams,
): Promise<LegacyAudioProcessorNode | null> {
  const { audioContext, sourceNode, chunkSize, onChunk } = params;
  if (
    typeof AudioWorkletNode !== 'function'
    || !audioContext.audioWorklet
    || typeof audioContext.audioWorklet.addModule !== 'function'
  ) {
    return null;
  }

  try {
    if (!workletLoadedContexts.has(audioContext)) {
      await audioContext.audioWorklet.addModule(ensureWorkletSourceUrl());
      workletLoadedContexts.add(audioContext);
    }

    const node = new AudioWorkletNode(audioContext, CAPTURE_WORKLET_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      outputChannelCount: [1],
      processorOptions: { chunkSize },
    });

    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      const chunk = event.data;
      if (!(chunk instanceof Float32Array) || chunk.length === 0) {
        return;
      }
      onChunk(chunk);
    };

    sourceNode.connect(node);
    node.connect(audioContext.destination);
    return node as unknown as LegacyAudioProcessorNode;
  } catch (error) {
    console.warn('[Voice] AudioWorklet unavailable; using ScriptProcessor fallback', error);
    return null;
  }
}

function createScriptProcessorNode(params: AudioProcessorFactoryParams): LegacyAudioProcessorNode {
  const { audioContext, sourceNode, chunkSize, onChunk } = params;
  const createScriptProcessor = (
    audioContext as unknown as { createScriptProcessor?: LegacyScriptProcessorFactory }
  ).createScriptProcessor;
  if (typeof createScriptProcessor !== 'function') {
    throw new Error('ScriptProcessor fallback is unavailable');
  }
  const scriptNode = createScriptProcessor.call(audioContext, chunkSize, 1, 1) as LegacyAudioProcessorNode;
  scriptNode.onaudioprocess = (event) => {
    onChunk(event.inputBuffer.getChannelData(0));
  };
  sourceNode.connect(scriptNode);
  scriptNode.connect(audioContext.destination);
  return scriptNode;
}

export async function createAudioCaptureProcessorNode(
  params: AudioProcessorFactoryParams,
): Promise<LegacyAudioProcessorNode> {
  const workletNode = await tryCreateWorkletNode(params);
  if (workletNode) {
    return workletNode;
  }
  return createScriptProcessorNode(params);
}
