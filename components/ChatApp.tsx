"use client";

import React, { useEffect, useRef, useState } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { StoreProvider, useStore } from "@/lib/store";
import { ThemeProvider } from "@/lib/theme";
import AccountModal from "./AccountModal";
import AuthScreen from "./AuthScreen";
import ChatView from "./ChatView";
import Logo from "./Logo";
import Rail, { initialsFor } from "./Rail";
import type { Section } from "./Rail";
import type { PanelTab } from "./RightPanel";
import PanelModal from "./PanelModal";
import Sidebar from "./Sidebar";
import { PanelLeft } from "./Icons";
import { cx } from "@/lib/utils";

function Workspace() {
  const store = useStore();
  const { user } = useAuth();
  // null = no panel open; the sidebar always shows the chat list now.
  const [panelTab, setPanelTab] = useState<PanelTab | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPanelTab(null);
        store.createChat();
      }
      if (meta && e.key.toLowerCase() === "b") {
        e.preventDefault();
        // Desktop: collapse the side panel. Narrow screens: the drawer.
        if (window.innerWidth >= 1024) setPanelOpen((open) => !open);
        else setSidebarOpen((open) => !open);
      }
      if (e.key === "Escape") {
        setSidebarOpen(false);
        setAccountOpen(false);
        setPanelTab(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  const displayName = user?.displayName || user?.email?.split("@")[0] || "Account";
  const initials = initialsFor(displayName);

  const rail = (
    <Rail
      section={panelTab ?? "chats"}
      onSection={(next) => {
        if (next === "chats") {
          setPanelTab(null);
          if (typeof window !== "undefined" && window.innerWidth < 1024) setSidebarOpen(true);
          return;
        }
        setPanelTab(next);
        setSidebarOpen(false);
      }}
      onOpenAccount={() => setAccountOpen(true)}
      initials={initials}
      hasPhoto={Boolean(user?.photoURL)}
      photoUrl={user?.photoURL}
    />
  );

  return (
    <>
      {/* desktop: rail + panel, chat to the right */}
      <div className="relative z-10 hidden lg:flex">
        {rail}
        {panelOpen ? (
          <Sidebar
            onSection={(next) => setPanelTab(next === "chats" ? null : next)}
            onCollapse={() => setPanelOpen(false)}
          />
        ) : (
          <div className="flex h-full w-[46px] shrink-0 flex-col items-center border-r border-line bg-soft/60 py-3">
            <button
              onClick={() => setPanelOpen(true)}
              title="Show panel (⌘B)"
              aria-label="Show panel"
              className="rounded-md p-1.5 text-muted transition-colors hover:bg-hover hover:text-ink"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* mobile / tablet drawer */}
      <div
        className={cx(
          "fixed inset-0 z-40 lg:hidden",
          sidebarOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <div
          onClick={() => setSidebarOpen(false)}
          className={cx(
            "absolute inset-0 bg-scrim backdrop-blur-sm transition-opacity",
            sidebarOpen ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          className={cx(
            "absolute inset-y-0 left-0 z-50 flex transition-transform duration-300",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {rail}
          <Sidebar
            onSection={(next) => {
              setPanelTab(next === "chats" ? null : next);
              setSidebarOpen(false);
            }}
            onClose={() => setSidebarOpen(false)}
          />
        </div>
      </div>

      <div className="relative z-10 flex min-w-0 flex-1">
        <ChatView
          onOpenSidebar={() => setSidebarOpen(true)}
          onOpenSection={(next) => setPanelTab(next)}
        />
      </div>

      {panelTab && (
        <PanelModal tab={panelTab} onTab={setPanelTab} onClose={() => setPanelTab(null)} />
      )}

      {accountOpen && <AccountModal onClose={() => setAccountOpen(false)} />}
    </>
  );
}

function AuthGate() {
  const { user, ready } = useAuth();
  const spotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = spotRef.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      el.style.setProperty("--mx", `${e.clientX}px`);
      el.style.setProperty("--my", `${e.clientY}px`);
      el.style.opacity = "1";
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  return (
    <div className="app-bg relative flex h-[100dvh] w-full overflow-hidden">
      <div ref={spotRef} className="spotlight pointer-events-none fixed inset-0 z-0 opacity-0" />
      <div className="pointer-events-none absolute inset-0 grid-overlay opacity-60" />

      {!ready ? (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-3">
          <Logo className="h-11 w-11 animate-pulse" />
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">Loading workspace…</p>
        </div>
      ) : !user ? (
        <div className="relative z-10 flex-1 overflow-y-auto">
          <AuthScreen />
        </div>
      ) : (
        <StoreProvider>
          <Workspace />
        </StoreProvider>
      )}
    </div>
  );
}

export default function ChatApp() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ThemeProvider>
  );
}
