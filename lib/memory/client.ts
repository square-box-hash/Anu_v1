"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as firestoreLimit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { noteIdFrom, noteSummary } from "./types";
import type { Draft, Note, Operation } from "./types";

/**
 * Firestore access for the notebook. Stage 1 writes from the browser, under
 * rules that only ever let the owner touch their own path — the spec's own
 * fallback, because this deployment has no Admin service account. When one
 * exists, these four functions move behind an API route and nothing else
 * changes.
 */

const notesPath = (uid: string, chatId: string) => collection(db, "users", uid, "chats", chatId, "notes");
const draftsPath = (uid: string, chatId: string) => collection(db, "users", uid, "chats", chatId, "drafts");

export async function listChatNotes(uid: string, chatId: string): Promise<Note[]> {
  const snap = await getDocs(query(notesPath(uid, chatId), orderBy("updatedAt", "desc"), firestoreLimit(60)));
  return snap.docs.map((entry) => ({ ...(entry.data() as Note), id: entry.id }));
}

export async function listDrafts(uid: string, chatId: string): Promise<Draft[]> {
  const snap = await getDocs(
    query(draftsPath(uid, chatId), where("status", "==", "pending"), firestoreLimit(20)),
  );
  return snap.docs.map((entry) => ({ ...(entry.data() as Draft), id: entry.id }));
}

export async function saveDraft(uid: string, chatId: string, draft: Omit<Draft, "id" | "at">): Promise<string> {
  const ref = doc(draftsPath(uid, chatId));
  await setDoc(ref, {
    ...draft,
    chatId,
    at: Date.now(),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function markDraft(uid: string, chatId: string, draftId: string, patch: Partial<Draft>): Promise<void> {
  await updateDoc(doc(db, "users", uid, "chats", chatId, "drafts", draftId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

/** The operations the sync model asked for, applied with a version check per note. */
export async function applyOperations(
  uid: string,
  chatId: string,
  operations: Operation[],
): Promise<string[]> {
  const touched: string[] = [];

  for (const operation of operations) {
    if (operation.op === "no_op") continue;

    if (operation.op === "create_note") {
      const id = noteIdFrom(operation.title);
      const ref = doc(notesPath(uid, chatId), id);
      const existing = await getDoc(ref);
      const now = Date.now();
      const note: Note = {
        id,
        scope: "chat",
        title: operation.title,
        aliases: [],
        summary: operation.summary,
        facts: operation.facts.map((fact) => ({
          text: fact.text,
          tag: fact.tag,
          chatId,
          at: now,
        })),
        links: [],
        history: [],
        pinned: false,
        chatId,
        createdAt: existing.exists() ? (existing.data().createdAt ?? now) : now,
        updatedAt: now,
        version: existing.exists() ? (existing.data().version ?? 0) + 1 : 1,
      };
      await setDoc(ref, { ...note, updatedAtServer: serverTimestamp() }, { merge: false });
      touched.push(id);
      continue;
    }

    const ref = doc(notesPath(uid, chatId), operation.noteId);
    const snap = await getDoc(ref);
    if (!snap.exists()) continue;
    const note = snap.data() as Note;
    const now = Date.now();
    const next: Partial<Note> = { updatedAt: now, version: (note.version ?? 0) + 1 };
    const facts = [...(note.facts ?? [])];
    const history = [...(note.history ?? [])];

    if (operation.op === "append_fact") {
      facts.push({ text: operation.text, tag: operation.tag, chatId, at: now });
      next.facts = facts;
    } else if (operation.op === "supersede_fact") {
      const index = facts.findIndex((fact) => fact.text === operation.replaces);
      if (index >= 0) {
        history.push({ text: facts[index].text, replacedAt: now });
        facts[index] = { text: operation.text, tag: operation.tag, chatId, at: now };
      } else {
        facts.push({ text: operation.text, tag: operation.tag, chatId, at: now });
      }
      next.facts = facts;
      next.history = history;
    } else if (operation.op === "update_summary") {
      next.summary = operation.summary;
    } else if (operation.op === "add_link") {
      const links = [...(note.links ?? [])];
      if (!links.some((link) => link.to === operation.to)) {
        links.push({
          to: operation.to,
          reason: operation.reason,
          type: operation.type,
          confidence: operation.confidence,
        });
        next.links = links;
      }
    }

    await updateDoc(ref, next as Record<string, unknown>);
    touched.push(operation.noteId);
  }

  return touched;
}

/** The one-line notes the model and the panel both read. */
export function noteIndex(notes: Note[]): { id: string; title: string; summary: string; pinned: boolean }[] {
  return notes.map((note) => ({
    id: note.id,
    title: note.title,
    summary: noteSummary(note),
    pinned: Boolean(note.pinned),
  }));
}
