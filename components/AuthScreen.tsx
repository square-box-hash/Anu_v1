"use client";

import React, { useState } from "react";
import { formatAuthError, useAuth } from "@/lib/auth";
import { cx } from "@/lib/utils";
import Logo from "./Logo";
import { ArrowRight, Check, Eye, EyeOff, Lock, Mail, UserIcon } from "./Icons";
import { inputClass } from "./ui";

type Mode = "signin" | "signup" | "reset";

export default function AuthScreen() {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [busy, setBusy] = useState<"google" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  const passwordLongEnough = password.length >= 8;
  const passwordHasLetter = /[a-zA-Z]/.test(password);
  const passwordHasNumber = /[0-9]/.test(password);
  const passwordValid = passwordLongEnough && passwordHasLetter && passwordHasNumber;
  const passwordsMatch = password === confirmPassword;

  const handleGoogle = async () => {
    setError(null);
    setNotice(null);
    setBusy("google");
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setBusy(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    if (mode === "reset") {
      setBusy("email");
      try {
        await resetPassword(email);
        setNotice("Password reset link sent. Check your inbox and spam folder.");
      } catch (err) {
        setError(formatAuthError(err));
      } finally {
        setBusy(null);
      }
      return;
    }

    if (mode === "signup") {
      if (!passwordValid) {
        setError("Set a password with at least 8 characters, including a letter and a number.");
        return;
      }
      if (!passwordsMatch) {
        setError("Passwords do not match.");
        return;
      }
      setBusy("email");
      try {
        await signUpWithEmail({ email, password, displayName });
      } catch (err) {
        setError(formatAuthError(err));
      } finally {
        setBusy(null);
      }
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setBusy("email");
    try {
      await signInWithEmail({ email, password });
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center px-4 py-8">
      <div className="w-full max-w-[420px] animate-rise">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-panel/80 shadow-[0_0_32px_-10px_rgba(139,92,246,0.75)]">
            <Logo className="h-8 w-8" />
          </div>
          <h1 className="font-serif text-[34px] leading-[1.08] tracking-[-0.02em] text-ink">
            {mode === "signup" ? "Create your " : mode === "reset" ? "Reset your " : "Welcome back to "}
            <span className="italic bg-gradient-to-r from-accent-soft via-fuchsia-300 to-accent-pale bg-clip-text text-transparent">
              {mode === "reset" ? "password" : "Anu"}
            </span>
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            {mode === "signup"
              ? "Sign up with Google or register your email and set up a password."
              : mode === "reset"
                ? "Enter your email address and we'll send a password reset link."
                : "Sign in with Google or your email and password to open your workspace."}
          </p>
        </div>

        <div className="glass ring-accent rounded-2xl border border-line p-5 sm:p-6">
          {mode !== "reset" && (
            <>
              <div className="mb-4 grid grid-cols-2 rounded-xl border border-line bg-black/30 p-1">
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className={cx(
                    "rounded-lg py-1.5 text-[12px] font-medium transition-colors",
                    mode === "signin" ? "bg-accent/20 text-accent-pale" : "text-muted hover:text-ink",
                  )}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("signup")}
                  className={cx(
                    "rounded-lg py-1.5 text-[12px] font-medium transition-colors",
                    mode === "signup" ? "bg-accent/20 text-accent-pale" : "text-muted hover:text-ink",
                  )}
                >
                  Create account
                </button>
              </div>

              <button
                type="button"
                onClick={() => void handleGoogle()}
                disabled={busy !== null}
                className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-white/[0.04] px-4 py-2.5 text-[13px] font-medium text-ink transition-all hover:border-accent/50 hover:bg-accent/10 disabled:opacity-50"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-bold text-[#0b0912]">
                  G
                </span>
                {busy === "google" ? "Connecting to Google…" : "Continue with Google"}
              </button>

              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-line" />
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">or with email</span>
                <div className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
            {mode === "signup" && (
              <label className="block space-y-1.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">
                  Display name <span className="lowercase text-faint/60">(optional)</span>
                </span>
                <div className="relative">
                  <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Ada Lovelace"
                    maxLength={120}
                    autoComplete="name"
                    className={cx(inputClass, "pl-9")}
                  />
                </div>
              </label>
            )}

            <label className="block space-y-1.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">Email</span>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className={cx(inputClass, "pl-9")}
                />
              </div>
            </label>

            {mode !== "reset" && (
              <label className="block space-y-1.5">
                <span className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">
                    {mode === "signup" ? "Set up password" : "Password"}
                  </span>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => switchMode("reset")}
                      className="text-[11px] text-accent-soft transition-colors hover:text-accent-pale"
                    >
                      Forgot password?
                    </button>
                  )}
                </span>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    className={cx(inputClass, "pl-9 pr-9")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-faint hover:text-ink"
                    aria-label={showPw ? "Hide password" : "Show password"}
                  >
                    {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </label>
            )}

            {mode === "signup" && (
              <>
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">
                    Confirm password
                  </span>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
                    <input
                      type={showConfirmPw ? "text" : "password"}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      autoComplete="new-password"
                      className={cx(inputClass, "pl-9 pr-9")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPw((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-faint hover:text-ink"
                      aria-label={showConfirmPw ? "Hide confirmation password" : "Show confirmation password"}
                    >
                      {showConfirmPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </label>

                <div className="grid grid-cols-3 gap-1.5 pt-0.5 text-[10.5px]">
                  <span className={cx("flex items-center gap-1", passwordLongEnough ? "text-emerald-300" : "text-faint")}>
                    <Check className="h-3 w-3" /> 8+ chars
                  </span>
                  <span className={cx("flex items-center gap-1", passwordHasLetter ? "text-emerald-300" : "text-faint")}>
                    <Check className="h-3 w-3" /> Letter
                  </span>
                  <span className={cx("flex items-center gap-1", passwordHasNumber ? "text-emerald-300" : "text-faint")}>
                    <Check className="h-3 w-3" /> Number
                  </span>
                </div>
              </>
            )}

            {error && (
              <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-[12px] leading-relaxed text-rose-200">
                {error}
              </div>
            )}

            {notice && (
              <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-[12px] leading-relaxed text-emerald-200">
                {notice}
              </div>
            )}

            <button
              type="submit"
              disabled={busy !== null}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-medium text-white shadow-[0_0_26px_-8px_rgba(139,92,246,0.9)] transition-all hover:bg-accent-soft disabled:opacity-50"
            >
              {busy === "email"
                ? mode === "signup"
                  ? "Creating account…"
                  : mode === "reset"
                    ? "Sending link…"
                    : "Signing in…"
                : mode === "signup"
                  ? "Create account"
                  : mode === "reset"
                    ? "Send reset email"
                    : "Sign in"}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>

            {mode === "reset" && (
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className="w-full pt-1 text-center text-[12px] text-muted transition-colors hover:text-ink"
              >
                Back to sign in
              </button>
            )}
          </form>
        </div>

        <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-faint/70">
          Anu · Private Chat Workspace
        </p>
      </div>
    </div>
  );
}
