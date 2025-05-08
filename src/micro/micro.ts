import type { AgentClient } from "agents/client";
import { useEffect, useState } from "react";

export const initVAD = async (
  stream: MediaStream,
  onVoiceStart: () => void,
  onVoiceEnd: (buffer: ArrayBuffer) => void
) => {
  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);

  const data = new Uint8Array(analyser.fftSize);
  let recording = false;
  let mediaRecorder: MediaRecorder;
  let chunks: Blob[] = [];
  let vadTimeout: ReturnType<typeof setTimeout>;

  const startRecording = () => {
    chunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: mediaRecorder.mimeType });
      blob.arrayBuffer().then((buffer) => {
        const encoder = new TextEncoder();
        const mimeBytes = encoder.encode(mediaRecorder.mimeType);
        const mimeLength = new Uint8Array([mimeBytes.length]);

        const combined = new Uint8Array(
          1 + mimeBytes.length + buffer.byteLength
        );
        combined.set(mimeLength, 0);
        combined.set(mimeBytes, 1);
        combined.set(new Uint8Array(buffer), 1 + mimeBytes.length);

        onVoiceEnd(combined.buffer);
      });
    };
    mediaRecorder.start();
    onVoiceStart();
  };

  const stopRecording = () => {
    if (mediaRecorder?.state !== "inactive") {
      mediaRecorder.stop();
    }
  };

  const checkVoice = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;

    for (let i = 0; i < data.length; i++) {
      const deviation = data[i] - 128;
      sum += deviation * deviation;
    }

    const rms = Math.sqrt(sum / data.length);

    if (rms > 10) {
      if (!recording) {
        startRecording();
        recording = true;
      }

      clearTimeout(vadTimeout);

      vadTimeout = setTimeout(() => {
        stopRecording();
        recording = false;
      }, 1500);
    }

    requestAnimationFrame(checkVoice);
  };

  checkVoice();

  return () => {
    stopRecording();
    audioCtx.close();
    stream.getTracks().forEach((t) => t.stop());
  };
};

export const useMicroVAD = (socket: AgentClient<unknown>) => {
  const [isDetectingVoice, setIsDetectingVoice] = useState(false);

  useEffect(() => {
    let cleanup: (() => void) | null = null;

    const setup = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      cleanup = await initVAD(
        stream,
        () => setIsDetectingVoice(true),
        (blob) => {
          socket.send(blob);
          setIsDetectingVoice(false);
        }
      );
    };

    setup();

    return () => {
      if (cleanup) cleanup();
    };
  }, [socket]);

  return { isDetectingVoice };
};
