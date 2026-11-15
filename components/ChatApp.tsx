"use client";

import React, { useEffect, useRef, useState } from "react";
import { StoreProvider, useStore } from "@/lib/store";
import ChatView from "./ChatView";
import Sidebar from "./Sidebar";
import RightPanel from "./RightPanel";
import type { PanelTab } from "./RightPanel";
import { cx } from "@/lib/utils";

function Workspace() {
  const store = useStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [tab, setTab] = useState<PanelTab>("skills");

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        store.createChat();
      }
      if (meta && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setPanelOpen((p) => !p);
      }
      if (e.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  return (
    <div className="app-bg relative flex h-[100dvh] w-full overflow-hidden">
      <div ref={spotRef} className="spotlight pointer-events-none fixed inset-0 z-0 opacity-0" />
      <div className="pointer-events-none absolute inset-0 grid-overlay opacity-60" />

      {/* desktop sidebar */}
      <div className="relative z-10 hidden lg:block">
        <Sidebar onOpenSettings={() => { setTab("settings"); setPanelOpen(true); }} />
      </div>

      {/* mobile sidebar */}
      <div
        className={cx(
          "fixed inset-0 z-40 lg:hidden",
          sidebarOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <div
          onClick={() => setSidebarOpen(false)}
          className={cx(
            "absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity",
            sidebarOpen ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          className={cx(
            "absolute inset-y-0 left-0 z-50 transition-transform duration-300",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <Sidebar
            onClose={() => setSidebarOpen(false)}
            onOpenSettings={() => {
              setTab("settings");
              setPanelOpen(true);
              setSidebarOpen(false);
            }}
          />
        </div>
      </div>

      <div className="relative z-10 flex min-w-0 flex-1">
        <ChatView
          onOpenSidebar={() => setSidebarOpen(true)}
          onTogglePanel={() => setPanelOpen((p) => !p)}
          panelOpen={panelOpen}
          onOpenSettings={() => {
            setTab("settings");
            setPanelOpen(true);
          }}
          onOpenPanelTab={(t) => {
            setTab(t);
            setPanelOpen(true);
          }}
        />

        {/* desktop panel */}
        {panelOpen && (
          <div className="hidden xl:block">
            <RightPanel tab={tab} onTabChange={setTab} onClose={() => setPanelOpen(false)} />
          </div>
        )}
      </div>

      {/* mobile / tablet panel drawer */}
      <div className={cx("fixed inset-0 z-40 xl:hidden", panelOpen ? "pointer-events-auto" : "pointer-events-none")}>
        <div
          onClick={() => setPanelOpen(false)}
          className={cx(
            "absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity",
            panelOpen ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          className={cx(
            "absolute inset-y-0 right-0 z-50 transition-transform duration-300",
            panelOpen ? "translate-x-0" : "translate-x-full",
          )}
        >
          <RightPanel tab={tab} onTabChange={setTab} onClose={() => setPanelOpen(false)} />
        </div>
      </div>
    </div>
  );
}

export default function ChatApp() {
  return (
    <StoreProvider>
      <Workspace />
    </StoreProvider>
  );
}
