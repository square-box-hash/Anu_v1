"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  linkWithCredential,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
} from "firebase/auth";
import type { User } from "firebase/auth";
import { auth, githubProvider, googleProvider, testFirestoreConnection } from "./firebase";

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  hasPasswordProvider: boolean;
  hasGoogleProvider: boolean;
  hasGithubProvider: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithGithub: () => Promise<void>;
  signUpWithEmail: (input: { email: string; password: string; displayName?: string }) => Promise<void>;
  signInWithEmail: (input: { email: string; password: string }) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  setupPassword: (newPassword: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshUser: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function formatAuthError(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
  switch (code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists. Try signing in instead.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password is too weak. Use at least 8 characters with letters and numbers.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password. Double-check your credentials and try again.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/popup-closed-by-user":
      return "Sign-in popup was closed before finishing.";
    case "auth/popup-blocked":
      return "Popup was blocked by your browser. Allow popups for this site and try again.";
    case "auth/account-exists-with-different-credential":
      return "An account already exists with this email using another sign-in method (try Google or email/password).";
    case "auth/requires-recent-login":
      return "For security, please sign out and sign back in before updating your password.";
    case "auth/operation-not-allowed":
      return "Email/Password sign-in is not enabled yet in your Firebase project. Enable it in Firebase Console → Authentication → Sign-in method.";
    case "auth/unauthorized-domain": {
      const host = typeof window !== "undefined" ? window.location.hostname : "this domain";
      return `The domain "${host}" is not authorized for Firebase Auth yet. Add it in Firebase Console → Authentication → Settings → Authorized domains.`;
    }
    case "auth/network-request-failed":
      return "Network error while contacting authentication service. Check your connection.";
    default:
      return error instanceof Error ? error.message : "Authentication failed. Please try again.";
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  useEffect(() => {
    void testFirestoreConnection();
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(auth, googleProvider);
  }, []);

  const signInWithGithub = useCallback(async () => {
    await signInWithPopup(auth, githubProvider);
  }, []);

  const signUpWithEmail = useCallback(
    async ({ email, password, displayName }: { email: string; password: string; displayName?: string }) => {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const cleanName = displayName?.trim();
      if (cleanName) {
        await updateProfile(cred.user, { displayName: cleanName.slice(0, 120) });
      }
      try {
        await sendEmailVerification(cred.user);
      } catch {
        /* verification email is best-effort; user can resend later */
      }
      setUser(auth.currentUser);
      setTick((t) => t + 1);
    },
    [],
  );

  const signInWithEmail = useCallback(async ({ email, password }: { email: string; password: string }) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  const setupPassword = useCallback(async (newPassword: string) => {
    const current = auth.currentUser;
    if (!current || !current.email) {
      throw new Error("You must be signed in with an email address to set a password.");
    }
    const alreadyHasPassword = current.providerData.some((p) => p.providerId === "password");
    if (alreadyHasPassword) {
      await updatePassword(current, newPassword);
    } else {
      const credential = EmailAuthProvider.credential(current.email, newPassword);
      await linkWithCredential(current, credential);
    }
    await current.reload();
    setUser(auth.currentUser);
    setTick((t) => t + 1);
  }, []);

  const resendVerification = useCallback(async () => {
    if (!auth.currentUser) return;
    await sendEmailVerification(auth.currentUser);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    setUser(auth.currentUser);
    setTick((t) => t + 1);
  }, []);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
  }, []);

  const providers = user?.providerData ?? [];
  const hasPasswordProvider = providers.some((p) => p.providerId === "password");
  const hasGoogleProvider = providers.some((p) => p.providerId === "google.com");
  const hasGithubProvider = providers.some((p) => p.providerId === "github.com");

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      hasPasswordProvider,
      hasGoogleProvider,
      hasGithubProvider,
      signInWithGoogle,
      signInWithGithub,
      signUpWithEmail,
      signInWithEmail,
      resetPassword,
      setupPassword,
      resendVerification,
      refreshUser,
      signOutUser,
    }),
    [
      user,
      loading,
      hasPasswordProvider,
      hasGoogleProvider,
      hasGithubProvider,
      signInWithGoogle,
      signInWithGithub,
      signUpWithEmail,
      signInWithEmail,
      resetPassword,
      setupPassword,
      resendVerification,
      refreshUser,
      signOutUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
