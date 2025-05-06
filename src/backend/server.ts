import {
  Agent,
  routeAgentRequest,
  type Connection,
  type WSMessage,
} from "agents";

import OpenAI from "openai";
import { MINIMAL_CHUNK_SIZE } from "./ttsUtils";

export class Chat extends Agent<Env> {
  async onMessage(connection: Connection, message: WSMessage): Promise<void> {
    if (typeof message === "string") return;

    const chunk = new Uint8Array(message as any);

    const audio = await this.conversationalAiMain(connection, chunk);

    if (!audio) return;

    connection.send(
      JSON.stringify({
        transcription: audio.transcription,
        answer: audio.answer,
        time: audio.time,
      })
    );

    return;
  }

  async conversationalAiMain(
    connection: Connection,
    userMicrophoneAudio: Uint8Array<ArrayBuffer>
  ) {
    const voiceBase64 = Buffer.from(userMicrophoneAudio).toString("base64");

    const transcription = await this.env.AI.run(
      "@cf/openai/whisper-large-v3-turbo",
      {
        audio: voiceBase64,
      }
    );

    const llmAnswer = await this.env.AI.run("@cf/meta/llama-3.2-3b-instruct", {
      messages: [
        {
          role: "system",
          content: "أجب مباشرة باللغة العربية فقط.",
        },
        {
          role: "user",
          content: "bonjour comment tu vas ?",
        },
      ],
    });

    if (!("response" in llmAnswer)) return;

    const answer = llmAnswer.response as string;
    await textToSpeech(answer, connection, this.env);

    return {
      answer: answer,
      time: "undefined",
      transcription: transcription.text,
    };
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

  while (true) {
    const { done, value } = await reader.read();
    if (done || !value) break;

    // Ajoute au tampon de streaming
    const combined = new Uint8Array(buffer.length + value.length);
    combined.set(buffer);
    combined.set(value, buffer.length);
    buffer = combined;

    // Envoie par chunks
    while (buffer.length >= MINIMAL_CHUNK_SIZE) {
      const chunkToSend = buffer.slice(0, MINIMAL_CHUNK_SIZE);
      connection.send(chunkToSend.buffer);
      buffer = buffer.slice(MINIMAL_CHUNK_SIZE);
    }
  }

  // Envoie le reste si présent
  if (buffer.length > 0) {
    connection.send(buffer.buffer);
  }
};
