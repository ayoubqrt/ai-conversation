// text to speech + upload to R2

const textToSpeech = async (text: string, connection: WebSocket, env: Env) => {
  const response = await client.audio.speech.create({
    model: "gpt-4o-mini-tts",
    input: text,
    voice: "alloy",
    response_format: "pcm",
    instructions: `Please speak for a children of 5 years old. And please speak in a clear and natural voice. And dont use vouvoiement.`,
  });

  const reader = response.body?.getReader();
  if (!reader) throw new Error("reader is null");

  let buffer = new Uint8Array();
  const allChunks: Uint8Array[] = [];

  const chunkSize = MINIMAL_CHUNK_SIZE;

  while (true) {
    const { done, value } = await reader.read();
    if (done || !value) break;

    allChunks.push(value);

    // Ajoute au tampon de streaming
    const combined = new Uint8Array(buffer.length + value.length);
    combined.set(buffer);
    combined.set(value, buffer.length);
    buffer = combined;

    // Envoie par tranches de 12k
    while (buffer.length >= chunkSize) {
      const chunkToSend = buffer.slice(0, chunkSize);
      connection.send(chunkToSend.buffer);
      buffer = buffer.slice(chunkSize);
    }
  }

  // Envoie le reste si présent
  if (buffer.length > 0) {
    connection.send(buffer.buffer);
  }

  // Concatène tous les chunks pour R2
  const totalLength = allChunks.reduce((sum, b) => sum + b.length, 0);
  const fullData = new Uint8Array(totalLength);
  let offset = 0;
  for (const b of allChunks) {
    fullData.set(b, offset);
    offset += b.length;
  }

  // Upload vers R2
  // const wav = pcmToWav(fullData);
  // const key = `speech-${Date.now()}.wav`;
  // await env.R2.put(key, wav);

  // console.log(`Uploaded to R2: ${key}`);
};

function pcmToWav(pcm: Uint8Array): Uint8Array {
  const wav = new Uint8Array(44 + pcm.length);
  const view = new DataView(wav.buffer);

  // RIFF header
  writeStr(wav, 0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  writeStr(wav, 8, "WAVE");

  // fmt chunk
  writeStr(wav, 12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // audio format = PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 24000, true); // sample rate
  view.setUint32(28, 24000 * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  // data chunk
  writeStr(wav, 36, "data");
  view.setUint32(40, pcm.length, true);
  wav.set(pcm, 44);

  return wav;
}

function writeStr(buf: Uint8Array, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    buf[offset + i] = str.charCodeAt(i);
  }
}
