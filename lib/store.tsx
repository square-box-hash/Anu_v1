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
import {
  DEFAULT_MODEL,
  DEFAULT_ORCHESTRATION_CONFIG,
  DEFAULT_ROLE_ASSIGNMENTS,
} from "./models";
import type {
  Attachment,
  Chat,
  ChatRequest,
  CustomModelConfig,
  HarnessConfig,
  McpServer,
  Message,
  OrchestrationConfig,
  QuoteRef,
  RepoSkill,
  Usage,
  RoutingInfo,
  Settings,
  Skill,
  ToolCall,
} from "./types";
import { titleFrom, uid } from "./utils";

const STORAGE_PREFIX = "nebula.chat.v2";

function storageKeyFor(userId: string | undefined): string {
  return userId ? `${STORAGE_PREFIX}.${userId}` : `${STORAGE_PREFIX}.anon`;
}

/**
 * Write a snapshot of the store to localStorage. Chat history lives here first —
 * Firestore is only ever a mirror — so a full quota must degrade gracefully
 * instead of losing everything.
 */
function writeLocalSnapshot(key: string, payload: string): boolean {
  try {
    localStorage.setItem(key, payload);
    return true;
  } catch {
    /* most likely QuotaExceededError — fall through and trim */
  }

  try {
    const parsed = JSON.parse(payload) as Persisted;
    let chats = [...parsed.chats].sort((a, b) => b.updatedAt - a.updatedAt);

    while (chats.length > 1) {
      chats = chats.slice(0, Math.max(1, Math.floor(chats.length * 0.75)));
      try {
        localStorage.setItem(key, JSON.stringify({ ...parsed, chats }));
        console.warn(`[anu] Local storage is full — kept the ${chats.length} most recent chats.`);
        return true;
      } catch {
        /* keep trimming */
      }
    }

    localStorage.setItem(key, JSON.stringify({ ...parsed, chats: [], activeId: null }));
    console.warn("[anu] Local storage is full — cleared the local chat cache.");
    return true;
  } catch (error) {
    console.error("[anu] Could not write chat history to local storage:", error);
    return false;
  }
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
      autoRoute: false,
      orchestration: {
        ...DEFAULT_ORCHESTRATION_CONFIG,
        roles: { ...DEFAULT_ROLE_ASSIGNMENTS },
      },
      customModels: [],
    },
  };
}

function mergeSettings(raw?: Partial<Settings>): Settings {
  const base = defaults().settings;
  return {
    ...base,
    ...raw,
    orchestration: {
      ...base.orchestration,
      ...(raw?.orchestration ?? {}),
      roles: {
        ...base.orchestration.roles,
        ...(raw?.orchestration?.roles ?? {}),
      },
    },
    customModels: Array.isArray(raw?.customModels) ? raw.customModels : [],
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
        model: m.model,
        routing: m.routing,
        thinking: m.thinking,
        attachments: m.attachments?.map(({ id, name, size, type }) => ({ id, name, size, type })),
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
  /** Text the user highlighted, waiting to be sent with the next message. */
  pendingQuote: QuoteRef | null;
  setQuote: (quote: QuoteRef | null) => void;
  createChat: () => string;
  selectChat: (id: string) => void;
  deleteChat: (id: string) => void;
  renameChat: (id: string, title: string) => void;
  clearAll: () => void;
  send: (text: string, attachments?: Attachment[]) => Promise<void>;
  sendLiveAudio: (
    audioBase64: string,
    mode: "voice" | "translate",
    onAudioChunk: (base64Pcm24k: string) => void,
  ) => Promise<void>;
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
  updateOrchestration: (patch: Partial<OrchestrationConfig>) => void;
  addCustomModel: (model: CustomModelConfig) => void;
  removeCustomModel: (id: string) => void;
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
  const [pendingQuote, setPendingQuote] = useState<QuoteRef | null>(null);
  const pendingQuoteRef = useRef<QuoteRef | null>(null);
  pendingQuoteRef.current = pendingQuote;
  const stateRef = useRef(state);
  const abortRef = useRef(false);
  const profileReadyRef = useRef<Promise<void> | null>(null);
  const knownCloudIdsRef = useRef<Set<string>>(new Set());
  const titledChatIdsRef = useRef<Set<string>>(new Set());
  const deletedChatIdsRef = useRef<Set<string>>(new Set());

  const userIdRef = useRef<string | undefined>(userId);
  userIdRef.current = userId;

  // Local writes are debounced: during streaming, `state` changes on every token.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingKeyRef = useRef<string | null>(null);

  /** Write any pending snapshot immediately (tab hidden, unmount, account switch). */
  const flushLocal = useCallback(() => {
    if (!saveTimerRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;

    const key = pendingKeyRef.current ?? storageKeyFor(userIdRef.current);
    pendingKeyRef.current = null;
    try {
      writeLocalSnapshot(key, JSON.stringify(stateRef.current));
    } catch {
      /* nothing more we can do here */
    }
  }, []);

  stateRef.current = state;

  // Load user-scoped localStorage state when active user changes
  useEffect(() => {
    // Don't strand an unwritten snapshot on the account that is being switched out.
    flushLocal();
    setHydrated(false);
    knownCloudIdsRef.current = new Set();
    deletedChatIdsRef.current = new Set();
    let initial = defaults();
    try {
      const raw = localStorage.getItem(storageKeyFor(userId));
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Persisted>;
        initial = {
          ...initial,
          ...parsed,
          settings: mergeSettings(parsed.settings),
        };
      }
    } catch {
      /* ignore corrupt storage */
    }
    setState(initial);
    setHydrated(true);
  }, [userId, flushLocal]);

  // Persist state to user-scoped localStorage, debounced so a streaming turn
  // doesn't serialise the whole store on every delta.
  useEffect(() => {
    if (!hydrated) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    pendingKeyRef.current = storageKeyFor(userId);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      const key = pendingKeyRef.current ?? storageKeyFor(userIdRef.current);
      pendingKeyRef.current = null;
      try {
        writeLocalSnapshot(key, JSON.stringify(stateRef.current));
      } catch {
        /* ignore */
      }
    }, 350);
  }, [state, hydrated, userId]);

  // A reload or a closed tab must not lose the turn that was still streaming.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushLocal();
    };
    window.addEventListener("pagehide", flushLocal);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flushLocal);
      document.removeEventListener("visibilitychange", onVisibility);
      flushLocal();
    };
  }, [flushLocal]);

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
        const prevKnownIds = knownCloudIdsRef.current;
        knownCloudIdsRef.current = ids;
        for (const deletedId of [...deletedChatIdsRef.current]) {
          if (!ids.has(deletedId)) deletedChatIdsRef.current.delete(deletedId);
        }

        setState((prev) => {
          // Preserve any chat currently streaming locally so live tokens are never overwritten
          const pendingMap = new Map(
            prev.chats.filter((c) => c.messages.some((m) => m.pending)).map((c) => [c.id, c]),
          );
          const mergedMap = new Map<string, Chat>();
          for (const c of cloudChats) {
            if (!deletedChatIdsRef.current.has(c.id)) {
              mergedMap.set(c.id, c);
            }
          }
          for (const c of prev.chats) {
            if (deletedChatIdsRef.current.has(c.id)) continue;
            if (pendingMap.has(c.id)) {
              mergedMap.set(c.id, pendingMap.get(c.id)!);
              continue;
            }
            const existingCloud = mergedMap.get(c.id);
            if (existingCloud) {
              if (c.updatedAt > existingCloud.updatedAt || c.messages.length > existingCloud.messages.length) {
                mergedMap.set(c.id, c);
              }
            } else if (!prevKnownIds.has(c.id)) {
              // Preserve local chats not yet committed to cloud (including failed turns or offline chats)
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
      deletedChatIdsRef.current.add(id);
      const wasInCloud = knownCloudIdsRef.current.has(id);
      knownCloudIdsRef.current.delete(id);
      setState((s) => {
        const chats = s.chats.filter((c) => c.id !== id);
        return { ...s, chats, activeId: s.activeId === id ? chats[0]?.id ?? null : s.activeId };
      });
      if (user && canCloudSync && wasInCloud) {
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

  /**
   * Names a chat from its first exchange, at most 5 words, on the smallest fast
   * model. Runs once per chat, only while the title is still the auto-derived
   * one — so a user rename is never overwritten.
   */
  const maybeTitleChat = useCallback(
    async (chatId: string) => {
      if (titledChatIdsRef.current.has(chatId)) return;
      const chat = stateRef.current.chats.find((c) => c.id === chatId);
      if (!chat) return;

      const userTurns = chat.messages.filter((m) => m.role === "user");
      const answered = chat.messages.filter(
        (m) => m.role === "assistant" && !m.error && !m.pending && m.content.trim().length > 0,
      );
      if (userTurns.length !== 1 || answered.length !== 1) return;

      // Untouched? Only then is this our title to replace.
      const derived = titleFrom(userTurns[0].content || "New chat");
      if (chat.title !== derived) return;

      titledChatIdsRef.current.add(chatId);
      try {
        const res = await fetch("/api/title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: chat.messages.slice(0, 2).map((m) => ({
              role: m.role,
              content: m.content.slice(0, 1200),
            })),
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { title?: string | null };
        const title = data.title?.trim();
        if (!title) return;

        // The user may have renamed the chat while the model was answering.
        const current = stateRef.current.chats.find((c) => c.id === chatId);
        if (!current || current.title !== derived) return;
        renameChat(chatId, title);
      } catch {
        /* a title is cosmetic — never surface a failure for it */
      }
    },
    [renameChat],
  );

  const clearAll = useCallback(() => {
    const idsToDelete = [...knownCloudIdsRef.current];
    for (const id of idsToDelete) deletedChatIdsRef.current.add(id);
    knownCloudIdsRef.current.clear();
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
        .map((m) => ({
          role: m.role,
          // A quoted highlight travels with the message it was written under.
          content: m.quote ? `> ${m.quote.text.replace(/\n/g, "\n> ")}\n\n${m.content}` : m.content,
        })),
      model: s.settings.model,
      autoRoute: s.settings.autoRoute,
      systemPrompt: s.settings.systemPrompt,
      temperature: s.settings.temperature,
      attachments: messages
        .flatMap((m) => m.attachments ?? [])
        .map((a) => ({ name: a.name, type: a.type, size: a.size, textContent: a.textContent })),
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
      orchestration: s.settings.orchestration,
      customModels: s.settings.customModels,
    };
  }, []);

  const runTurn = useCallback(
    async (chatId: string, botId: string, payload: ChatRequest, seedChat?: Chat) => {
      abortRef.current = false;
      setStreaming(true);

      let acc = "";
      let think = "";
      let hadError = false;
      let latestModel: string | undefined;
      let latestRouting: RoutingInfo | undefined;
      const calls: ToolCall[] = [];
      const notices: string[] = [];

      const buildFinalizedChat = (finalPatch: Partial<Message>): Chat | undefined => {
        const base = stateRef.current.chats.find((c) => c.id === chatId) ?? seedChat;
        if (!base) return undefined;
        return {
          ...base,
          updatedAt: Date.now(),
          messages: base.messages.map((m) => (m.id === botId ? { ...m, ...finalPatch } : m)),
        };
      };

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
            case "meta": {
              const route = (event as unknown as { route?: RoutingInfo }).route;
              if (route) {
                latestModel = route.selectedModel;
                latestRouting = route;
                patchMessage(chatId, botId, { model: route.selectedModel, routing: route });
              }
              return;
            }
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
            case "usage": {
              const usage = (event as unknown as { usage?: Usage }).usage;
              if (usage) patchMessage(chatId, botId, { usage });
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
            hadError = true;
            acc += `${acc ? "\n\n" : ""}**Request failed.** ${text}`;
            patchMessage(chatId, botId, { content: acc, error: true });
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
        const raw = error instanceof Error ? error.message : "Something went wrong.";
        // A body that dies mid-stream surfaces as the browser's own TypeError,
        // which says nothing useful. Name the likely cause instead.
        const dropped = /network error|failed to fetch|load failed|networkerror|terminated|other side closed/i.test(
          raw,
        );
        const message = dropped
          ? "The connection dropped before the answer arrived. That usually means the model was still thinking and something between your browser and the server gave up waiting — try again, or pick a faster model."
          : raw;
        const errorPatch: Partial<Message> = {
          content: acc ? `${acc}\n\n**Request failed.** ${message}` : `**Request failed.** ${message}`,
          thinking: think || undefined,
          model: latestModel,
          routing: latestRouting,
          toolCalls: calls.length ? [...calls] : undefined,
          notices: notices.length ? [...notices] : undefined,
          pending: false,
          error: true,
        };
        patchMessage(chatId, botId, errorPatch);
        setStreaming(false);
        const latestChat = buildFinalizedChat(errorPatch);
        if (latestChat) void syncChatToCloud(latestChat).catch(() => {});
        return;
      }

      const thinking = think.trim() ? think : undefined;
      const finalPatch: Partial<Message> = {
        content: abortRef.current
          ? `${acc}\n\n_Stopped._`
          : !acc.trim()
            ? "_The model returned an empty response._"
            : acc,
        thinking,
        model: latestModel,
        routing: latestRouting,
        toolCalls: calls.length ? [...calls] : undefined,
        notices: notices.length ? [...notices] : undefined,
        pending: false,
        ...(hadError ? { error: true } : {}),
      };
      patchMessage(chatId, botId, finalPatch);
      setStreaming(false);

      const latestChat = buildFinalizedChat(finalPatch);
      if (latestChat) void syncChatToCloud(latestChat).catch(() => {});
      if (!hadError && !abortRef.current) void maybeTitleChat(chatId);
    },
    [patchMessage, syncChatToCloud, maybeTitleChat],
  );

  const send = useCallback(
    async (text: string, attachments: Attachment[] = []) => {
      const trimmed = text.trim();
      if (!trimmed && attachments.length === 0) return;

      const cur = stateRef.current;
      const existingChat = cur.activeId ? cur.chats.find((c) => c.id === cur.activeId) : undefined;
      const chatId = existingChat?.id ?? cur.activeId ?? uid();
      deletedChatIdsRef.current.delete(chatId);

      const now = Date.now();
      const quote = pendingQuoteRef.current ?? null;
      if (quote) setPendingQuote(null);
      const userMsg: Message = {
        id: uid(),
        role: "user",
        content: trimmed,
        attachments,
        quote: quote ?? undefined,
        createdAt: now,
      };
      const botMsg: Message = { id: uid(), role: "assistant", content: "", createdAt: now + 1, pending: true };

      const seedChat: Chat = existingChat
        ? {
            ...existingChat,
            title:
              existingChat.messages.length === 0
                ? titleFrom(trimmed || attachments[0]?.name || "New chat")
                : existingChat.title,
            messages: [...existingChat.messages, userMsg, botMsg],
            updatedAt: now,
          }
        : {
            id: chatId,
            title: titleFrom(trimmed || attachments[0]?.name || "New chat"),
            messages: [userMsg, botMsg],
            createdAt: now,
            updatedAt: now,
          };

      setState((s) => {
        const existing = s.chats.find((c) => c.id === chatId);
        if (!existing) {
          return { ...s, chats: [seedChat, ...s.chats], activeId: chatId };
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

      const history = [...(existingChat?.messages ?? []), userMsg];
      await runTurn(chatId, botMsg.id, buildRequest(history), seedChat);
    },
    [buildRequest, runTurn, setPendingQuote],
  );

  const sendLiveAudio = useCallback(
    async (
      audioBase64: string,
      mode: "voice" | "translate",
      onAudioChunk: (base64Pcm24k: string) => void,
    ) => {
      if (!audioBase64) return;
      const cur = stateRef.current;
      const chatId = cur.activeId ?? uid();
      const now = Date.now();
      const targetLang = cur.settings.orchestration.translateTargetLanguage || "es";
      const liveModel = mode === "translate" ? "gemini-3.5-live-translate-preview" : "gemini-3.8-live";

      const userMsg: Message = {
        id: uid(),
        role: "user",
        content: mode === "translate" ? `[Voice message for translation → ${targetLang}]` : "[Voice message]",
        createdAt: now,
      };
      const botMsg: Message = {
        id: uid(),
        role: "assistant",
        model: liveModel,
        routing: {
          requestedModel: liveModel,
          selectedModel: liveModel,
          category: mode === "translate" ? "live_translation" : "live_voice",
          complexity: "realtime",
          reason: mode === "translate" ? `Live speech translation → ${targetLang}` : "Live audio session",
          steps: [`Live API (${liveModel})`],
        },
        content: "",
        createdAt: now + 1,
        pending: true,
      };

      const existingChat = cur.activeId ? cur.chats.find((c) => c.id === cur.activeId) : undefined;
      const seedChat: Chat = existingChat
        ? { ...existingChat, messages: [...existingChat.messages, userMsg, botMsg], updatedAt: now }
        : {
            id: chatId,
            title: mode === "translate" ? `Live Translate (${targetLang})` : "Voice Session",
            messages: [userMsg, botMsg],
            createdAt: now,
            updatedAt: now,
          };

      deletedChatIdsRef.current.delete(chatId);
      setState((s) => {
        const existing = s.chats.find((c) => c.id === chatId);
        if (!existing) {
          return { ...s, chats: [seedChat, ...s.chats], activeId: chatId };
        }
        return {
          ...s,
          activeId: chatId,
          chats: s.chats.map((c) =>
            c.id === chatId
              ? { ...c, messages: [...c.messages, userMsg, botMsg], updatedAt: now }
              : c,
          ),
        };
      });

      setStreaming(true);
      let inputTranscript = "";
      let outputText = "";
      let finalLivePatch: Partial<Message> = { content: "_Audio response played._", pending: false };

      try {
        const res = await fetch("/api/live", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            audioBase64,
            targetLanguageCode: targetLang,
            systemPrompt: cur.settings.systemPrompt,
          }),
        });
        if (!res.ok || !res.body) {
          throw new Error(`Live request failed (${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const handleLiveLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed) return;
          try {
            const evt = JSON.parse(trimmed) as {
              type?: string;
              text?: string;
              data?: string;
            };
            if (evt.type === "audio" && evt.data) {
              onAudioChunk(evt.data);
            } else if (evt.type === "input_transcript" && evt.text) {
              inputTranscript += evt.text;
              patchMessage(chatId, userMsg.id, { content: inputTranscript.trim() });
            } else if ((evt.type === "output_transcript" || evt.type === "text") && evt.text) {
              outputText += evt.text;
              patchMessage(chatId, botMsg.id, { content: outputText.trim(), pending: true });
            } else if (evt.type === "error" && evt.text) {
              outputText += `${outputText ? "\n\n" : ""}**Live error:** ${evt.text}`;
              patchMessage(chatId, botMsg.id, { content: outputText, error: true });
            }
          } catch {
            /* ignore partial line */
          }
        };

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) handleLiveLine(line);
        }
        buffer += decoder.decode();
        if (buffer.trim()) handleLiveLine(buffer);

        finalLivePatch = {
          content: outputText.trim() || "_Audio response played._",
          pending: false,
        };
        patchMessage(chatId, botMsg.id, finalLivePatch);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Live voice request failed.";
        finalLivePatch = {
          content: `**Live audio error.** ${msg}`,
          pending: false,
          error: true,
        };
        patchMessage(chatId, botMsg.id, finalLivePatch);
      } finally {
        setStreaming(false);
        const baseChat = stateRef.current.chats.find((c) => c.id === chatId) ?? seedChat;
        const finalizedChat: Chat = {
          ...baseChat,
          updatedAt: Date.now(),
          messages: baseChat.messages.map((m) => {
            if (m.id === userMsg.id && inputTranscript.trim()) {
              return { ...m, content: inputTranscript.trim() };
            }
            if (m.id === botMsg.id) return { ...m, ...finalLivePatch };
            return m;
          }),
        };
        void syncChatToCloud(finalizedChat).catch(() => {});
      }
    },
    [patchMessage, syncChatToCloud],
  );

  const regenerate = useCallback(async () => {
    const cur = stateRef.current;
    const chat = cur.chats.find((c) => c.id === cur.activeId);
    if (!chat) return;

    const roles = chat.messages.map((m) => m.role);
    const lastUserIndex = roles.lastIndexOf("user");
    if (lastUserIndex < 0) return;

    const kept = chat.messages.slice(0, lastUserIndex + 1);
    const now = Date.now();
    const botMsg: Message = { id: uid(), role: "assistant", content: "", createdAt: now, pending: true };
    const seedChat: Chat = { ...chat, messages: [...kept, botMsg], updatedAt: now };

    setState((s) => ({
      ...s,
      chats: s.chats.map((c) =>
        c.id === chat.id ? { ...c, messages: [...kept, botMsg], updatedAt: now } : c,
      ),
    }));

    await runTurn(chat.id, botMsg.id, buildRequest(kept), seedChat);
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

  const updateOrchestration = useCallback((patch: Partial<OrchestrationConfig>) => {
    setState((s) => ({
      ...s,
      settings: {
        ...s.settings,
        orchestration: {
          ...s.settings.orchestration,
          ...patch,
          roles: {
            ...s.settings.orchestration.roles,
            ...(patch.roles ?? {}),
          },
        },
      },
    }));
  }, []);

  const addCustomModel = useCallback((model: CustomModelConfig) => {
    const cleanId = model.id.trim();
    if (!cleanId) return;
    setState((s) => {
      const next = s.settings.customModels.filter((m) => m.id !== cleanId);
      next.push({ ...model, id: cleanId });
      return {
        ...s,
        settings: { ...s.settings, customModels: next, model: cleanId },
      };
    });
  }, []);

  const removeCustomModel = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      settings: {
        ...s.settings,
        model: s.settings.model === id ? DEFAULT_MODEL : s.settings.model,
        customModels: s.settings.customModels.filter((m) => m.id !== id),
      },
    }));
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
      pendingQuote,
      setQuote: setPendingQuote,
      createChat,
      selectChat,
      deleteChat,
      renameChat,
      clearAll,
      send,
      sendLiveAudio,
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
      updateOrchestration,
      addCustomModel,
      removeCustomModel,
    }),
    [
      state,
      activeChat,
      repoSkills,
      toggleRepoSkill,
      refreshRepoSkills,
      streaming,
      hydrated,
      pendingQuote,
      createChat,
      selectChat,
      deleteChat,
      renameChat,
      clearAll,
      send,
      sendLiveAudio,
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
      updateOrchestration,
      addCustomModel,
      removeCustomModel,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
