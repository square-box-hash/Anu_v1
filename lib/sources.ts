import type { ToolCall } from "./types";

export interface Source {
  n: number;
  url: string;
  title: string;
  domain: string;
  date?: string;
  /** The id the tool itself gave the row, when it gave one (Tavily does). */
  id?: string;
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
        const rawId = r.id ?? r.chunk_id ?? r.source_id;
        out.push({
          url: r.url,
          title: String(r.title ?? domainOf(r.url)),
          domain: domainOf(r.url),
          date: (r.published_date ?? r.publishedDate) as string | undefined,
          ...(typeof rawId === "string" ? { id: rawId } : {}),
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
  const byNumber = new Map(sources.map((source) => [source.n, source]));
  const byId = new Map(
    sources.filter((source) => source.id).map((source) => [source.id as string, source]),
  );
  const cited = new Set<number>();

  const resolve = (token: string): Source | undefined => {
    const clean = token.trim();
    if (/^\d{1,2}$/.test(clean)) return byNumber.get(Number(clean));
    return byId.get(clean) ?? byId.get(clean.toLowerCase());
  };

  const out = text.replace(/\s?\[([^\[\]\n]{1,60})\](?!\()/g, (match, inner: string) => {
    const tokens = inner.split(",").map((token) => token.trim()).filter(Boolean);
    // Only treat it as a citation if every token looks like an id the tool gave.
    const looksLikeId =
      tokens.length > 0 &&
      tokens.every((token) => /^\d{1,2}$/.test(token) || /^[A-Za-z0-9][A-Za-z0-9_-]{1,40}$/.test(token));
    if (!looksLikeId) return match;

    const found = tokens.map(resolve).filter((source): source is Source => Boolean(source));
    if (!found.length) return "";

    return found
      .map((source) => {
        cited.add(source.n);
        const label = `${source.title} (${source.domain})`.replace(/["\[\]]/g, "'");
        return `[${source.n}](${source.url} "src:${label}")`;
      })
      .join("");
  });

  return { text: out, cited: sources.filter((source) => cited.has(source.n)) };
}
