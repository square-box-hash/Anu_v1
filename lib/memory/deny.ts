/**
 * Plain code, before any model sees the line: a secret that reaches a draft
 * would reach a prompt and then a database, so it is dropped here instead.
 * The log records that a line was dropped and why — never its content.
 */
const PATTERNS: { name: string; re: RegExp }[] = [
  {
    name: "an api key or token",
    re: /\b(sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{30,}|tvly-[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})\b/,
  },
  { name: "a private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "a password", re: /\b(pass(word|wd|phrase)?|pwd|secret)\s*[:=]\s*\S{6,}/i },
  { name: "a payment card number", re: /\b(?:\d[ -]?){13,19}\b/ },
  { name: "a government id number", re: /\b(\d{4}\s?\d{4}\s?\d{4}|[A-Z]{5}\d{4}[A-Z])\b/ },
  { name: "a bank account number", re: /\b(account|a\/c|ifsc)\b[^.\n]{0,20}\d{6,18}\b/i },
];

/** Returns why a line must not be stored, or null when it is safe. */
export function denialFor(text: string): string | null {
  for (const pattern of PATTERNS) {
    if (pattern.re.test(text)) return pattern.name;
  }
  return null;
}
