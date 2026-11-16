import React from "react";

type P = { className?: string };

const S = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className ?? "h-4 w-4"}
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const Plus = (p: P) => <S {...p}><path d="M12 5v14M5 12h14" /></S>;
export const Search = (p: P) => <S {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></S>;
export const Trash = (p: P) => <S {...p}><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /></S>;
export const Pencil = (p: P) => <S {...p}><path d="M4 20h4l10-10-4-4L4 16v4Z" /><path d="m14 6 4 4" /></S>;
export const Paperclip = (p: P) => <S {...p}><path d="M20 11.5 12 19.5a4.5 4.5 0 0 1-6.4-6.4l7.4-7.4a3 3 0 0 1 4.3 4.3l-7.4 7.4a1.5 1.5 0 0 1-2.2-2.1l6.7-6.7" /></S>;
export const ArrowRight = (p: P) => <S {...p}><path d="M4 12h15M13 5l7 7-7 7" /></S>;
export const Send = (p: P) => <S {...p}><path d="M12 19V5M5 12l7-7 7 7" /></S>;
export const Stop = (p: P) => <S {...p}><rect x="6" y="6" width="12" height="12" rx="2" /></S>;
export const Sparkles = (p: P) => <S {...p}><path d="M12 3l1.8 4.6L18.5 9.5 13.8 11.4 12 16l-1.8-4.6L5.5 9.5l4.7-1.9L12 3Z" /><path d="M18 16.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z" /></S>;
export const Plug = (p: P) => <S {...p}><path d="M9 3v6M15 3v6" /><path d="M6 9h12v2a6 6 0 0 1-6 6 6 6 0 0 1-6-6V9Z" /><path d="M12 17v4" /></S>;
export const Terminal = (p: P) => <S {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3M13 15h4" /></S>;
export const Chevron = (p: P) => <S {...p}><path d="m6 9 6 6 6-6" /></S>;
export const X = (p: P) => <S {...p}><path d="M6 6l12 12M18 6 6 18" /></S>;
export const Check = (p: P) => <S {...p}><path d="m5 13 4 4L19 7" /></S>;
export const Copy = (p: P) => <S {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 5H6a2 2 0 0 0-2 2v9" /></S>;
export const PanelRight = (p: P) => <S {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></S>;
export const Menu = (p: P) => <S {...p}><path d="M4 7h16M4 12h16M4 17h16" /></S>;
export const File = (p: P) => <S {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" /></S>;
export const Image = (p: P) => <S {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m4 18 5-5 4 4 3-3 4 4" /></S>;
export const Bolt = (p: P) => <S {...p}><path d="M13 3 5 14h5l-1 7 8-11h-5l1-7Z" /></S>;
export const Settings = (p: P) => <S {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.5-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.6a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4Z" /></S>;
export const Bot = (p: P) => <S {...p}><rect x="4" y="7" width="16" height="12" rx="3" /><path d="M12 3v4M9 13h.01M15 13h.01M9.5 16.5h5" /></S>;
export const Layers = (p: P) => <S {...p}><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></S>;
export const Link = (p: P) => <S {...p}><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" /></S>;
export const Refresh = (p: P) => <S {...p}><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 21v-5h5" /></S>;
export const Globe = (p: P) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></S>;
export const Database = (p: P) => <S {...p}><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></S>;
export const LogOut = (p: P) => <S {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></S>;
export const Mail = (p: P) => <S {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></S>;
export const Lock = (p: P) => <S {...p}><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></S>;
export const Eye = (p: P) => <S {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></S>;
export const EyeOff = (p: P) => <S {...p}><path d="M17.9 17.9A10.1 10.1 0 0 1 12 19c-6.5 0-10-7-10-7a18.5 18.5 0 0 1 5.1-5.9M9.9 4.2A9.1 9.1 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-2.2 3.2" /><path d="m3 3 18 18" /></S>;
export const UserIcon = (p: P) => <S {...p}><circle cx="12" cy="8" r="4" /><path d="M4 20c0-3.5 3.6-6 8-6s8 2.5 8 6" /></S>;
export const ShieldCheck = (p: P) => <S {...p}><path d="M12 3 4 6v6c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></S>;
export const Download = (p: P) => <S {...p}><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></S>;
export const GitHub = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={p.className ?? "h-4 w-4"} aria-hidden="true">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z"
    />
  </svg>
);
export const Mic = (p: P) => <S {...p}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" /></S>;
export const MicOff = (p: P) => <S {...p}><path d="m2 2 20 20M9 9v3a3 3 0 0 0 5.1 2.1M15 9V5a3 3 0 0 0-5.7-1.3M17 16.9A7 7 0 0 1 5 12v-2M19 10v2a7 7 0 0 1-.1 1.2M12 19v3M8 22h8" /></S>;
export const Volume2 = (p: P) => <S {...p}><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /></S>;
export const Languages = (p: P) => <S {...p}><path d="m5 8 6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6" /></S>;
export const Cpu = (p: P) => <S {...p}><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 1v5M15 1v5M9 18v5M15 18v5M1 9h5M1 15h5M18 9h5M18 15h5" /></S>;
export const Sliders = (p: P) => <S {...p}><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M2 14h4M10 8h4M18 16h4" /></S>;
