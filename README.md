# 🤖 AI Conversation

The goal is to build a fully backend-based AI conversational system, allowing any device (also with low resources) to connect via WebSocket and initiate a conversation with the AI just by sending and receiving audio chunks and benefits from the functionalities of the system e.g. conversation history, LLM power, low-latency streaming, cost-effectiveness, cost tracking by user, etc.

## Features

- 🎙️ Your voice is captured by your browser.
- ⚡️ Real-time streaming (responses and microphone), audio chunks are sent from the backend to the browser.
- The models used are powered by Cloudflare and OpenAI.
- ✍️ Transcribe: Automatic speech recognition (ASR) is used to transcribe the audio.
- 🤔 Think: The text is sent to an LLM (like Llama or GPT) for processing.
- 🗣️ Synthesize: The AI's text response is turned back into speech using the OpenAI TTS API.
- ⬅️ Return: The generated audio is streamed back to your browser for playback by sending audio chunks to the backend.

## Future features

- 📝 Chat history: Need to store the chat history in the backend. Making RAG classification for performance.
- Need to check the models from Cloudflare to check performances. Take all the models and sent them the same sentence and check the performances. Then see models from Azure, Deepgram (Speech), ElevenLabs (expensive !!), LiveKit (ChatGPT system)
- ➡️ Stream: Need to send chunks of the microphone to the backend. (Actually the whole audio is sent). Need to make some VAD in backend or device (depending on hardware). So sentence by sentece will be transcribed by the IA model and then TTS will be called.
  Need to make some tests, to check if the AI need the whole text to have the good mood in the voice.
- 🔄 Interrupt: Jump in anytime! The system handles interruptions gracefully.
- Wake up word: like "Hey Google".

## Old features from cloudflare agents starter

<!-- - 🛠️ Built-in tool system with human-in-the-loop confirmation -->
<!-- - 📅 Advanced task scheduling (one-time, delayed, and recurring via cron) -->
<!-- - 🔄 State management and chat history -->

## Prerequisites

- Cloudflare account
- OpenAI API key

## Quick Start

1. Templated downloaded using the Cloudflare CLI:

```bash
npm create cloudflare@latest --template cloudflare/agents-starter
```

2. Install dependencies:

```bash
pnpm install
```

3. Set up your environment:

Create a `.dev.vars` file:

```env
OPENAI_API_KEY=your_openai_api_key
```

4. Run locally:

```bash
pnpm start
```

5. Deploy:

```bash
pnpm run deploy
```

## Learn More

- [`agents`](https://github.com/cloudflare/agents/blob/main/packages/agents/README.md)
- [Cloudflare Agents Documentation](https://developers.cloudflare.com/agents/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Open AI speech to text code](https://github.com/openai/openai-node/blob/5bb454391f34c6c0d9e8b3b22d0e407c31641bfa/examples/audio.ts#L33)
