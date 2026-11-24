import type { ToolCall } from "./types";

export interface Source {
  n: number;
  url: string;
  title: string;
  domain: string;
  date?: string;
}

const URL_RE = /https?:\/\/[^\s)\]"'<>]+/;

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Pulls title, url and date out of one tool result (Tavily JSON or plain text). */
function parseResult(text: string): Omit<Source, "n">[] {
  const out: Omit<Source, "n">[] = [];
  try {
    const data = JSON.parse(text) as
      | { results?: unknown }
      | Array<Record<string, unknown>>
      | null;
    const rows = Array.isArray(data) ? data : data?.results;
    if (Array.isArray(rows)) {
      for (const r of rows as Array<Record<string, unknown>>) {
        if (typeof r?.url !== "string") continue;
        out.push({
          url: r.url,
          title: String(r.title ?? domainOf(r.url)),
          domain: domainOf(r.url),
          date: (r.published_date ?? r.publishedDate) as string | undefined,
        });
      }
      if (out.length) return out;
    }
  } catch {
    /* not JSON: fall through to the text parser */
  }

  for (const block of text.split(/\n\s*\n/)) {
    const url = block.match(/URL:\s*(\S+)/i)?.[1] ?? block.match(URL_RE)?.[0];
    if (!url) continue;
    const title = block.match(/Title:\s*(.+)/i)?.[1]?.trim() ?? domainOf(url);
    out.push({ url, title, domain: domainOf(url) });
  }
  return out;
}

/**
 * Numbers every distinct URL across a turn's tool results, in call order.
 * The server and the client both call this on the same (4000-char) result
 * text, so "[3]" means the same page to the model and to the reader.
 */
export function extractSources(calls: Pick<ToolCall, "ok" | "content">[]): Source[] {
  const seen = new Map<string, Source>();
  for (const call of calls) {
    if (!call.content || call.ok === false) continue;
    for (const s of parseResult(call.content)) {
      if (!seen.has(s.url)) seen.set(s.url, { ...s, n: seen.size + 1 });
    }
  }
  return [...seen.values()];
}

/**
 * Turns the model's [n] markers into links to the real URL. A marker with no
 * matching source is dropped, so the model cannot cite a page it never read.
 */
export function linkCitations(
  text: string,
  sources: Source[],
): { text: string; cited: Source[] } {
  const byN = new Map(sources.map((s) => [s.n, s]));
  const cited = new Set<number>();
  const out = text.replace(/\s?\[(\d{1,2})\](?!\()/g, (_match, num: string) => {
    const source = byN.get(Number(num));
    if (!source) return "";
    cited.add(source.n);
    const label = `${source.title} (${source.domain})`.replace(/["\[\]]/g, "'");
    return `[${source.n}](${source.url} "src:${label}")`;
  });
  return { text: out, cited: sources.filter((s) => cited.has(s.n)) };
}
