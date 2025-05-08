import { AgentClient } from "agents/client";
import { useState } from "react";
import { useMicroVAD } from "./micro/micro";
import { useVolumeLevel, VoiceCircle } from "./components/VoiceCircle";

const socket = new AgentClient({
  agent: "chat",
  host: window.location.origin,
});

socket.binaryType = "arraybuffer";

const audioContext = new AudioContext({ sampleRate: 24000 });
let audioTime = audioContext.currentTime;

let bufferQueue: Int16Array[] = [];
let bufferSize = 0;

function playPcmChunk(int16: Int16Array) {
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }

  const buffer = audioContext.createBuffer(1, float32.length, 24000);
  buffer.getChannelData(0).set(float32);

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);

  const now = audioContext.currentTime;
  if (audioTime < now) audioTime = now + 0.05;
  source.start(audioTime);
  audioTime += buffer.duration;
}

export default function Chat() {
  const [messages, setMessages] = useState<string[]>([]);
  const volume = useVolumeLevel();

  const { isDetectingVoice } = useMicroVAD(socket);

  socket.onmessage = (event) => {
    if (typeof event.data === "string") {
      console.log("Received message from server:", event.data);
      setMessages((prev) => [...prev, event.data]);
      return;
    }

    const chunk = new Int16Array(event.data);
    bufferQueue.push(chunk);
    bufferSize += chunk.length;

    const combined = new Int16Array(bufferSize);
    let offset = 0;
    for (const b of bufferQueue) {
      combined.set(b, offset);
      offset += b.length;
    }
    bufferQueue = [];
    bufferSize = 0;

    playPcmChunk(combined);
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        width: "100vw",
        flexDirection: "column",
        gap: "3rem",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <h1>Conversation avec une IA</h1>

        {isDetectingVoice ? <p>Je t'écoute</p> : <p>Pose moi une question</p>}
        <VoiceCircle volume={volume} />
      </div>
      <div
        style={{
          overflowY: "auto",
          scrollbarColor: "black",
          height: "30%",
          width: "50%",
        }}
      >
        {messages.map((message, index) => (
          <p key={index}>{message}</p>
        ))}
      </div>
    </div>
  );
}
