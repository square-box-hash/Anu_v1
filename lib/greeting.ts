import { greetingFor } from "./utils";

export type DayPart = "early" | "morning" | "afternoon" | "evening" | "night";

export function dayPart(now: Date = new Date()): DayPart {
  const h = now.getHours();
  if (h < 5) return "early";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  if (h < 22) return "evening";
  return "night";
}

/**
 * The line under the greeting.
 *
 * Written locally and instantly, so the landing never waits on a network call:
 * this is what shows on the first paint, and what stays if the model is
 * unavailable. The AI line replaces it when it arrives.
 */
const LOCAL_LINES: Record<DayPart, string[]> = {
  early: [
    "Still up — the quiet hours are good for hard problems.",
    "Nobody else is awake. Make it count.",
    "Night owl hours. Your future self wants you asleep, but carry on.",
  ],
  morning: [
    "Fresh start, empty context window.",
    "Morning brain, before the meetings claim it.",
    "Best hour of the day to think in a straight line.",
  ],
  afternoon: [
    "Post-lunch dip — short questions, sharp answers.",
    "Afternoon is for finishing what the morning started.",
    "Halfway through the day, and the hard part is behind you.",
  ],
  evening: [
    "Evening: good for the work that needs no interruptions.",
    "The day's noise has died down. Use it.",
    "Wrap-up hours — pick the one thing worth finishing.",
  ],
  night: [
    "Late one. Keep it to the questions that matter.",
    "Night owl mode. Nothing good happens after the fourth refactor.",
    "The small hours are honest — what are you actually trying to solve?",
  ],
};

/** Stable per day, so the line does not change on every render. */
export function localNudge(now: Date = new Date()): string {
  const part = dayPart(now);
  const lines = LOCAL_LINES[part];
  const dayIndex = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000,
  );
  return lines[dayIndex % lines.length];
}

/** One generated line per part of the day, per device. */
export function greetingCacheKey(now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return `anu.nudge.${day}.${dayPart(now)}`;
}

export interface GreetingRequest {
  name?: string;
  part: DayPart;
  weekday: string;
}

export { greetingFor };
