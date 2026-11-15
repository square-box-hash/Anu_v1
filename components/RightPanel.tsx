"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { MODELS } from "@/lib/types";
import type { McpTransport } from "@/lib/types";
import { cx } from "@/lib/utils";
import {
  Bolt,
  Check,
  Layers,
  Link,
  Plus,
  Refresh,
  Settings as SettingsIcon,
  Terminal,
  Trash,
  X,
} from "./Icons";
import { Field, SectionTitle, StatusDot, Toggle, inputClass } from "./ui";

export type PanelTab = "skills" | "connectors" | "harness" | "settings";

const TABS: { id: PanelTab; label: string; icon: React.ReactNode }[] = [
  { id: "skills", label: "Skills", icon: <Bolt className="h-3.5 w-3.5" /> },
  { id: "connectors", label: "MCP", icon: <Terminal className="h-3.5 w-3.5" /> },
  { id: "harness", label: "Harness", icon: <Layers className="h-3.5 w-3.5" /> },
  { id: "settings", label: "Config", icon: <SettingsIcon className="h-3.5 w-3.5" /> },
];

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-[11.5px] leading-relaxed text-faint">
      {children}
    </p>
  );
}

function SkillsTab() {
  const store = useStore();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  return (
    <div className="space-y-4">
      <div>
        <SectionTitle
          right={
            <span className="font-mono text-[10px] text-faint">
              {store.skills.filter((s) => s.enabled).length}/{store.skills.length}
            </span>
          }
        >
          Installed
        </SectionTitle>
        <p className="mt-1 text-[11px] leading-relaxed text-faint">
          Skills are instruction packs sent with every turn. Nothing is installed by default.
        </p>
      </div>

      {store.skills.length === 0 ? (
        <Empty>No skills yet. Add one below and it travels with your next message.</Empty>
      ) : (
        <div className="space-y-1.5">
          {store.skills.map((skill) => (
            <div
              key={skill.id}
              className={cx(
                "rounded-xl border p-2.5 transition-colors",
                skill.enabled ? "border-accent/30 bg-accent/[0.06]" : "border-line bg-white/[0.02]",
              )}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <span className="truncate text-[12.5px] font-medium text-ink">{skill.name}</span>
                  {skill.description ? (
                    <p className="mt-0.5 text-[11px] leading-relaxed text-faint">{skill.description}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => store.removeSkill(skill.id)}
                    className="rounded p-1 text-faint hover:bg-rose-500/15 hover:text-rose-300"
                    aria-label={`Remove ${skill.name}`}
                  >
                    <Trash className="h-3 w-3" />
                  </button>
                  <Toggle checked={skill.enabled} onChange={() => store.toggleSkill(skill.id)} label={skill.name} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-line bg-black/25 p-2.5">
        <SectionTitle>Add a skill</SectionTitle>
        <div className="mt-2 space-y-1.5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Skill name" className={inputClass} />
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="What should it do?"
            className={inputClass}
          />
          <button
            onClick={() => {
              store.addSkill(name, desc);
              setName("");
              setDesc("");
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent/15 py-1.5 text-[11.5px] font-medium text-accent-pale transition-colors hover:bg-accent/25"
          >
            <Plus className="h-3 w-3" />
            Install skill
          </button>
        </div>
      </div>
    </div>
  );
}

function ConnectorsTab() {
  const store = useStore();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [transport, setTransport] = useState<McpTransport>("stdio");

  return (
    <div className="space-y-4">
      <div>
        <SectionTitle
          right={
            <span className="font-mono text-[10px] text-faint">
              {store.servers.filter((s) => s.enabled).length} live
            </span>
          }
        >
          MCP servers
        </SectionTitle>
        <p className="mt-1 text-[11px] leading-relaxed text-faint">
          Model Context Protocol connectors expose tools to the model. None are connected by default.
        </p>
      </div>

      {store.servers.length === 0 ? (
        <Empty>No servers connected. Add a stdio command or an HTTP endpoint below.</Empty>
      ) : (
        <div className="space-y-1.5">
          {store.servers.map((server) => (
            <div key={server.id} className="rounded-xl border border-line bg-white/[0.02] p-2.5">
              <div className="flex items-start gap-2">
                <div className="mt-1">
                  <StatusDot status={server.enabled ? server.status : "disconnected"} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-mono text-[12px] text-ink">{server.name}</span>
                    <span className="rounded border border-line bg-black/30 px-1 font-mono text-[8.5px] uppercase tracking-wider text-muted">
                      {server.transport}
                    </span>
                  </div>
                  <p className="mt-1 truncate font-mono text-[10px] text-faint" title={server.target}>
                    {server.target}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => store.removeServer(server.id)}
                    className="rounded p-1 text-faint hover:bg-rose-500/15 hover:text-rose-300"
                    aria-label={`Remove ${server.name}`}
                  >
                    <Trash className="h-3 w-3" />
                  </button>
                  <Toggle checked={server.enabled} onChange={() => store.toggleServer(server.id)} label={server.name} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-line bg-black/25 p-2.5">
        <SectionTitle>Connect a server</SectionTitle>
        <div className="mt-2 space-y-1.5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Server name" className={inputClass} />
          <div className="flex gap-1.5">
            <select
              value={transport}
              onChange={(e) => setTransport(e.target.value as McpTransport)}
              className={cx(inputClass, "w-[92px] shrink-0")}
            >
              <option value="stdio">stdio</option>
              <option value="http">http</option>
              <option value="sse">sse</option>
            </select>
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={transport === "stdio" ? "npx -y @scope/server" : "https://host/mcp"}
              className={inputClass}
            />
          </div>
          <button
            onClick={() => {
              store.addServer({ name, transport, target });
              setName("");
              setTarget("");
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent/15 py-1.5 text-[11.5px] font-medium text-accent-pale transition-colors hover:bg-accent/25"
          >
            <Link className="h-3 w-3" />
            Connect
          </button>
        </div>
      </div>
    </div>
  );
}

function HarnessTab() {
  const store = useStore();
  const h = store.harness;
  const [reveal, setReveal] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <SectionTitle right={<StatusDot status={h.enabled ? h.status : "disconnected"} />}>
          Harness bridge
        </SectionTitle>
        <p className="mt-1 text-[11px] leading-relaxed text-faint">
          Point Anu at an agent harness endpoint so a turn can run tools and spawn subagents. Configure your own — the
          bridge sends its state with every request.
        </p>
      </div>

      <div className="space-y-2.5 rounded-xl border border-line bg-white/[0.02] p-3">
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-ink">Enable bridge</span>
          <Toggle checked={h.enabled} onChange={(v) => store.updateHarness({ enabled: v })} label="Enable harness" />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-ink">Agent mode</span>
          <Toggle checked={h.agentMode} onChange={(v) => store.updateHarness({ agentMode: v })} label="Agent mode" />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-ink">Auto-approve tools</span>
          <Toggle checked={h.autoApprove} onChange={(v) => store.updateHarness({ autoApprove: v })} label="Auto approve" />
        </div>
      </div>

      <div className="space-y-2.5">
        <Field label="Endpoint">
          <input
            value={h.endpoint}
            onChange={(e) => store.updateHarness({ endpoint: e.target.value })}
            className={cx(inputClass, "font-mono text-[11.5px]")}
            placeholder="http://localhost:8787/harness"
          />
        </Field>
        <Field label="Bearer token" hint="stored locally">
          <div className="flex gap-1.5">
            <input
              type={reveal ? "text" : "password"}
              value={h.apiKey}
              onChange={(e) => store.updateHarness({ apiKey: e.target.value })}
              className={cx(inputClass, "font-mono text-[11.5px]")}
              placeholder="hrn_…"
            />
            <button
              onClick={() => setReveal((r) => !r)}
              className="shrink-0 rounded-lg border border-line px-2 text-[10.5px] text-muted transition-colors hover:text-ink"
            >
              {reveal ? "Hide" : "Show"}
            </button>
          </div>
        </Field>
        <Field label="Max steps" hint={`${h.maxSteps} per turn`}>
          <input
            type="range"
            min={1}
            max={40}
            value={h.maxSteps}
            onChange={(e) => store.updateHarness({ maxSteps: Number(e.target.value) })}
            className="w-full"
          />
        </Field>
      </div>

      <div>
        <SectionTitle>Subagents</SectionTitle>
        {h.subagents.length === 0 ? (
          <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
            None registered. Add the agent names your harness exposes.
          </p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {h.subagents.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-white/[0.03] px-2 py-[3px] font-mono text-[10px] text-muted"
            >
              {s}
              <button
                onClick={() => store.updateHarness({ subagents: h.subagents.filter((x) => x !== s) })}
                className="text-faint hover:text-rose-300"
                aria-label={`Remove ${s}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          <button
            onClick={() => store.updateHarness({ subagents: [...h.subagents, `agent-${h.subagents.length + 1}`] })}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2 py-[3px] text-[10px] text-faint hover:border-accent/40 hover:text-accent-pale"
          >
            <Plus className="h-2.5 w-2.5" /> add
          </button>
        </div>
      </div>

      <button
        onClick={store.testHarness}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent/15 py-2 text-[11.5px] font-medium text-accent-pale transition-colors hover:bg-accent/25"
      >
        {h.status === "connected" ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Refresh className={cx("h-3.5 w-3.5", h.status === "connecting" && "animate-spin")} />
        )}
        {h.status === "connecting" ? "Checking…" : h.status === "connected" ? "Marked reachable — check again" : "Check endpoint"}
      </button>
    </div>
  );
}

function SettingsTab() {
  const store = useStore();
  const active = MODELS.find((m) => m.id === store.settings.model) ?? MODELS[0];

  return (
    <div className="space-y-4">
      <div>
        <SectionTitle>Model</SectionTitle>
        <div className="mt-1.5 space-y-1.5">
          {MODELS.map((m) => (
            <button
              key={m.id}
              onClick={() => store.updateSettings({ model: m.id })}
              className={cx(
                "flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left transition-colors",
                m.id === store.settings.model
                  ? "border-accent/40 bg-accent/10"
                  : "border-line bg-white/[0.02] hover:border-linestrong",
              )}
            >
              <span>
                <span className="block text-[12px] text-ink">{m.label}</span>
                <span className="block font-mono text-[9.5px] text-faint">{m.id}</span>
              </span>
              {m.id === store.settings.model && <Check className="h-3.5 w-3.5 text-accent-soft" />}
            </button>
          ))}
        </div>
      </div>

      <Field label="Temperature" hint={store.settings.temperature.toFixed(1)}>
        <input
          type="range"
          min={0}
          max={2}
          step={0.1}
          value={store.settings.temperature}
          onChange={(e) => store.updateSettings({ temperature: Number(e.target.value) })}
          className="w-full"
        />
      </Field>

      <Field label="System prompt">
        <textarea
          value={store.settings.systemPrompt}
          onChange={(e) => store.updateSettings({ systemPrompt: e.target.value })}
          rows={5}
          className={cx(inputClass, "resize-none leading-relaxed")}
        />
      </Field>

      <div className="rounded-xl border border-line bg-black/25 p-2.5">
        <SectionTitle>Connection</SectionTitle>
        <div className="mt-2 space-y-1.5 font-mono text-[10.5px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-faint">model</span>
            <span className="truncate text-accent-pale">{active.id}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-faint">route</span>
            <span className="text-muted">/api/chat</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-faint">transport</span>
            <span className="text-muted">streamed</span>
          </div>
        </div>
        <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
          The Gemini key is read server-side from <code className="font-mono text-accent-pale">GEMINI_API_KEY</code> and
          never reaches the browser.
        </p>
      </div>

      <button
        onClick={store.clearAll}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 py-2 text-[11.5px] font-medium text-rose-200 transition-colors hover:bg-rose-500/20"
      >
        <X className="h-3.5 w-3.5" />
        Clear all chats
      </button>

      <p className="pb-2 text-center font-mono text-[9.5px] uppercase tracking-[0.14em] text-faint/60">
        anu · mit licensed
      </p>
    </div>
  );
}

export default function RightPanel({
  tab,
  onTabChange,
  onClose,
}: {
  tab: PanelTab;
  onTabChange: (t: PanelTab) => void;
  onClose: () => void;
}) {
  return (
    <aside className="flex h-full w-[min(92vw,320px)] shrink-0 flex-col border-l border-line bg-soft/95 backdrop-blur xl:w-[320px] xl:bg-soft/70">
      <div className="flex items-center gap-1 border-b border-line px-2 py-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            className={cx(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-1.5 py-1.5 text-[11px] font-medium transition-colors",
              tab === t.id ? "bg-accent/15 text-accent-pale" : "text-muted hover:bg-white/[0.04] hover:text-ink",
            )}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
        <button
          onClick={onClose}
          className="ml-0.5 rounded-lg p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-ink xl:hidden"
          aria-label="Close panel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "skills" && <SkillsTab />}
        {tab === "connectors" && <ConnectorsTab />}
        {tab === "harness" && <HarnessTab />}
        {tab === "settings" && <SettingsTab />}
      </div>
    </aside>
  );
}
