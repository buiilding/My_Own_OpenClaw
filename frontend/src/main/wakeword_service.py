#!/usr/bin/env python3
"""
Wakeword Detection Service for Electron App.

This service runs as a subprocess and processes audio streams
to detect wakewords using openWakeWord library.
"""

import sys
import json
import numpy as np
from openwakeword.model import Model

# Initialize the wakeword model
# Load only "hey_jarvis" model for efficiency
try:
    owwModel = Model(wakeword_models=["hey_jarvis"], inference_framework="tflite")
    print(json.dumps({"status": "ready", "model": "hey_jarvis"}), file=sys.stderr, flush=True)
except Exception as e:
    print(json.dumps({"status": "error", "message": str(e)}), file=sys.stderr, flush=True)
    sys.exit(1)

# Process audio chunks from stdin
chunk_count = 0
def process_audio_chunk(audio_data):
    """Process audio chunk and return predictions."""
    global chunk_count
    chunk_count += 1
    try:
        # Convert audio bytes to numpy array (16-bit PCM)
        audio_array = np.frombuffer(audio_data, dtype=np.int16)
        
        # Get predictions from openWakeWord
        predictions = owwModel.predict(audio_array)
        
        # Check for wakeword detection (threshold: 0.5)
        detection_threshold = 0.5
        for model_name, score in predictions.items():
            # Always log confidence scores
            score_pct = score * 100.0
            if score >= detection_threshold:
                print(f"[Python] *** DETECTED *** {model_name}: {score:.4f} ({score_pct:.1f}%)", file=sys.stderr, flush=True)
                return {
                    "detected": True,
                    "model": model_name,
                    "score": float(score),
                    "confidence": float(score)
                }
            else:
                # Log all scores above 0.05 for debugging
                if score > 0.05:
                    print(f"[Python] {model_name}: {score:.4f} ({score_pct:.1f}%)", file=sys.stderr, flush=True)
        
        return {"detected": False}
    except Exception as e:
        print(json.dumps({"status": "error", "message": f"Error processing audio: {str(e)}"}), file=sys.stderr, flush=True)
        return {"error": str(e)}

# Main loop: read audio chunks from stdin
if __name__ == "__main__":
    # Send ready signal to stderr (so it doesn't interfere with detection results on stdout)
    print(json.dumps({"status": "ready", "message": "Main loop started"}), file=sys.stderr, flush=True)
    
    try:
        audio_chunks_received = 0
        while True:
            # Read message length (4 bytes)
            length_bytes = sys.stdin.buffer.read(4)
            if not length_bytes or len(length_bytes) != 4:
                break
            
            # Read message type/content
            length = int.from_bytes(length_bytes, byteorder='little')
            if length == 0:
                # Special signal: clear internal buffers
                # openWakeWord preserves state between predictions. Resetting the model
                # or feeding silence might be needed, but for now we just reset the chunk count.
                # The model object doesn't expose a clear() method, but creating a new one 
                # is expensive. However, openWakeWord is generally stateless between separate
                # continuous streams if we don't feed it. 
                # The issue is likely buffered audio in the pipe or internal library buffers.
                # Since we can't easily reset internal buffers of the library without reloading,
                # we acknowledge the reset command.
                print(f"[Python] Resetting audio state", file=sys.stderr, flush=True)
                owwModel.reset() # Reset model state if supported (v0.5.0+)
                continue
            
            audio_data = sys.stdin.buffer.read(length)
            
            if not audio_data or len(audio_data) != length:
                break
            
            audio_chunks_received += 1
            if audio_chunks_received == 1:
                print(f"[Python] Received first audio chunk: {length} bytes ({length // 2} samples)", file=sys.stderr, flush=True)
            elif audio_chunks_received % 50 == 0:
                print(f"[Python] Processed {audio_chunks_received} audio chunks", file=sys.stderr, flush=True)
            
            # Process audio chunk
            result = process_audio_chunk(audio_data)
            
            # Send result as JSON
            result_json = json.dumps(result)
            result_bytes = result_json.encode('utf-8')
            sys.stdout.buffer.write(len(result_bytes).to_bytes(4, byteorder='little'))
            sys.stdout.buffer.write(result_bytes)
            sys.stdout.buffer.flush()
            
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}), file=sys.stderr, flush=True)
    finally:
        sys.exit(0)


