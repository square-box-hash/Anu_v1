"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import {
  GithubAuthProvider,
  GoogleAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  inMemoryPersistence,
  setPersistence,
} from "firebase/auth";
import { doc, getDocFromServer, getFirestore } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

/**
 * How long a sign-in survives. `local` is the only mode that keeps you logged in
 * across a browser restart; `session` lasts until the tab closes; `memory` lasts
 * until reload (browsers in private mode, or with site storage blocked).
 */
export type PersistenceMode = "local" | "session" | "memory";

let persistencePromise: Promise<PersistenceMode> | null = null;

/**
 * Pin Firebase Auth to durable browser storage instead of relying on the SDK's
 * implicit default, which silently degrades to in-memory when storage is blocked
 * — the reason a reload could otherwise drop the session.
 */
export function ensureAuthPersistence(): Promise<PersistenceMode> {
  if (persistencePromise) return persistencePromise;

  persistencePromise = (async (): Promise<PersistenceMode> => {
    const attempts: [PersistenceMode, typeof browserLocalPersistence][] = [
      ["local", browserLocalPersistence],
      ["session", browserSessionPersistence],
    ];

    for (const [mode, impl] of attempts) {
      try {
        await setPersistence(auth, impl);
        return mode;
      } catch (error) {
        console.warn(`[anu] Firebase Auth could not use ${mode} persistence:`, error);
      }
    }

    try {
      await setPersistence(auth, inMemoryPersistence);
    } catch {
      /* nothing left to fall back to */
    }
    return "memory";
  })();

  return persistencePromise;
}
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
export const githubProvider = new GithubAuthProvider();
githubProvider.addScope("read:user");
githubProvider.addScope("user:email");

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let connectionTested = false;

export async function testFirestoreConnection(): Promise<void> {
  if (connectionTested) return;
  connectionTested = true;
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
