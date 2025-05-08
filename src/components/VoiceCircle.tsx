import { useEffect, useState } from "react";

export const useVolumeLevel = () => {
  const [volume, setVolume] = useState(0);

  useEffect(() => {
    let audioCtx: AudioContext;
    let analyser: AnalyserNode;
    let data: Uint8Array;
    let source: MediaStreamAudioSourceNode;

    let animationId: number;

    const init = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtx = new AudioContext();
      source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      data = new Uint8Array(analyser.fftSize);

      const update = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = data[i] - 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const normalized = Math.min(rms / 30, 1); // scale 0–1
        setVolume(normalized);

        animationId = requestAnimationFrame(update);
      };

      update();
    };

    init();

    return () => {
      cancelAnimationFrame(animationId);
      audioCtx?.close();
    };
  }, []);

  return volume;
};

export const VoiceCircle = ({ volume }: { volume: number }) => {
  const scale = 1 + volume * 0.5;
  return <div className="circle" style={{ transform: `scale(${scale})` }} />;
};
