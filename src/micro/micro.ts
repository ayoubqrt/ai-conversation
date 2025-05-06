import type { AgentClient } from "agents/client";

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
