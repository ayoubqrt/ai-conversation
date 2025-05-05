import { useAgent } from "agents/react";
import { AgentClient } from "agents/client";
import { useState } from "react";
const socket = new AgentClient({
  agent: "chat",
  host: "http://localhost:5173",
});

socket.binaryType = "arraybuffer";

const audioContext = new AudioContext({ sampleRate: 24000 });
let audioTime = audioContext.currentTime;

let bufferQueue = [];
let bufferSize = 0;

socket.onmessage = (event) => {
  const chunk = new Int16Array(event.data);
  bufferQueue.push(chunk);
  bufferSize += chunk.length;

  // Attends d'avoir ~0.5 sec de son (ex: 24000/2 = 12000 samples)
  if (bufferSize >= 12000) {
    const combined = new Int16Array(bufferSize);
    let offset = 0;
    for (const b of bufferQueue) {
      combined.set(b, offset);
      offset += b.length;
    }
    bufferQueue = [];
    bufferSize = 0;

    playPcmChunk(combined);
  }
};

function playPcmChunk(int16) {
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
  const [message, setMessage] = useState<null | {
    answer: string;
    time: number;
  }>(null);
  // const agent = useAgent({
  //   agent: "chat",
  // });

  const onClick = () => {
    socket.send("asd");
  };

  return (
    <div>
      <h1>Test conversation AI</h1>
      <button onClick={onClick}>Send</button>

      {message && <p>Answer: {message.answer}</p>}
      {message && <p>Time: {message.time} ms</p>}
    </div>
  );
}
