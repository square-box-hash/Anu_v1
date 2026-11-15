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
import { BUILTIN_SKILLS, DEMO_SERVERS } from "./types";
import type {
  Attachment,
  Chat,
  HarnessConfig,
  McpServer,
  Message,
  Settings,
  Skill,
} from "./types";
import { titleFrom, uid } from "./utils";

const STORAGE_KEY = "nebula.chat.v1";

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
    skills: BUILTIN_SKILLS.map((s) => ({ ...s, enabled: s.id === "web-research" })),
    servers: DEMO_SERVERS.map((s) => ({ ...s })),
    harness: {
      enabled: false,
      endpoint: "http://localhost:8787/harness",
      apiKey: "",
      agentMode: true,
      autoApprove: false,
      maxSteps: 12,
      status: "idle",
      subagents: ["planner", "researcher", "coder"],
    },
    settings: {
      model: "gemini-2.5-pro",
      temperature: 0.7,
      systemPrompt:
        "You are Nebula, a precise and friendly assistant. Ask a clarifying question when the request is ambiguous, otherwise answer directly.",
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
  stop: () => void;
  toggleSkill: (id: string) => void;
  addSkill: (name: string, description: string) => void;
  removeSkill: (id: string) => void;
  addServer: (server: Omit<McpServer, "id" | "status" | "tools" | "enabled">) => void;
  toggleServer: (id: string) => void;
  removeServer: (id: string) => void;
  updateHarness: (patch: Partial<HarnessConfig>) => void;
  testHarness: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>(defaults);
  const [streaming, setStreaming] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const stateRef = useRef(state);
  const abortRef = useRef(false);

  stateRef.current = state;

  // hydrate from localStorage
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

  // persist
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
    const chat: Chat = { id, title: "New chat", messages: [], createdAt: Date.now(), updatedAt: Date.now() };
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
    setState((s) => ({ ...defaults(), skills: s.skills, servers: s.servers, harness: s.harness, settings: s.settings }));
  }, []);

  const streamText = useCallback(
    async (chatId: string, msgId: string, full: string) => {
      const tokens = full.match(/\S+\s*/g) ?? [full];
      let acc = "";
      for (let i = 0; i < tokens.length; i++) {
        if (abortRef.current) break;
        acc += tokens[i];
        patchMessage(chatId, msgId, { content: acc });
        await sleep(i < 12 ? 22 : 11);
      }
      if (abortRef.current) {
        patchMessage(chatId, msgId, { content: `${acc}\n\n_Stopped._`, pending: false });
      } else {
        patchMessage(chatId, msgId, { content: full, pending: false });
      }
    },
    [patchMessage],
  );

  const send = useCallback(
    async (text: string, attachments: Attachment[] = []) => {
      const trimmed = text.trim();
      if (!trimmed && attachments.length === 0) return;

      abortRef.current = false;
      setStreaming(true);

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
                  title: c.messages.length === 0 ? titleFrom(trimmed || attachments[0]?.name || "New chat") : c.title,
                  messages: [...c.messages, userMsg, botMsg],
                  updatedAt: now,
                }
              : c,
          ),
        };
      });

      const snapshot = stateRef.current;
      const chat = snapshot.chats.find((c) => c.id === chatId);
      const history = [...(chat?.messages ?? []), userMsg]
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-24)
        .map((m) => ({ role: m.role, content: m.content }));

      let full = "";
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history,
            model: snapshot.settings.model,
            systemPrompt: snapshot.settings.systemPrompt,
            temperature: snapshot.settings.temperature,
            attachments: attachments.map((a) => ({ name: a.name, type: a.type, size: a.size })),
            skills: snapshot.skills.filter((s) => s.enabled).map((s) => s.name),
            mcpServers: snapshot.servers
              .filter((s) => s.enabled)
              .map((s) => ({ name: s.name, transport: s.transport, tools: s.tools })),
            harness: {
              enabled: snapshot.harness.enabled,
              agentMode: snapshot.harness.agentMode,
              maxSteps: snapshot.harness.maxSteps,
            },
          }),
        });
        const data = (await res.json()) as { text?: string; error?: string };
        full = data.text ?? data.error ?? "No response from the chat route.";
      } catch {
        full = "I couldn't reach `/api/chat`. Start the app with `npm run dev` and try again.";
      }

      await streamText(chatId, botMsg.id, full);
      setStreaming(false);
    },
    [streamText],
  );

  const stop = useCallback(() => {
    abortRef.current = true;
    setStreaming(false);
  }, []);

  const toggleSkill = useCallback((id: string) => {
    setState((s) => ({ ...s, skills: s.skills.map((k) => (k.id === id ? { ...k, enabled: !k.enabled } : k)) }));
  }, []);

  const addSkill = useCallback((name: string, description: string) => {
    if (!name.trim()) return;
    setState((s) => ({
      ...s,
      skills: [
        ...s.skills,
        { id: uid(), name: name.trim(), description: description.trim() || "Custom skill", enabled: true, builtin: false },
      ],
    }));
  }, []);

  const removeSkill = useCallback((id: string) => {
    setState((s) => ({ ...s, skills: s.skills.filter((k) => k.id !== id) }));
  }, []);

  const addServer = useCallback((server: Omit<McpServer, "id" | "status" | "tools" | "enabled">) => {
    if (!server.name.trim() || !server.target.trim()) return;
    setState((s) => ({
      ...s,
      servers: [
        ...s.servers,
        {
          ...server,
          id: uid(),
          enabled: true,
          status: "connected",
          tools: 3 + Math.floor(Math.random() * 18),
        },
      ],
    }));
  }, []);

  const toggleServer = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      servers: s.servers.map((srv) =>
        srv.id === id
          ? {
              ...srv,
              enabled: !srv.enabled,
              status: !srv.enabled ? "connected" : "disconnected",
            }
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
