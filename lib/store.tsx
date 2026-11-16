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
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { useAuth } from "./auth";
import { OperationType, db, handleFirestoreError } from "./firebase";
import { DEFAULT_MODEL } from "./types";
import type {
  Attachment,
  Chat,
  ChatRequest,
  HarnessConfig,
  McpServer,
  Message,
  RepoSkill,
  Settings,
  Skill,
  ToolCall,
} from "./types";
import { titleFrom, uid } from "./utils";

const STORAGE_PREFIX = "nebula.chat.v2";

function storageKeyFor(userId: string | undefined): string {
  return userId ? `${STORAGE_PREFIX}.${userId}` : `${STORAGE_PREFIX}.anon`;
}

interface Persisted {
  chats: Chat[];
  activeId: string | null;
  skills: Skill[];
  enabledRepoSkills: string[];
  servers: McpServer[];
  harness: HarnessConfig;
  settings: Settings;
}

function defaults(): Persisted {
  return {
    chats: [],
    activeId: null,
    skills: [],
    enabledRepoSkills: [],
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

/** Recursively strip undefined properties so Firestore writes never fail on optional keys. */
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

function sanitizeChatForFirestore(chat: Chat, userId: string) {
  const safeTitle = (chat.title.trim() || "New chat").slice(0, 200);
  const safeMessages = chat.messages
    .filter((m) => !m.pending)
    .slice(-500)
    .map((m) =>
      stripUndefined({
        id: m.id,
        role: m.role,
        content: m.content,
        thinking: m.thinking,
        attachments: m.attachments,
        toolCalls: m.toolCalls,
        notices: m.notices,
        createdAt: m.createdAt,
        error: m.error,
      }),
    );

  return {
    id: chat.id,
    userId,
    title: safeTitle,
    messages: safeMessages,
    clientCreatedAt: chat.createdAt || Date.now(),
    clientUpdatedAt: chat.updatedAt || Date.now(),
  };
}

async function ensureUserDocs(user: User): Promise<void> {
  const userPath = `users/${user.uid}`;
  const userRef = doc(db, "users", user.uid);
  const displayName = (user.displayName || user.email?.split("@")[0] || "User").slice(0, 120);
  const photoUrl = user.photoURL ? user.photoURL.slice(0, 500) : undefined;

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      const payload: Record<string, unknown> = {
        uid: user.uid,
        displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (photoUrl) payload.photoUrl = photoUrl;
      await setDoc(userRef, payload);
    } else {
      const existingData = snap.data();
      if (existingData.displayName !== displayName || (photoUrl && existingData.photoUrl !== photoUrl)) {
        const updatePayload: Record<string, unknown> = {
          displayName,
          updatedAt: serverTimestamp(),
        };
        if (photoUrl) updatePayload.photoUrl = photoUrl;
        await updateDoc(userRef, updatePayload);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  if (user.email) {
    const privatePath = `users/${user.uid}/private/info`;
    const privateRef = doc(db, "users", user.uid, "private", "info");
    try {
      const privSnap = await getDoc(privateRef);
      const email = user.email.slice(0, 320);
      if (!privSnap.exists()) {
        await setDoc(privateRef, {
          uid: user.uid,
          email,
          updatedAt: serverTimestamp(),
        });
      } else if (privSnap.data().email !== email) {
        await updateDoc(privateRef, {
          email,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, privatePath);
    }
  }
}

interface StoreValue extends Persisted {
  activeChat: Chat | null;
  repoSkills: RepoSkill[];
  toggleRepoSkill: (slug: string) => void;
  refreshRepoSkills: () => Promise<void>;
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
  const { user } = useAuth();
  const userId = user?.uid;
  const canCloudSync = Boolean(user && user.emailVerified);

  const [state, setState] = useState<Persisted>(defaults);
  const [streaming, setStreaming] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [repoSkills, setRepoSkills] = useState<RepoSkill[]>([]);
  const stateRef = useRef(state);
  const abortRef = useRef(false);
  const profileReadyRef = useRef<Promise<void> | null>(null);
  const knownCloudIdsRef = useRef<Set<string>>(new Set());

  stateRef.current = state;

  // Load user-scoped localStorage state when active user changes
  useEffect(() => {
    setHydrated(false);
    knownCloudIdsRef.current = new Set();
    let initial = defaults();
    try {
      const raw = localStorage.getItem(storageKeyFor(userId));
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Persisted>;
        initial = { ...initial, ...parsed };
      }
    } catch {
      /* ignore corrupt storage */
    }
    setState(initial);
    setHydrated(true);
  }, [userId]);

  // Persist state to user-scoped localStorage
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKeyFor(userId), JSON.stringify(state));
    } catch {
      /* storage full or blocked */
    }
  }, [state, hydrated, userId]);

  // Sync verified user's profile and chats with Firestore
  useEffect(() => {
    if (!user || !canCloudSync) {
      profileReadyRef.current = null;
      return;
    }

    const ready = ensureUserDocs(user).catch((err) => {
      console.error("Failed to initialize user profile in Firestore:", err);
    });
    profileReadyRef.current = ready;

    const chatsPath = `users/${user.uid}/chats`;
    const q = query(collection(db, "users", user.uid, "chats"), where("userId", "==", user.uid));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const cloudChats: Chat[] = [];
        const ids = new Set<string>();
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          ids.add(docSnap.id);
          cloudChats.push({
            id: String(data.id ?? docSnap.id),
            title: String(data.title ?? "New chat"),
            messages: Array.isArray(data.messages) ? (data.messages as Message[]) : [],
            createdAt: Number(data.clientCreatedAt ?? Date.now()),
            updatedAt: Number(data.clientUpdatedAt ?? Date.now()),
          });
        });
        knownCloudIdsRef.current = ids;

        setState((prev) => {
          // Preserve any chat currently streaming locally so live tokens are never overwritten
          const pendingMap = new Map(
            prev.chats.filter((c) => c.messages.some((m) => m.pending)).map((c) => [c.id, c]),
          );
          const mergedMap = new Map<string, Chat>();
          for (const c of cloudChats) mergedMap.set(c.id, c);
          for (const c of prev.chats) {
            if (pendingMap.has(c.id)) {
              mergedMap.set(c.id, pendingMap.get(c.id)!);
            } else if (!mergedMap.has(c.id) && c.messages.length === 0) {
              mergedMap.set(c.id, c);
            }
          }
          const merged = Array.from(mergedMap.values()).sort((a, b) => b.updatedAt - a.updatedAt);
          const nextActiveId =
            prev.activeId && merged.some((c) => c.id === prev.activeId) ? prev.activeId : merged[0]?.id ?? null;
          return { ...prev, chats: merged, activeId: nextActiveId };
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, chatsPath);
      },
    );

    return () => unsub();
  }, [user, canCloudSync]);

  const syncChatToCloud = useCallback(
    async (chat: Chat) => {
      if (!user || !canCloudSync) return;
      if (profileReadyRef.current) await profileReadyRef.current;

      const chatPath = `users/${user.uid}/chats/${chat.id}`;
      const chatRef = doc(db, "users", user.uid, "chats", chat.id);
      const sanitized = sanitizeChatForFirestore(chat, user.uid);

      try {
        if (knownCloudIdsRef.current.has(chat.id)) {
          await updateDoc(chatRef, {
            title: sanitized.title,
            messages: sanitized.messages,
            clientUpdatedAt: sanitized.clientUpdatedAt,
            updatedAt: serverTimestamp(),
          });
        } else {
          const existingSnap = await getDoc(chatRef);
          if (existingSnap.exists()) {
            knownCloudIdsRef.current.add(chat.id);
            await updateDoc(chatRef, {
              title: sanitized.title,
              messages: sanitized.messages,
              clientUpdatedAt: sanitized.clientUpdatedAt,
              updatedAt: serverTimestamp(),
            });
          } else {
            await setDoc(chatRef, {
              ...sanitized,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            knownCloudIdsRef.current.add(chat.id);
          }
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, chatPath);
      }
    },
    [user, canCloudSync],
  );

  const refreshRepoSkills = useCallback(async () => {
    try {
      const res = await fetch("/api/skills");
      const data = (await res.json()) as { skills?: RepoSkill[] };
      setRepoSkills(data.skills ?? []);
    } catch {
      /* leave the list as it was */
    }
  }, []);

  useEffect(() => {
    void refreshRepoSkills();
  }, [refreshRepoSkills]);

  const toggleRepoSkill = useCallback((slug: string) => {
    setState((s) => ({
      ...s,
      enabledRepoSkills: s.enabledRepoSkills.includes(slug)
        ? s.enabledRepoSkills.filter((item) => item !== slug)
        : [...s.enabledRepoSkills, slug],
    }));
  }, []);

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

  const deleteChat = useCallback(
    (id: string) => {
      setState((s) => {
        const chats = s.chats.filter((c) => c.id !== id);
        return { ...s, chats, activeId: s.activeId === id ? chats[0]?.id ?? null : s.activeId };
      });
      if (user && canCloudSync && knownCloudIdsRef.current.has(id)) {
        const chatPath = `users/${user.uid}/chats/${id}`;
        deleteDoc(doc(db, "users", user.uid, "chats", id)).catch((error) => {
          handleFirestoreError(error, OperationType.DELETE, chatPath);
        });
      }
    },
    [user, canCloudSync],
  );

  const renameChat = useCallback(
    (id: string, title: string) => {
      const nextTitle = title.trim();
      if (!nextTitle) return;
      let updatedChat: Chat | null = null;
      setState((s) => ({
        ...s,
        chats: s.chats.map((c) => {
          if (c.id === id) {
            updatedChat = { ...c, title: nextTitle, updatedAt: Date.now() };
            return updatedChat;
          }
          return c;
        }),
      }));
      if (updatedChat && user && canCloudSync && knownCloudIdsRef.current.has(id)) {
        void syncChatToCloud(updatedChat);
      }
    },
    [user, canCloudSync, syncChatToCloud],
  );

  const clearAll = useCallback(() => {
    const idsToDelete = [...knownCloudIdsRef.current];
    setState((s) => ({
      ...defaults(),
      skills: s.skills,
      enabledRepoSkills: s.enabledRepoSkills,
      servers: s.servers,
      harness: s.harness,
      settings: s.settings,
    }));
    if (user && canCloudSync && idsToDelete.length > 0) {
      const batch = writeBatch(db);
      for (const id of idsToDelete) {
        batch.delete(doc(db, "users", user.uid, "chats", id));
      }
      batch.commit().catch((error) => {
        handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/chats`);
      });
    }
  }, [user, canCloudSync]);

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
      repoSkills: s.enabledRepoSkills,
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
      const calls: ToolCall[] = [];
      const notices: string[] = [];
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

          switch (event.type) {
            case "tool_call": {
              const call = event as unknown as { id: string; server: string; name: string; args: unknown };
              calls.push({ id: call.id, server: call.server, name: call.name, args: call.args, pending: true });
              patchMessage(chatId, botId, { toolCalls: [...calls] });
              return;
            }
            case "tool_result": {
              const result = event as unknown as { id: string; ok: boolean; content: string; error?: string };
              const index = calls.findIndex((call) => call.id === result.id);
              if (index >= 0) {
                calls[index] = {
                  ...calls[index],
                  ok: result.ok,
                  content: result.content,
                  error: result.error,
                  pending: false,
                };
                patchMessage(chatId, botId, { toolCalls: [...calls] });
              }
              return;
            }
            case "notice": {
              const notice = (event as unknown as { text: string }).text;
              if (notice) {
                notices.push(notice);
                patchMessage(chatId, botId, { notices: [...notices] });
              }
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
        const latestChat = stateRef.current.chats.find((c) => c.id === chatId);
        if (latestChat) void syncChatToCloud(latestChat).catch(() => {});
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

      const latestChat = stateRef.current.chats.find((c) => c.id === chatId);
      if (latestChat) void syncChatToCloud(latestChat).catch(() => {});
    },
    [patchMessage, syncChatToCloud],
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
      repoSkills,
      toggleRepoSkill,
      refreshRepoSkills,
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
      repoSkills,
      toggleRepoSkill,
      refreshRepoSkills,
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
