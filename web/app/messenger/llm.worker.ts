// Runs the on-device language model in a Web Worker, so reading a message never freezes the screen.
// The page talks to it through WebLLM's worker engine (see localMind.ts). Nothing here touches the network
// except the one-time download of the model's weights, which are then kept in this site's private storage.
import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => handler.onmessage(msg);
