"use client";

import React, { useState } from "react";
import { TRANSLATE_LANGUAGES, getAllModels } from "@/lib/models";
import { useStore } from "@/lib/store";
import type { CustomModelConfig, McpTransport, ModelRole, RoleAssignments } from "@/lib/types";
import { cx } from "@/lib/utils";
import {
  Bolt,
  Check,
  Cpu,
  Download,
  Layers,
  Link,
  Plus,
  Refresh,
  Settings as SettingsIcon,
  Sliders,
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
  const [preview, setPreview] = useState<Record<string, string>>({});
  const enabledCount = store.repoSkills.filter((skill) => store.enabledRepoSkills.includes(skill.slug)).length;

  const togglePreview = async (slug: string) => {
    if (preview[slug]) {
      setPreview((current) => {
        const next = { ...current };
        delete next[slug];
        return next;
      });
      return;
    }
    setPreview((current) => ({ ...current, [slug]: "Loading…" }));
    try {
      const res = await fetch(`/api/skills?slug=${encodeURIComponent(slug)}`);
      const data = (await res.json()) as { ok?: boolean; body?: string; error?: string };
      setPreview((current) => ({
        ...current,
        [slug]: data.ok ? data.body ?? "" : `Could not load this skill: ${data.error ?? "unknown error"}`,
      }));
    } catch {
      setPreview((current) => ({ ...current, [slug]: "Could not load this skill." }));
    }
  };

  return (
    <div className="space-y-5">
      <section className="space-y-2.5">
        <div className="flex items-center gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">Workspace</h3>
          <span className="rounded-full border border-line px-1.5 py-[1px] font-mono text-[9.5px] text-muted">
            {enabledCount}/{store.repoSkills.length}
          </span>
          <button
            onClick={() => void store.refreshRepoSkills()}
            className="ml-auto rounded-md p-1 text-faint transition-colors hover:bg-white/5 hover:text-ink"
            title="Rescan skills folder"
            aria-label="Rescan skills folder"
          >
            <Refresh className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="text-[10.5px] leading-relaxed text-faint/90">
          Only the name and description reach the model — the body loads when it calls{" "}
          <code className="font-mono text-accent-pale">load_skill</code>.
        </p>

        {store.repoSkills.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line px-3 py-4 text-center">
            <p className="text-[11px] leading-relaxed text-faint">No SKILL.md files found.</p>
            <p className="mt-1 font-mono text-[10px] text-faint/70">skills/&lt;name&gt;/SKILL.md</p>
          </div>
        ) : (
          <div className="space-y-2">
            {store.repoSkills.map((skill) => {
              const enabled = store.enabledRepoSkills.includes(skill.slug);
              const open = Boolean(preview[skill.slug]);
              return (
                <div
                  key={skill.slug}
                  className={cx(
                    "rounded-xl border transition-colors",
                    enabled ? "border-accent/35 bg-accent/[0.07]" : "border-line bg-white/[0.02] hover:border-linestrong",
                  )}
                >
                  <div className="flex items-start gap-2 p-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cx(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            enabled ? "bg-accent-soft" : "bg-faint/60",
                          )}
                        />
                        <span className="truncate font-mono text-[11.5px] text-ink">{skill.name}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-faint">{skill.description}</p>
                    </div>
                    <Toggle checked={enabled} onChange={() => store.toggleRepoSkill(skill.slug)} label={skill.name} />
                  </div>

                  <div className="flex items-center gap-1.5 border-t border-line/70 px-2.5 py-1.5">
                    {skill.files.slice(0, 2).map((file) => (
                      <span
                        key={file}
                        className="max-w-[130px] truncate rounded border border-line bg-black/25 px-1.5 py-[1px] font-mono text-[9px] text-muted"
                      >
                        {file}
                      </span>
                    ))}
                    {skill.files.length > 2 ? (
                      <span className="font-mono text-[9px] text-faint">+{skill.files.length - 2}</span>
                    ) : null}
                    <button
                      onClick={() => void togglePreview(skill.slug)}
                      className="ml-auto rounded px-1.5 py-[2px] text-[10px] text-faint transition-colors hover:bg-white/5 hover:text-accent-pale"
                    >
                      {open ? "Hide" : "Preview"}
                    </button>
                  </div>

                  {open ? (
                    <pre className="max-h-[240px] overflow-auto border-t border-line/70 px-2.5 py-2 font-mono text-[10.5px] leading-relaxed whitespace-pre-wrap text-ink/75">
                      {preview[skill.slug]}
                    </pre>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-2.5 border-t border-line pt-4">
        <div className="flex items-center gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">Inline</h3>
          <span className="rounded-full border border-line px-1.5 py-[1px] font-mono text-[9.5px] text-muted">
            {store.skills.filter((skill) => skill.enabled).length}/{store.skills.length}
          </span>
        </div>

        <p className="text-[10.5px] leading-relaxed text-faint/90">
          One-liners that ride in the system prompt every turn. Keep them short.
        </p>

        {store.skills.length > 0 ? (
          <div className="space-y-1.5">
            {store.skills.map((skill) => (
              <div
                key={skill.id}
                className={cx(
                  "flex items-start gap-2 rounded-xl border p-2.5 transition-colors",
                  skill.enabled ? "border-accent/30 bg-accent/[0.06]" : "border-line bg-white/[0.02]",
                )}
              >
                <div className="min-w-0 flex-1">
                  <span className="truncate text-[12px] font-medium text-ink">{skill.name}</span>
                  {skill.description ? (
                    <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-relaxed text-faint">{skill.description}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
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
            ))}
          </div>
        ) : null}

        <div className="space-y-1.5 rounded-xl border border-line bg-black/25 p-2.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Rule name"
            className={inputClass}
          />
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="One line — e.g. always answer with a table"
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
            Add
          </button>
        </div>
      </section>
    </div>
  );
}

function ConnectorsTab() {
  const store = useStore();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [transport, setTransport] = useState<McpTransport>("stdio");
  const [config, setConfig] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const PRESETS = [
    { label: "filesystem", transport: "stdio" as McpTransport, target: "npx -y @modelcontextprotocol/server-filesystem ." },
    { label: "memory", transport: "stdio" as McpTransport, target: "npx -y @modelcontextprotocol/server-memory" },
    { label: "thinking", transport: "stdio" as McpTransport, target: "npx -y @modelcontextprotocol/server-sequential-thinking" },
    { label: "http url", transport: "http" as McpTransport, target: "https://example.com/mcp" },
  ];

  const importConfig = async () => {
    setBusy(true);
    const result = await store.importServers(config);
    setBusy(false);
    setFeedback(result.error ?? `Imported ${result.added} server${result.added === 1 ? "" : "s"} — checking tools…`);
    if (!result.error) {
      setConfig("");
      for (const id of result.ids) void store.refreshServer(id);
    }
  };

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
          Connected servers expose their tools to the model for the current chat. Nothing is connected by default.
        </p>
      </div>

      {store.servers.length === 0 ? (
        <Empty>No servers yet. Paste a config below or add one by hand.</Empty>
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
                    {server.tools?.length ? (
                      <span className="ml-auto shrink-0 font-mono text-[9.5px] text-faint">
                        {server.tools.length} tools
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate font-mono text-[10px] text-faint" title={server.target}>
                    {server.target}
                  </p>
                  {server.error ? (
                    <p className="mt-1 break-words text-[10.5px] leading-relaxed text-rose-300/80">{server.error}</p>
                  ) : null}
                  {server.tools?.length ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {server.tools.slice(0, 8).map((tool) => (
                        <span
                          key={tool}
                          className="rounded border border-line bg-black/25 px-1.5 py-[1px] font-mono text-[9.5px] text-muted"
                        >
                          {tool}
                        </span>
                      ))}
                      {server.tools.length > 8 ? (
                        <span className="font-mono text-[9.5px] text-faint">+{server.tools.length - 8}</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => void store.refreshServer(server.id)}
                    className="rounded p-1 text-faint transition-colors hover:bg-white/10 hover:text-ink"
                    aria-label={`Check ${server.name}`}
                    title="Check connection and list tools"
                  >
                    <Refresh className="h-3 w-3" />
                  </button>
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
        <SectionTitle right={<span className="font-mono text-[9px] uppercase tracking-wider text-faint">fastest</span>}>
          Paste a config
        </SectionTitle>
        <p className="mt-1 text-[10.5px] leading-relaxed text-faint">
          Accepts the same shape Claude Desktop uses:{" "}
          <code className="font-mono text-accent-pale">{'{"mcpServers":{…}}'}</code> with either{" "}
          <code className="font-mono text-accent-pale">command</code> or{" "}
          <code className="font-mono text-accent-pale">url</code>.
        </p>
        <textarea
          value={config}
          onChange={(e) => setConfig(e.target.value)}
          rows={4}
          spellCheck={false}
          placeholder={'{\n  "mcpServers": {\n    "filesystem": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]\n    }\n  }\n}'}
          className={cx(inputClass, "mt-1.5 resize-none font-mono text-[10.5px] leading-relaxed")}
        />
        <button
          onClick={() => void importConfig()}
          disabled={!config.trim() || busy}
          className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent/15 py-1.5 text-[11.5px] font-medium text-accent-pale transition-colors hover:bg-accent/25 disabled:opacity-40"
        >
          <Link className="h-3 w-3" />
          {busy ? "Importing…" : "Import servers"}
        </button>
        {feedback ? <p className="mt-1.5 text-[10.5px] leading-relaxed text-faint">{feedback}</p> : null}
      </div>

      <div className="rounded-xl border border-line bg-black/25 p-2.5">
        <SectionTitle>Add by hand</SectionTitle>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => {
                setTransport(preset.transport);
                setTarget(preset.target);
                setName(preset.label);
              }}
              className="rounded-full border border-line px-2 py-[3px] text-[10px] text-muted transition-colors hover:border-accent/40 hover:text-accent-pale"
            >
              {preset.label}
            </button>
          ))}
        </div>
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
            <Plus className="h-3 w-3" />
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

const ROLE_LABELS: { key: keyof RoleAssignments; label: string; hint: string }[] = [
  { key: "router", label: "Step 1 · Router", hint: "triage & tool routing" },
  { key: "context", label: "Step 2 · Context", hint: "large files & JSON" },
  { key: "planner", label: "Step 3 · Planner", hint: "STEM & architecture" },
  { key: "heavy", label: "Step 3 · Heavy Fallback", hint: "medium-heavy synthesis" },
  { key: "longHorizon", label: "Step 3 · Long Horizon", hint: "deep coding agent" },
  { key: "casualChat", label: "Direct Chat", hint: "conversational turns" },
  { key: "subagentFast", label: "Step 4 · Fast Subagent", hint: "tests, lint, quick loops" },
  { key: "subagentQuality", label: "Step 4 · Quality Subagent", hint: "code sub-edits & docs" },
  { key: "specialist", label: "Selective Specialist", hint: "targeted non-chat tasks" },
];

function SettingsTab() {
  const store = useStore();
  const [exported, setExported] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);

  const [cId, setCId] = useState("");
  const [cLabel, setCLabel] = useState("");
  const [cProvider, setCProvider] = useState<"gemini" | "openai-compatible">("gemini");
  const [cRole, setCRole] = useState<ModelRole>("general");
  const [cEndpoint, setCEndpoint] = useState("");
  const [cToken, setCToken] = useState("");

  const allModels = getAllModels(store.settings.customModels);
  const active = allModels.find((m) => m.id === store.settings.model) ?? allModels[1] ?? allModels[0];
  const chat = store.activeChat;
  const orch = store.settings.orchestration;

  const exportCurrentChat = () => {
    if (!chat) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      model: store.settings.model,
      chat: {
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        messages: chat.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          ...(m.model ? { model: m.model } : {}),
          ...(m.routing ? { routing: m.routing } : {}),
          ...(m.thinking ? { thinking: m.thinking } : {}),
          ...(m.attachments?.length ? { attachments: m.attachments } : {}),
          ...(m.toolCalls?.length ? { toolCalls: m.toolCalls } : {}),
          ...(m.notices?.length ? { notices: m.notices } : {}),
          createdAt: m.createdAt,
          ...(m.error ? { error: m.error } : {}),
        })),
      },
    };

    const safeSlug =
      chat.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || chat.id.slice(0, 8);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `anu-${safeSlug}-${dateStamp}.json`;

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    setExported(true);
    setTimeout(() => setExported(false), 2000);
  };

  const handleAddCustom = () => {
    if (!cId.trim()) return;
    if (cProvider === "openai-compatible" && !cEndpoint.trim()) return;
    const entry: CustomModelConfig = {
      id: cId.trim(),
      label: cLabel.trim() || cId.trim(),
      provider: cProvider,
      role: cRole,
      ...(cProvider === "openai-compatible"
        ? { endpointUrl: cEndpoint.trim(), ...(cToken.trim() ? { customToken: cToken.trim() } : {}) }
        : {}),
    };
    store.addCustomModel(entry);
    setCId("");
    setCLabel("");
    setCEndpoint("");
    setCToken("");
    setCustomOpen(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <SectionTitle
          right={<span className="font-mono text-[9.5px] text-faint">{allModels.length} models</span>}
        >
          Model
        </SectionTitle>
        <div className="mt-1.5 max-h-[250px] space-y-1.5 overflow-y-auto pr-0.5">
          {allModels.map((m) => {
            const isCustom = store.settings.customModels.some((cm) => cm.id === m.id);
            return (
              <div
                key={m.id}
                className={cx(
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-2 transition-colors",
                  m.id === store.settings.model
                    ? "border-accent/40 bg-accent/10"
                    : "border-line bg-white/[0.02] hover:border-linestrong",
                )}
              >
                <button
                  type="button"
                  onClick={() =>
                    store.updateSettings({
                      model: m.id,
                      autoRoute: m.id === "auto" ? true : store.settings.autoRoute,
                    })
                  }
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[12px] text-ink">{m.label}</span>
                    {m.badge && (
                      <span className="shrink-0 rounded border border-line bg-black/30 px-1 py-[0.5px] font-mono text-[8.5px] uppercase tracking-wider text-accent-pale">
                        {m.badge}
                      </span>
                    )}
                  </span>
                  <span className="block truncate font-mono text-[9.5px] text-faint">{m.id}</span>
                </button>
                {isCustom && (
                  <button
                    type="button"
                    onClick={() => store.removeCustomModel(m.id)}
                    className="rounded p-1 text-faint hover:bg-rose-500/15 hover:text-rose-300"
                    aria-label={`Remove ${m.label}`}
                  >
                    <Trash className="h-3 w-3" />
                  </button>
                )}
                {m.id === store.settings.model && <Check className="h-3.5 w-3.5 shrink-0 text-accent-soft" />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2.5 rounded-xl border border-line bg-white/[0.02] p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5 text-accent-soft" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Orchestration</span>
          </div>
          <span className="rounded border border-line bg-black/30 px-1.5 py-[1px] font-mono text-[9px] text-muted">
            4-step
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="block text-[12px] text-ink">Smart auto-route</span>
              <span className="block text-[10px] text-faint">Triage every prompt via Decisions 1</span>
            </div>
            <Toggle
              checked={store.settings.autoRoute}
              onChange={(v) => store.updateSettings({ autoRoute: v })}
              label="Smart auto-route"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="block text-[12px] text-ink">Focus on first prompt</span>
              <span className="block text-[10px] text-faint">Anchor domain (e.g. chemistry doubts)</span>
            </div>
            <Toggle
              checked={orch.enableFirstPromptFocus}
              onChange={(v) => store.updateOrchestration({ enableFirstPromptFocus: v })}
              label="Focus on first prompt"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="block text-[12px] text-ink">Step 2 context compression</span>
              <span className="block text-[10px] text-faint">Digest big files with 3.5 Flash Lite</span>
            </div>
            <Toggle
              checked={orch.enableContextCompression}
              onChange={(v) => store.updateOrchestration({ enableContextCompression: v })}
              label="Context compression"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="block text-[12px] text-ink">Step 4 parallel subagents</span>
              <span className="block text-[10px] text-faint">Delegate grunt work to Gemma 4 26B/31B</span>
            </div>
            <Toggle
              checked={orch.enableSubagents}
              onChange={(v) => store.updateOrchestration({ enableSubagents: v })}
              label="Parallel subagents"
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-line/70 pt-2 text-[10.5px]">
          <span className="text-faint">Live Translate target</span>
          <select
            value={orch.translateTargetLanguage}
            onChange={(e) => store.updateOrchestration({ translateTargetLanguage: e.target.value })}
            className="rounded border border-line bg-black/40 px-2 py-0.5 text-[11px] text-ink outline-none"
          >
            {TRANSLATE_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code} className="bg-[#120e1e]">
                {l.label} ({l.code})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between border-t border-line/70 pt-2 text-[10.5px]">
          <span className="text-faint">Memory ({orch.roles.memory})</span>
          <span className="rounded border border-line bg-black/30 px-1.5 py-[1px] font-mono text-[9.5px] text-emerald-300/80">
            standby · ready
          </span>
        </div>

        <button
          type="button"
          onClick={() => setRolesOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-line bg-black/25 px-2.5 py-1.5 text-[11px] text-muted transition-colors hover:border-accent/40 hover:text-ink"
        >
          <span className="inline-flex items-center gap-1.5">
            <Sliders className="h-3 w-3 text-accent-soft" />
            Customize role models
          </span>
          <span className="font-mono text-[9.5px] text-faint">{rolesOpen ? "hide" : "edit"}</span>
        </button>

        {rolesOpen && (
          <div className="space-y-2 border-t border-line/70 pt-2">
            {ROLE_LABELS.map((item) => (
              <label key={item.key} className="block space-y-1">
                <span className="flex items-center justify-between text-[10.5px]">
                  <span className="text-ink/85">{item.label}</span>
                  <span className="text-[9.5px] text-faint">{item.hint}</span>
                </span>
                <select
                  value={orch.roles[item.key]}
                  onChange={(e) =>
                    store.updateOrchestration({
                      roles: { ...orch.roles, [item.key]: e.target.value },
                    })
                  }
                  className={cx(inputClass, "py-1 text-[11px]")}
                >
                  {allModels
                    .filter((m) => m.id !== "auto" && m.modality !== "embedding")
                    .map((m) => (
                      <option key={m.id} value={m.id} className="bg-[#120e1e]">
                        {m.label} ({m.id})
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2 rounded-xl border border-line bg-black/25 p-2.5">
        <div className="flex items-center justify-between">
          <SectionTitle>Custom Model / API</SectionTitle>
          <button
            type="button"
            onClick={() => setCustomOpen((v) => !v)}
            className="rounded px-1.5 py-0.5 text-[10.5px] text-accent-soft hover:bg-white/5"
          >
            {customOpen ? "Cancel" : "+ Add model"}
          </button>
        </div>
        <p className="text-[10.5px] leading-relaxed text-faint">
          Register custom model IDs or OpenAI-compatible HTTP endpoints (Ollama, vLLM, OpenRouter) to experiment with.
        </p>

        {customOpen && (
          <div className="space-y-1.5 pt-1">
            <select
              value={cProvider}
              onChange={(e) => setCProvider(e.target.value as "gemini" | "openai-compatible")}
              className={inputClass}
            >
              <option value="gemini" className="bg-[#120e1e]">Server Gemini / Gemma model ID</option>
              <option value="openai-compatible" className="bg-[#120e1e]">Custom OpenAI-compatible HTTP endpoint</option>
            </select>
            <input
              value={cId}
              onChange={(e) => setCId(e.target.value)}
              placeholder={cProvider === "gemini" ? "Model ID (e.g. gemma-4-31b-it)" : "Model ID (e.g. qwen2.5-coder:32b)"}
              className={inputClass}
            />
            <input
              value={cLabel}
              onChange={(e) => setCLabel(e.target.value)}
              placeholder="Display label (optional)"
              className={inputClass}
            />
            <select
              value={cRole}
              onChange={(e) => setCRole(e.target.value as ModelRole)}
              className={inputClass}
            >
              <option value="general" className="bg-[#120e1e]">Role: General</option>
              <option value="planner" className="bg-[#120e1e]">Role: Planner</option>
              <option value="subagent_quality" className="bg-[#120e1e]">Role: Subagent / Chat</option>
              <option value="context" className="bg-[#120e1e]">Role: Context / JSON</option>
              <option value="specialist" className="bg-[#120e1e]">Role: Specialist</option>
            </select>
            {cProvider === "openai-compatible" && (
              <>
                <input
                  value={cEndpoint}
                  onChange={(e) => setCEndpoint(e.target.value)}
                  placeholder="Base URL (e.g. http://localhost:11434/v1)"
                  className={cx(inputClass, "font-mono text-[11px]")}
                />
                <input
                  type="password"
                  value={cToken}
                  onChange={(e) => setCToken(e.target.value)}
                  placeholder="Optional custom endpoint token"
                  className={cx(inputClass, "font-mono text-[11px]")}
                />
              </>
            )}
            <button
              type="button"
              onClick={handleAddCustom}
              disabled={!cId.trim() || (cProvider === "openai-compatible" && !cEndpoint.trim())}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent/15 py-1.5 text-[11.5px] font-medium text-accent-pale transition-colors hover:bg-accent/25 disabled:opacity-40"
            >
              <Plus className="h-3 w-3" />
              Save custom model
            </button>
          </div>
        )}
      </div>

      <Field
        label="Temperature"
        hint={active.noTemperature ? "auto (Gemini 4)" : store.settings.temperature.toFixed(1)}
      >
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
          rows={4}
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
            <span className="text-faint">routing</span>
            <span className="text-muted">
              {store.settings.autoRoute || active.id === "auto" ? "4-step smart" : "direct"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-faint">routes</span>
            <span className="text-muted">/api/chat · /api/live</span>
          </div>
        </div>
        <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
          The Gemini key is read server-side from <code className="font-mono text-accent-pale">GEMINI_API_KEY</code> and
          never reaches the browser.
        </p>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={exportCurrentChat}
          disabled={!chat}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent/15 py-2 text-[11.5px] font-medium text-accent-pale transition-colors hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
          title={chat ? `Export "${chat.title}" as JSON` : "Open or start a chat to export"}
        >
          {exported ? <Check className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
          {exported ? "Exported JSON" : chat ? `Export current chat (${chat.messages.length})` : "Export current chat"}
        </button>

        <button
          onClick={store.clearAll}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 py-2 text-[11.5px] font-medium text-rose-200 transition-colors hover:bg-rose-500/20"
        >
          <X className="h-3.5 w-3.5" />
          Clear all chats
        </button>
      </div>

      <p className="pb-2 text-center font-mono text-[9.5px] uppercase tracking-[0.14em] text-faint/60">
        anu · mit licensed
      </p>
    </div>
  );
}

/**
 * Just the contents of one tab, so the same panels can be rendered inside the
 * left navigation column instead of a separate right-hand drawer.
 */
export function PanelBody({ tab }: { tab: PanelTab }) {
  return (
    <>
      {tab === "skills" && <SkillsTab />}
      {tab === "connectors" && <ConnectorsTab />}
      {tab === "harness" && <HarnessTab />}
      {tab === "settings" && <SettingsTab />}
    </>
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
        <PanelBody tab={tab} />
      </div>
    </aside>
  );
}
