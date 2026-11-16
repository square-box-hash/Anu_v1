"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Read-aloud built on the Web Speech API, which every modern browser ships and
 * which costs nothing and sends no text off the device. That is the right
 * default for a local-first workspace: no key, no quota, works offline once the
 * voices are installed. A hosted engine (Google Cloud TTS, or a local Kokoro
 * build) can drop in later behind this same hook — swap the `speak` body.
 */

/** Markdown and code are unreadable out loud, so strip to plain prose first. */
export function stripForSpeech(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " (code block) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/\$\$?([^$]+)\$\$?/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*\|.*\|\s*$/gm, " ")
    .replace(/^\s*[-—–]{3,}\s*$/gm, " ")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Long utterances get cut off in Chrome, so speak in sentence-sized pieces. */
function chunk(text: string, limit = 190): string[] {
  const sentences = text.split(/(?<=[.!?;:])\s+/);
  const out: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (!sentence) continue;
    if (current.length + sentence.length + 1 <= limit) {
      current = current ? `${current} ${sentence}` : sentence;
      continue;
    }
    if (current) out.push(current);
    if (sentence.length <= limit) {
      current = sentence;
      continue;
    }
    // A single monster sentence: break it on whitespace.
    let rest = sentence;
    while (rest.length > limit) {
      const cut = rest.lastIndexOf(" ", limit);
      const at = cut > 40 ? cut : limit;
      out.push(rest.slice(0, at));
      rest = rest.slice(at).trimStart();
    }
    current = rest;
  }
  if (current) out.push(current);
  return out.filter(Boolean);
}

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  if (!voices.length) return undefined;
  const ranked = [
    (v: SpeechSynthesisVoice) => v.lang === "en-IN",
    (v: SpeechSynthesisVoice) => v.lang === "en-GB" && /female|natural|google/i.test(v.name),
    (v: SpeechSynthesisVoice) => v.lang === "en-US" && /natural|google|samantha/i.test(v.name),
    (v: SpeechSynthesisVoice) => v.lang.startsWith("en"),
    () => true,
  ];
  for (const test of ranked) {
    const hit = voices.find(test);
    if (hit) return hit;
  }
  return voices[0];
}

export interface SpeechController {
  /** Id of the message currently being read, or null. */
  speakingId: string | null;
  supported: boolean;
  speak: (id: string, text: string) => void;
  stop: () => void;
}

export function useSpeech(): SpeechController {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setSupported(true);

    const load = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingId(null);
  }, []);

  const speak = useCallback(
    (id: string, text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const synth = window.speechSynthesis;
      synth.cancel();

      const clean = stripForSpeech(text);
      if (!clean) return;

      if (!voicesRef.current.length) voicesRef.current = synth.getVoices();
      const voice = pickVoice(voicesRef.current);
      const parts = chunk(clean);

      setSpeakingId(id);
      parts.forEach((part, index) => {
        const utterance = new SpeechSynthesisUtterance(part);
        utterance.rate = 1.02;
        utterance.pitch = 1;
        if (voice) {
          utterance.voice = voice;
          utterance.lang = voice.lang;
        }
        if (index === parts.length - 1) {
          utterance.onend = () => setSpeakingId((current) => (current === id ? null : current));
        }
        utterance.onerror = () => setSpeakingId((current) => (current === id ? null : current));
        synth.speak(utterance);
      });
    },
    [],
  );

  return { speakingId, supported, speak, stop };
}
