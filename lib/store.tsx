"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DEFAULT_MODEL } from "./types";
import type {
  Attachment,
  Chat,
  ChatRequest,
  HarnessConfig,
  McpServer,
  Message,
  Settings,
  Skill,
} from "./types";
import { titleFrom, uid } from "./utils";

const STORAGE_KEY = "nebula.chat.v2";

interface Persisted {
  chats: Chat[];
  activeId: string | null;
  skills: Skill[];
  servers: McpServer[];
  harness: HarnessConfig;
  settings: Settings;
}

function defaults(): Persisted {
  return {
    chats: [],
    activeId: null,
    skills: [],
    servers: [],
    harness: {
      enabled: false,
      endpoint: "",
      apiKey: "",
      agentMode: true,
      autoApprove: false,
      maxSteps: 12,
      status: "idle",
      subagents: [],
    },
    settings: {
      model: DEFAULT_MODEL,
      temperature: 0.7,
      systemPrompt:
        "You are a precise, friendly assistant. Ask a clarifying question when the request is ambiguous, otherwise answer directly.",
    },
  };
}

interface StoreValue extends Persisted {
  activeChat: Chat | null;
  streaming: boolean;
  hydrated: boolean;
  createChat: () => string;
  selectChat: (id: string) => void;
  deleteChat: (id: string) => void;
  renameChat: (id: string, title: string) => void;
  clearAll: () => void;
  send: (text: string, attachments?: Attachment[]) => Promise<void>;
  regenerate: () => Promise<void>;
  stop: () => void;
  toggleSkill: (id: string) => void;
  addSkill: (name: string, description: string) => void;
  removeSkill: (id: string) => void;
  addServer: (server: Pick<McpServer, "name" | "transport" | "target" | "headers">) => void;
  importServers: (json: string) => Promise<{ added: number; ids: string[]; error?: string }>;
  refreshServer: (id: string) => Promise<void>;
  toggleServer: (id: string) => void;
  removeServer: (id: string) => void;
  updateHarness: (patch: Partial<HarnessConfig>) => void;
  testHarness: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>(defaults);
  const [streaming, setStreaming] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const stateRef = useRef(state);
  const abortRef = useRef(false);

  stateRef.current = state;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Persisted>;
        setState((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked */
    }
  }, [state, hydrated]);

  const patchMessage = useCallback((chatId: string, msgId: string, patch: Partial<Message>) => {
    setState((s) => ({
      ...s,
      chats: s.chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              updatedAt: Date.now(),
              messages: c.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m)),
            }
          : c,
      ),
    }));
  }, []);

  const createChat = useCallback(() => {
    const id = uid();
    const chat: Chat = {
      id,
      title: "New chat",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setState((s) => ({ ...s, chats: [chat, ...s.chats], activeId: id }));
    return id;
  }, []);

  const selectChat = useCallback((id: string) => setState((s) => ({ ...s, activeId: id })), []);

  const deleteChat = useCallback((id: string) => {
    setState((s) => {
      const chats = s.chats.filter((c) => c.id !== id);
      return { ...s, chats, activeId: s.activeId === id ? chats[0]?.id ?? null : s.activeId };
    });
  }, []);

  const renameChat = useCallback((id: string, title: string) => {
    setState((s) => ({
      ...s,
      chats: s.chats.map((c) => (c.id === id ? { ...c, title: title.trim() || c.title } : c)),
    }));
  }, []);

  const clearAll = useCallback(() => {
    setState((s) => ({
      ...defaults(),
      skills: s.skills,
      servers: s.servers,
      harness: s.harness,
      settings: s.settings,
    }));
  }, []);

  const buildRequest = useCallback((messages: Message[]): ChatRequest => {
    const s = stateRef.current;
    return {
      messages: messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-24)
        .map((m) => ({ role: m.role, content: m.content })),
      model: s.settings.model,
      systemPrompt: s.settings.systemPrompt,
      temperature: s.settings.temperature,
      attachments: messages
        .flatMap((m) => m.attachments ?? [])
        .map((a) => ({ name: a.name, type: a.type, size: a.size })),
      skills: s.skills
        .filter((k) => k.enabled)
        .map((k) => (k.description ? `${k.name} — ${k.description}` : k.name)),
      mcpServers: s.servers
        .filter((server) => server.enabled)
        .map((server) => ({
          id: server.id,
          name: server.name,
          transport: server.transport,
          target: server.target,
          headers: server.headers,
        })),
      harness: {
        enabled: s.harness.enabled,
        agentMode: s.harness.agentMode,
        maxSteps: s.harness.maxSteps,
      },
    };
  }, []);

  const runTurn = useCallback(
    async (chatId: string, botId: string, payload: ChatRequest) => {
      abortRef.current = false;
      setStreaming(true);

      let acc = "";
      let think = "";
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok || !res.body) {
          const detail = await res.text().catch(() => "");
          let message = detail.trim();
          try {
            message = (JSON.parse(detail) as { error?: string }).error ?? message;
          } catch {
            /* plain text error */
          }
          throw new Error(message || `Request failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const handleLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed) return;
          let event: { type?: string; text?: string } & Record<string, unknown>;
          try {
            event = JSON.parse(trimmed) as { type?: string; text?: string } & Record<string, unknown>;
          } catch {
            return;
          }

          const currentCalls = () =>
            stateRef.current.chats.find((c) => c.id === chatId)?.messages.find((m) => m.id === botId)
              ?.toolCalls ?? [];
          const currentNotices = () =>
            stateRef.current.chats.find((c) => c.id === chatId)?.messages.find((m) => m.id === botId)
              ?.notices ?? [];

          switch (event.type) {
            case "tool_call": {
              const call = event as unknown as { id: string; server: string; name: string; args: unknown };
              patchMessage(chatId, botId, {
                toolCalls: [
                  ...currentCalls(),
                  { id: call.id, server: call.server, name: call.name, args: call.args, pending: true },
                ],
              });
              return;
            }
            case "tool_result": {
              const result = event as unknown as { id: string; ok: boolean; content: string; error?: string };
              patchMessage(chatId, botId, {
                toolCalls: currentCalls().map((call) =>
                  call.id === result.id
                    ? { ...call, ok: result.ok, content: result.content, error: result.error, pending: false }
                    : call,
                ),
              });
              return;
            }
            case "notice": {
              const notice = (event as unknown as { text: string }).text;
              if (notice) patchMessage(chatId, botId, { notices: [...currentNotices(), notice] });
              return;
            }
            default:
              break;
          }

          const text = event.text ?? "";
          if (!text) return;

          if (event.type === "thought") {
            think += text;
            patchMessage(chatId, botId, { thinking: think, pending: true });
          } else if (event.type === "text") {
            acc += text;
            patchMessage(chatId, botId, { content: acc });
          } else if (event.type === "error") {
            acc += `${acc ? "\n\n" : ""}**Request failed.** ${text}`;
            patchMessage(chatId, botId, { content: acc });
          }
        };

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (abortRef.current) {
            await reader.cancel();
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) handleLine(line);
        }
        buffer += decoder.decode();
        if (buffer.trim()) handleLine(buffer);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Something went wrong.";
        patchMessage(chatId, botId, {
          content: acc ? `${acc}\n\n**Request failed.** ${message}` : `**Request failed.** ${message}`,
          thinking: think || undefined,
          pending: false,
          error: true,
        });
        setStreaming(false);
        return;
      }

      const thinking = think.trim() ? think : undefined;
      if (abortRef.current) {
        patchMessage(chatId, botId, { content: `${acc}\n\n_Stopped._`, thinking, pending: false });
      } else if (!acc.trim()) {
        patchMessage(chatId, botId, { content: "_The model returned an empty response._", thinking, pending: false });
      } else {
        patchMessage(chatId, botId, { content: acc, thinking, pending: false });
      }
      setStreaming(false);
    },
    [patchMessage],
  );

  const send = useCallback(
    async (text: string, attachments: Attachment[] = []) => {
      const trimmed = text.trim();
      if (!trimmed && attachments.length === 0) return;

      const cur = stateRef.current;
      const chatId = cur.activeId ?? uid();
      const now = Date.now();
      const userMsg: Message = { id: uid(), role: "user", content: trimmed, attachments, createdAt: now };
      const botMsg: Message = { id: uid(), role: "assistant", content: "", createdAt: now + 1, pending: true };

      setState((s) => {
        const existing = s.chats.find((c) => c.id === chatId);
        if (!existing) {
          const chat: Chat = {
            id: chatId,
            title: titleFrom(trimmed || attachments[0]?.name || "New chat"),
            messages: [userMsg, botMsg],
            createdAt: now,
            updatedAt: now,
          };
          return { ...s, chats: [chat, ...s.chats], activeId: chatId };
        }
        return {
          ...s,
          activeId: chatId,
          chats: s.chats.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  title:
                    c.messages.length === 0
                      ? titleFrom(trimmed || attachments[0]?.name || "New chat")
                      : c.title,
                  messages: [...c.messages, userMsg, botMsg],
                  updatedAt: now,
                }
              : c,
          ),
        };
      });

      const chat = stateRef.current.chats.find((c) => c.id === chatId);
      const history = [...(chat?.messages ?? []), userMsg];
      await runTurn(chatId, botMsg.id, buildRequest(history));
    },
    [buildRequest, runTurn],
  );

  const regenerate = useCallback(async () => {
    const cur = stateRef.current;
    const chat = cur.chats.find((c) => c.id === cur.activeId);
    if (!chat) return;

    const roles = chat.messages.map((m) => m.role);
    const lastUserIndex = roles.lastIndexOf("user");
    if (lastUserIndex < 0) return;

    const kept = chat.messages.slice(0, lastUserIndex + 1);
    const botMsg: Message = { id: uid(), role: "assistant", content: "", createdAt: Date.now(), pending: true };

    setState((s) => ({
      ...s,
      chats: s.chats.map((c) =>
        c.id === chat.id ? { ...c, messages: [...kept, botMsg], updatedAt: Date.now() } : c,
      ),
    }));

    await runTurn(chat.id, botMsg.id, buildRequest(kept));
  }, [buildRequest, runTurn]);

  const stop = useCallback(() => {
    abortRef.current = true;
    setStreaming(false);
  }, []);

  const toggleSkill = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      skills: s.skills.map((k) => (k.id === id ? { ...k, enabled: !k.enabled } : k)),
    }));
  }, []);

  const addSkill = useCallback((name: string, description: string) => {
    if (!name.trim()) return;
    setState((s) => ({
      ...s,
      skills: [
        ...s.skills,
        { id: uid(), name: name.trim(), description: description.trim(), enabled: true },
      ],
    }));
  }, []);

  const removeSkill = useCallback((id: string) => {
    setState((s) => ({ ...s, skills: s.skills.filter((k) => k.id !== id) }));
  }, []);

  const addServer = useCallback(
    (server: Pick<McpServer, "name" | "transport" | "target" | "headers">) => {
      if (!server.name.trim() || !server.target.trim()) return;
      setState((s) => ({
        ...s,
        servers: [...s.servers, { ...server, id: uid(), enabled: true, status: "connecting" as const }],
      }));
    },
    [],
  );

  /** Accepts a Claude-Desktop style { mcpServers: { name: {...} } } block. */
  const importServers = useCallback(async (json: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return { added: 0, ids: [], error: "That isn't valid JSON." };
    }

    const root = parsed as { mcpServers?: Record<string, unknown> } & Record<string, unknown>;
    const block = (root.mcpServers ?? root) as Record<string, unknown>;
    if (!block || typeof block !== "object") return { added: 0, ids: [], error: "No mcpServers block found." };

    const entries: McpServer[] = [];
    for (const [name, raw] of Object.entries(block)) {
      const config = raw as {
        command?: string;
        args?: string[];
        url?: string;
        type?: string;
        transport?: string;
        headers?: Record<string, string>;
        env?: Record<string, string>;
      };
      if (!config || typeof config !== "object") continue;

      if (config.url) {
        const transport = (config.transport ?? config.type ?? "http") === "sse" ? "sse" : "http";
        entries.push({
          id: uid(),
          name,
          transport,
          target: config.url,
          headers: config.headers,
          enabled: true,
          status: "connecting",
        });
      } else if (config.command) {
        const args = Array.isArray(config.args) ? config.args : [];
        entries.push({
          id: uid(),
          name,
          transport: "stdio",
          target: [config.command, ...args].join(" "),
          enabled: true,
          status: "connecting",
        });
      }
    }

    if (!entries.length) return { added: 0, ids: [], error: "No usable server definitions found." };

    const fresh = entries.filter((entry) => !stateRef.current.servers.some((x) => x.name === entry.name));
    setState((s) => ({ ...s, servers: [...s.servers, ...fresh] }));
    return { added: fresh.length, ids: fresh.map((entry) => entry.id) };
  }, []);

  const refreshServer = useCallback(async (id: string) => {
    const server = stateRef.current.servers.find((item) => item.id === id);
    if (!server) return;

    setState((s) => ({
      ...s,
      servers: s.servers.map((item) =>
        item.id === id ? { ...item, status: "connecting" as const, error: undefined } : item,
      ),
    }));

    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          server: {
            id: server.id,
            name: server.name,
            transport: server.transport,
            target: server.target,
            headers: server.headers,
          },
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        tools?: { name: string }[];
        error?: string;
      };
      setState((s) => ({
        ...s,
        servers: s.servers.map((item) =>
          item.id === id
            ? {
                ...item,
                status: data.ok ? ("connected" as const) : ("error" as const),
                tools: data.tools?.map((tool) => tool.name) ?? [],
                error: data.ok ? undefined : data.error,
              }
            : item,
        ),
      }));
    } catch (error) {
      setState((s) => ({
        ...s,
        servers: s.servers.map((item) =>
          item.id === id
            ? {
                ...item,
                status: "error" as const,
                error: error instanceof Error ? error.message : "Could not reach /api/mcp",
              }
            : item,
        ),
      }));
    }
  }, []);

  const toggleServer = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      servers: s.servers.map((srv) =>
        srv.id === id
          ? { ...srv, enabled: !srv.enabled, status: !srv.enabled ? "connected" : "disconnected" }
          : srv,
      ),
    }));
  }, []);

  const removeServer = useCallback((id: string) => {
    setState((s) => ({ ...s, servers: s.servers.filter((srv) => srv.id !== id) }));
  }, []);

  const updateHarness = useCallback((patch: Partial<HarnessConfig>) => {
    setState((s) => ({ ...s, harness: { ...s.harness, ...patch } }));
  }, []);

  const testHarness = useCallback(() => {
    updateHarness({ status: "connecting" });
    setTimeout(() => updateHarness({ status: "connected" }), 900);
  }, [updateHarness]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  }, []);

  const activeChat = useMemo(
    () => state.chats.find((c) => c.id === state.activeId) ?? null,
    [state.chats, state.activeId],
  );

  const value = useMemo<StoreValue>(
    () => ({
      ...state,
      activeChat,
      streaming,
      hydrated,
      createChat,
      selectChat,
      deleteChat,
      renameChat,
      clearAll,
      send,
      regenerate,
      stop,
      toggleSkill,
      addSkill,
      removeSkill,
      addServer,
      importServers,
      refreshServer,
      toggleServer,
      removeServer,
      updateHarness,
      testHarness,
      updateSettings,
    }),
    [
      state,
      activeChat,
      streaming,
      hydrated,
      createChat,
      selectChat,
      deleteChat,
      renameChat,
      clearAll,
      send,
      regenerate,
      stop,
      toggleSkill,
      addSkill,
      removeSkill,
      addServer,
      importServers,
      refreshServer,
      toggleServer,
      removeServer,
      updateHarness,
      testHarness,
      updateSettings,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
