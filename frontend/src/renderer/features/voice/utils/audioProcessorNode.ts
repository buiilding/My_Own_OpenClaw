/**
 * Provides the audio processor node module for the renderer UI.
 */

const CAPTURE_WORKLET_NAME = 'desktop-agent-capture-processor';
const workletLoadedContexts = new WeakSet<AudioContext>();

const WORKLET_SOURCE = `
class DesktopAgentCaptureProcessor extends AudioWorkletProcessor {
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

registerProcessor('${CAPTURE_WORKLET_NAME}', DesktopAgentCaptureProcessor);
`;

let workletSourceUrl: string | null = null;

type AudioProcessorFactoryParams = {
  audioContext: AudioContext;
  sourceNode: MediaStreamAudioSourceNode;
  chunkSize: number;
  onChunk: (chunk: Float32Array) => void;
};

function ensureWorkletSourceUrl(): string {
  if (workletSourceUrl) {
    return workletSourceUrl;
  }
  const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' });
  workletSourceUrl = URL.createObjectURL(blob);
  return workletSourceUrl;
}

async function createWorkletNode(
  params: AudioProcessorFactoryParams,
): Promise<AudioWorkletNode> {
  const { audioContext, sourceNode, chunkSize, onChunk } = params;
  if (
    typeof AudioWorkletNode !== 'function'
    || !audioContext.audioWorklet
    || typeof audioContext.audioWorklet.addModule !== 'function'
  ) {
    throw new Error('AudioWorklet capture processor is unavailable');
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
    return node;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`AudioWorklet capture processor failed to initialize: ${message}`);
  }
}

export async function createAudioCaptureProcessorNode(
  params: AudioProcessorFactoryParams,
): Promise<AudioWorkletNode> {
  return createWorkletNode(params);
}
