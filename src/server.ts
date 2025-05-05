import {
  Agent,
  routeAgentRequest,
  type Connection,
  type Schedule,
  type WSMessage,
} from "agents";

import { unstable_getSchedulePrompt } from "agents/schedule";

import { AIChatAgent } from "agents/ai-chat-agent";
import {
  createDataStreamResponse,
  generateId,
  streamText,
  generateText,
  type StreamTextOnFinishCallback,
  experimental_generateSpeech,
  type ToolSet,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { processToolCalls } from "./utils";
import { tools, executions } from "./tools";
// import { env } from "cloudflare:workers";
import OpenAI from "openai";

import { voice } from "./media/voice";
import { voice1secetdemi } from "./media/voice1sectdemi";
import type { Readable } from "stream";

const model = openai("gpt-3.5-turbo");
const ttsModel = openai("");
// Cloudflare AI Gateway
// const openai = createOpenAI({
//   apiKey: env.OPENAI_API_KEY,
//   baseURL: env.GATEWAY_BASE_URL,
// });

/**
 * Chat Agent implementation that handles real-time AI chat interactions
 */
export class Chat extends Agent<Env> {
  // onStart() {
  //   this.conversationalAiMain();
  // }

  async onMessage(connection: Connection, message: WSMessage): Promise<void> {
    const audio = await this.conversationalAiMain(connection);

    // connection.send(
    //   JSON.stringify({ answer: audio.answer.text, time: audio.time })
    // );

    return;
  }

  /**
   * Handles incoming chat messages and manages the response stream
   * @param onFinish - Callback function executed when streaming completes
   */
  //   async onChatMessage(
  //     onFinish: StreamTextOnFinishCallback<ToolSet>,
  //     options?: { abortSignal?: AbortSignal }
  //   ) {
  //     if (this.messages[this.messages.length - 1].content.includes("15 500")) {
  //       const dataStreamRes = createDataStreamResponse({
  //         execute: async (dataStream) => {
  //           const audio = await this.conversationalAiMain();

  //           for (const char of audio.text) {
  //             // dataStream.writeData(char);
  //             dataStream.writeData({ response: char });

  //             // await new Promise((r) => setTimeout(r, 50)); // simule un stream progressif
  //           }
  //         },
  //       });
  //       return dataStreamRes;
  //     }

  //     const allTools = {
  //       ...tools,
  //       ...this.mcp.unstable_getAITools(),
  //     };

  //     // Create a streaming response that handles both text and tool outputs
  //     const dataStreamResponse = createDataStreamResponse({
  //       execute: async (dataStream) => {
  //         // Process any pending tool calls from previous messages
  //         // This handles human-in-the-loop confirmations for tools
  //         // const processedMessages = await processToolCalls({
  //         //   // messages: this.messages,

  //         //   dataStream,
  //         //   tools: allTools,
  //         //   executions,
  //         // });

  //         // Stream the AI response using GPT-4
  //         const result = streamText({
  //           model,
  //           system: `You are a helpful assistant that can do various tasks...

  // ${unstable_getSchedulePrompt({ date: new Date() })}

  // If the user asks to schedule a task, use the schedule tool to schedule the task.
  // `,
  //           // messages: processedMessages,
  //           tools: allTools,
  //           onFinish: async (args) => {
  //             onFinish(
  //               args as Parameters<StreamTextOnFinishCallback<ToolSet>>[0]
  //             );
  //           },
  //           onError: (error) => {
  //             console.error("Error while streaming:", error);
  //           },
  //           maxSteps: 10,
  //         });

  //         // Merge the AI response stream with tool execution outputs
  //         result.mergeIntoDataStream(dataStream);
  //       },
  //     });

  //     return dataStreamResponse;
  //   }

  async executeTask(description: string, task: Schedule<string>) {
    // await this.saveMessages([
    //   ...this.messages,
    //   {
    //     id: generateId(),
    //     role: "user",
    //     content: `Running scheduled task: ${description}`,
    //     createdAt: new Date(),
    //   },
    // ]);
  }

  async conversationalAiMain(connection: Connection) {
    const voiceBase64 = voice1secetdemi;

    const startTimeWhisper = performance.now();

    const whisperResult = await this.env.AI.run(
      "@cf/openai/whisper-large-v3-turbo",
      {
        audio: voiceBase64,
        language: "fr",
      }
    );

    const endTimeWhisper = performance.now();

    console.log(
      `Whisper took ${endTimeWhisper - startTimeWhisper} milliseconds`
    );

    const startTimeAi = performance.now();

    const llmAnswer = await generateText({
      model,
      prompt: whisperResult.text,
    });

    const endTimeAi = performance.now();

    console.log(`AI took ${endTimeAi - startTimeAi} milliseconds`);
    // console.log(llmAnswer);

    const startTimeTts = performance.now();

    const tts = await textToSpeech(llmAnswer.text, connection);

    const endTimeTts = performance.now();

    console.log(`TTS took ${endTimeTts - startTimeTts} milliseconds`);

    return {
      answer: llmAnswer,
      time: endTimeTts - startTimeWhisper,
    };
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return (
      // Route the request to our agent or return 404 if not found
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const textToSpeech = async (text: string, connection: Connection) => {
  const response = await client.audio.speech.create({
    model: "gpt-4o-mini-tts",
    input: text,
    voice: "alloy",
    response_format: "pcm",
    instructions:
      "Please speak for a children of 5 years old. And please speak in a clear and natural voice. And dont use vouvoiement",
  });

  const reader = response.body.getReader();
  let buffer = new Uint8Array();

  while (true) {
    const { done, value } = await reader.read();
    if (done || !value) break;

    // Concatène le nouveau chunk
    const combined = new Uint8Array(buffer.length + value.length);
    combined.set(buffer);
    combined.set(value, buffer.length);
    buffer = combined;

    // 500ms = 24000 samples = 48000 bytes (16-bit mono)
    const chunkSize = 12000; // 250 ms = 12,000 octets (mono, 16-bit, 24000 Hz)

    while (buffer.length >= chunkSize) {
      const chunkToSend = buffer.slice(0, chunkSize);
      connection.send(chunkToSend.buffer);
      buffer = buffer.slice(chunkSize);
    }
  }

  // Envoie les restes s’il en reste
  if (buffer.length > 0) {
    connection.send(buffer.buffer);
  }
};

function createWavChunk(pcm: Uint8Array, sampleRate = 24000, numChannels = 1) {
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const wavSize = 44 + pcm.length;
  const buffer = new Uint8Array(wavSize);
  const view = new DataView(buffer.buffer);

  // RIFF header
  writeString(buffer, 0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true); // file length
  writeString(buffer, 8, "WAVE");

  // fmt chunk
  writeString(buffer, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample

  // data chunk
  writeString(buffer, 36, "data");
  view.setUint32(40, pcm.length, true);
  buffer.set(pcm, 44);

  return buffer;
}

function writeString(view: Uint8Array, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view[offset + i] = str.charCodeAt(i);
  }
}
