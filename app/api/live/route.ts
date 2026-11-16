import { Modality } from "@google/genai";
import type { LiveServerMessage } from "@google/genai";
import { NextResponse } from "next/server";
import { getGeminiClient } from "@/lib/providers/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LiveTurnBody {
  mode: "voice" | "translate";
  audioBase64: string;
  targetLanguageCode?: string;
  systemPrompt?: string;
}

type LiveStreamEvent =
  | { type: "audio"; data: string }
  | { type: "input_transcript"; text: string }
  | { type: "output_transcript"; text: string }
  | { type: "text"; text: string }
  | { type: "error"; text: string };

/**
 * Server-side Live API audio turn bridge for gemini-3.8-live & gemini-3.5-live-translate-preview.
 * Accepts 16kHz base64 PCM audio and streams back 24kHz PCM audio + transcripts as NDJSON.
 */
export async function POST(req: Request) {
  let body: LiveTurnBody;
  try {
    body = (await req.json()) as LiveTurnBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.audioBase64) {
    return NextResponse.json({ error: "audioBase64 (16kHz PCM) is required" }, { status: 400 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY is not set on the server." }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const isTranslate = body.mode === "translate";
  const model = isTranslate ? "gemini-3.5-live-translate-preview" : "gemini-3.8-live";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (evt: LiveStreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(evt)}\n`));
      let settled = false;
      let session: Awaited<ReturnType<ReturnType<typeof getGeminiClient>["live"]["connect"]>> | null = null;
      let resolveDone: (() => void) | null = null;
      const donePromise = new Promise<void>((resolve) => {
        resolveDone = resolve;
      });

      const finish = () => {
        if (settled) return;
        settled = true;
        try {
          session?.close();
        } catch {
          /* ignore */
        }
        resolveDone?.();
      };

      const timeout = setTimeout(finish, 25_000);

      try {
        const ai = getGeminiClient();
        // Follow live_api.md strictly:
        // - gemini-3.5-live-translate-preview must NOT receive systemInstruction or tools.
        const config = isTranslate
          ? {
              responseModalities: [Modality.AUDIO],
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              translationConfig: {
                targetLanguageCode: body.targetLanguageCode || "es",
                echoTargetLanguage: false,
              },
            }
          : {
              responseModalities: [Modality.AUDIO],
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
              },
              systemInstruction:
                body.systemPrompt?.trim() || "You are Anu, a concise, friendly real-time voice assistant.",
            };

        session = await ai.live.connect({
          model,
          config,
          callbacks: {
            onmessage: (message: LiveServerMessage) => {
              const content = message.serverContent;
              if (content?.inputTranscription?.text) {
                send({ type: "input_transcript", text: content.inputTranscription.text });
              }
              if (content?.outputTranscription?.text) {
                send({ type: "output_transcript", text: content.outputTranscription.text });
              }
              for (const part of content?.modelTurn?.parts ?? []) {
                if (part.inlineData?.data) {
                  send({ type: "audio", data: part.inlineData.data });
                } else if (part.text) {
                  send({ type: "text", text: part.text });
                }
              }
              if (content?.turnComplete) {
                finish();
              }
            },
            onerror: (err) => {
              send({ type: "error", text: err?.message || "Live session error" });
              finish();
            },
            onclose: () => {
              finish();
            },
          },
        });

        session.sendRealtimeInput({
          audio: { data: body.audioBase64, mimeType: "audio/pcm;rate=16000" },
        });
        session.sendRealtimeInput({ audioStreamEnd: true });

        await donePromise;
      } catch (err) {
        send({ type: "error", text: err instanceof Error ? err.message : "Live API call failed" });
      } finally {
        clearTimeout(timeout);
        finish();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
