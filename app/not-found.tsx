import Link from "next/link";

export default function NotFound() {
  return (
    <main className="app-bg flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center text-ink">
      <div className="glass ring-accent max-w-md rounded-2xl border border-line p-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-soft">404</p>
        <h1 className="mt-2 font-serif text-[32px] leading-tight text-ink">Page not found</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          The page you requested does not exist in this workspace.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-soft"
        >
          Back to Anu
        </Link>
      </div>
    </main>
  );
}
