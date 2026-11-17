// These packages ship without types, and they are only reached through dynamic
// imports inside lib/extract.ts, so a loose declaration is enough.

declare module "pdfjs-dist/legacy/build/pdf.mjs";
declare module "mammoth/mammoth.browser";
