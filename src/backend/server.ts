import {
  Agent,
  routeAgentRequest,
  type Connection,
  type WSMessage,
} from "agents";

import OpenAI, { toFile } from "openai";
import { MINIMAL_CHUNK_SIZE } from "./ttsUtils";
import { callFnToCheckPerformance } from "./performanceUtils";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

const model = openai("gpt-4");

export class Chat extends Agent<Env> {
  async onMessage(connection: Connection, message: WSMessage): Promise<void> {
    if (typeof message === "string") return;

    const chunk = new Uint8Array(message as any);

    const audio = await this.conversationalAiMain(connection, chunk);

    if (!audio) return;

    // connection.send(
    //   JSON.stringify({
    //     transcription: audio.transcription,
    //     answer: audio.answer,
    //     time: audio.time,
    //   })
    // );

    return;
  }

  async conversationalAiMain(
    connection: Connection,
    userMicrophoneAudio: Uint8Array<ArrayBuffer>
  ) {
    const voiceBase64 = Buffer.from(userMicrophoneAudio).toString("base64");
    const sizeInMo = userMicrophoneAudio.byteLength / (1024 * 1024);
    console.log(`Audio size in Mo : ${sizeInMo}`);

    const buffer = new Uint8Array(userMicrophoneAudio);

    const mimeLength = buffer[0];
    const mimeTypeBytes = buffer.slice(1, 1 + mimeLength);
    const mimeType = new TextDecoder().decode(mimeTypeBytes);
    const audioData = buffer.slice(1 + mimeLength);

    const transcription = await callFnToCheckPerformance(async () => {
      const blob = new Blob([audioData]);
      const filee = new File([blob], "test", {
        lastModified: Date.now(),
        type: mimeType,
      });

      const file = await toFile(filee);
      const whisperResult = await client.audio.transcriptions.create({
        file: file,
        model: "gpt-4o-transcribe",
      });

      return whisperResult;
    });

    connection.send(
      JSON.stringify({
        transcription: transcription.result.text,
        time: transcription.time,
      })
    );

    const llmAnswer = await callFnToCheckPerformance(() =>
      this.env.AI.run("@cf/meta/llama-3.2-3b-instruct", {
        messages: [
          // {
          //   role: "system",
          //   content:
          //     "You are a helpful muslim human voice assistant, if the user ask you about something, answer to them like you are muslim. For example if he ask you if you pray, u will answer : Yes, 5 times a day",
          // },
          {
            role: "user",
            content: transcription.result.text,
          },
        ],
      })
    );

    // const llmAnswer = await callFnToCheckPerformance(() =>
    //   generateText({
    //     model,
    //     system:
    //       "You are a helpful muslim human voice assistant, answer like a human, if the user ask you about something, answer to them like you are human muslim. For example if he ask you if you pray, u will answer : Yes, 5 times a day",
    //     prompt: transcription.result.text,
    //   })
    // );

    if (!("response" in llmAnswer.result)) return;

    const answer = llmAnswer.result.response as string;

    connection.send(JSON.stringify({ answer, time: llmAnswer.time }));

    await textToSpeech(answer, connection, this.env);

    return {
      answer: answer,
      time: "undefined",
      transcription: transcription.result.text,
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
  const start = performance.now();
  const response = await client.audio.speech.create({
    model: "gpt-4o-mini-tts",
    input: text,
    voice: "alloy",
    response_format: "pcm",
    instructions: `Please speak for a children of 5 years old. And please speak in a clear and natural voice. And dont use vouvoiement.`,
  });

  const end = performance.now();

  const time = end - start;

  const reader = response.body?.getReader();
  if (!reader) throw new Error("reader is null");

  let buffer = new Uint8Array();
  let hasSentFirstChunk = false;

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
      if (!hasSentFirstChunk) {
        connection.send(
          JSON.stringify({ tts: "time for first chunk", time: time })
        );
        hasSentFirstChunk = true;
      }
      connection.send(chunkToSend.buffer);

      buffer = buffer.slice(MINIMAL_CHUNK_SIZE);
    }
  }

  // Envoie le reste si présent
  if (buffer.length > 0) {
    connection.send(buffer.buffer);
  }
};
