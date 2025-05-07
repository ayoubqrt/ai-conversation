import type { AgentClient } from "agents/client";
import { useEffect, useState } from "react";

export const microChunking = (socket: AgentClient<unknown>) => {
  socket.binaryType = "arraybuffer";

  let mediaRecorder: MediaRecorder;
  let vadTimeout: ReturnType<typeof setTimeout>;

  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      const options = { mimeType: "audio/webm;codecs=opus" };

      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.error("Unsupported MIME type:", options.mimeType);
        return;
      }

      mediaRecorder = new MediaRecorder(stream, options);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          socket.send(e.data);
          console.log("Chunk envoyé:", e.data.size, "bytes");
        }
      };

      mediaRecorder.onstart = () => {
        console.log("MediaRecorder started.");
      };

      mediaRecorder.start(1000); // 1 chunk/sec

      // VAD setup
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);

      const data = new Uint8Array(analyser.fftSize);

      function checkVoice() {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const deviation = data[i] - 128;
          sum += deviation * deviation;
        }

        const rms = Math.sqrt(sum / data.length);

        if (rms > 10) {
          clearTimeout(vadTimeout);
          vadTimeout = setTimeout(() => {
            console.log("Silence détecté, arrêt.");
            mediaRecorder.stop();
            socket.close();
          }, 1500);
        }

        requestAnimationFrame(checkVoice);
      }

      checkVoice();
    })
    .catch((err) => {
      console.error("Erreur micro:", err);
    });
};

export const micro = (socket: AgentClient<unknown>) => {
  socket.binaryType = "arraybuffer";

  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      const options = { mimeType: "audio/webm;codecs=opus" };

      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.error("Unsupported MIME type:", options.mimeType);
        return;
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: options.mimeType });

        // Préécoute via un lecteur audio
        const audioURL = URL.createObjectURL(blob);
        const audio = new Audio(audioURL);
        audio.controls = true;
        document.body.appendChild(audio);

        // Ensuite envoi si nécessaire
        socket.send(blob);
        // socket.close();
      };

      mediaRecorder.start();
      console.log("Enregistrement démarré.");
      setTimeout(() => {
        mediaRecorder.stop();
      }, 5000);
    })
    .catch((err) => {
      console.error("Erreur micro:", err);
    });
};

export const microVAD = (socket: AgentClient<unknown>) => {
  socket.binaryType = "arraybuffer";

  let mediaRecorder: MediaRecorder | null = null;
  let vadTimeout: ReturnType<typeof setTimeout> | null = null;
  let audioCtx: AudioContext;
  let analyser: AnalyserNode;
  let source: MediaStreamAudioSourceNode;
  let stream: MediaStream;
  let chunks: Blob[] = [];

  const initAudio = async () => {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const options = { mimeType: "audio/webm;codecs=opus" };

    audioCtx = new AudioContext();
    source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);

    const data = new Uint8Array(analyser.fftSize);
    let recording = false;

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
        if (vadTimeout) clearTimeout(vadTimeout);
        vadTimeout = setTimeout(() => {
          stopRecording();
          recording = false;
        }, 1500);
      }

      requestAnimationFrame(checkVoice);
    };

    function startRecording() {
      chunks = [];
      mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: options.mimeType });
        socket.send(blob);
        console.log("Audio envoyé:", blob.size, "bytes");
      };
      mediaRecorder.start();
      console.log("Recording started");
    }

    function stopRecording() {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
        console.log("Recording stopped");
      }
    }

    checkVoice();
  };

  initAudio().catch((err) => {
    console.error("Erreur micro:", err);
  });
};

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

  const options = { mimeType: "audio/webm;codecs=opus" };

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
        const mimeBytes = encoder.encode(mediaRecorder.mimeType); // e.g. "audio/webm"
        const mimeLength = new Uint8Array([mimeBytes.length]); // 1 byte

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
