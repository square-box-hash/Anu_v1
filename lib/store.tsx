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
  addServer: (server: Pick<McpServer, "name" | "transport" | "target">) => void;
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
      skills: s.skills.filter((k) => k.enabled).map((k) => k.name),
      mcpServers: s.servers
        .filter((server) => server.enabled)
        .map((server) => ({ name: server.name, transport: server.transport })),
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
          let event: { type?: string; text?: string };
          try {
            event = JSON.parse(trimmed) as { type?: string; text?: string };
          } catch {
            return;
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

  const addServer = useCallback((server: Pick<McpServer, "name" | "transport" | "target">) => {
    if (!server.name.trim() || !server.target.trim()) return;
    setState((s) => ({
      ...s,
      servers: [
        ...s.servers,
        { ...server, id: uid(), enabled: true, status: "connected" as const },
      ],
    }));
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
