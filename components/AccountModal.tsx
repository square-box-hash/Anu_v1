"use client";

import React, { useState } from "react";
import { formatAuthError, useAuth } from "@/lib/auth";
import { cx } from "@/lib/utils";
import { Check, Eye, EyeOff, Lock, LogOut, Refresh, ShieldCheck, X } from "./Icons";
import { inputClass } from "./ui";

export default function AccountModal({ onClose }: { onClose: () => void }) {
  const {
    user,
    hasGoogleProvider,
    hasGithubProvider,
    hasPasswordProvider,
    setupPassword,
    resendVerification,
    refreshUser,
    signOutUser,
  } = useAuth();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!user) return null;

  const passwordValid =
    newPassword.length >= 8 && /[a-zA-Z]/.test(newPassword) && /[0-9]/.test(newPassword);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!passwordValid) {
      setError("Password must be at least 8 characters and include both a letter and a number.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      await setupPassword(newPassword);
      setNewPassword("");
      setConfirmPassword("");
      setNotice(
        hasPasswordProvider
          ? "Password updated successfully."
          : "Password set up! You can now sign in with OAuth or email and password.",
      );
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleResendVerification = async () => {
    setError(null);
    setNotice(null);
    setVerifyBusy(true);
    try {
      await resendVerification();
      setNotice("Verification email sent. Check your inbox, then click Refresh status.");
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleRefresh = async () => {
    setError(null);
    setNotice(null);
    setVerifyBusy(true);
    try {
      await refreshUser();
      setNotice("Account status refreshed.");
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setVerifyBusy(false);
    }
  };

  const displayName = user.displayName || user.email?.split("@")[0] || "Account";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="glass ring-accent relative z-10 w-full max-w-[440px] animate-rise rounded-2xl border border-line p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-[22px] leading-tight text-ink">Account & Security</h2>
            <p className="mt-0.5 text-[12px] text-muted">{user.email ?? displayName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-white/5 hover:text-ink"
            aria-label="Close account modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3 rounded-xl border border-line bg-black/25 p-3">
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className="text-faint">Signed in as</span>
            <span className="truncate font-medium text-ink">{displayName}</span>
          </div>
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className="text-faint">Sign-in methods</span>
            <div className="flex items-center gap-1.5">
              {hasGoogleProvider && (
                <span className="rounded-full border border-line bg-white/[0.04] px-2 py-0.5 text-[10.5px] text-ink">
                  Google
                </span>
              )}
              {hasGithubProvider && (
                <span className="rounded-full border border-line bg-white/[0.04] px-2 py-0.5 text-[10.5px] text-ink">
                  GitHub
                </span>
              )}
              {hasPasswordProvider && (
                <span className="rounded-full border border-line bg-white/[0.04] px-2 py-0.5 text-[10.5px] text-ink">
                  Password
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className="text-faint">Email verification</span>
            {user.emailVerified ? (
              <span className="inline-flex items-center gap-1 text-[11.5px] text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" /> Verified (cloud sync active)
              </span>
            ) : (
              <span className="text-[11.5px] text-amber-300">Pending verification</span>
            )}
          </div>
        </div>

        {!user.emailVerified && (
          <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-[11.5px] leading-relaxed text-amber-100">
            <p>Verify your email address to enable cloud chat sync across devices.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={verifyBusy}
                onClick={() => void handleResendVerification()}
                className="rounded-lg border border-amber-300/40 bg-amber-300/15 px-2.5 py-1 text-[11px] font-medium text-amber-100 hover:bg-amber-300/25 disabled:opacity-50"
              >
                Resend verification email
              </button>
              <button
                type="button"
                disabled={verifyBusy}
                onClick={() => void handleRefresh()}
                className="inline-flex items-center gap-1 rounded-lg border border-line bg-black/30 px-2.5 py-1 text-[11px] text-ink hover:bg-white/10 disabled:opacity-50"
              >
                <Refresh className={cx("h-3 w-3", verifyBusy && "animate-spin")} />
                Refresh status
              </button>
            </div>
          </div>
        )}

        <form onSubmit={(e) => void handlePasswordSubmit(e)} className="mt-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">
              {hasPasswordProvider ? "Change password" : "Set up a password"}
            </span>
            {!hasPasswordProvider && (
              <span className="text-[10.5px] text-accent-soft">Required for email login</span>
            )}
          </div>

          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <input
              type={showPw ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={hasPasswordProvider ? "New password (8+ chars)" : "Create a password (8+ chars)"}
              autoComplete="new-password"
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

          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <input
              type={showPw ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              autoComplete="new-password"
              className={cx(inputClass, "pl-9")}
            />
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-200">
              {error}
            </div>
          )}

          {notice && (
            <div className="flex items-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-[11.5px] text-emerald-200">
              <Check className="h-3.5 w-3.5 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !newPassword}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-accent/40 bg-accent/15 py-2 text-[12px] font-medium text-accent-pale transition-colors hover:bg-accent/25 disabled:opacity-45"
          >
            {busy ? "Saving…" : hasPasswordProvider ? "Update password" : "Save password"}
          </button>
        </form>

        <div className="mt-4 border-t border-line pt-3">
          <button
            type="button"
            onClick={() => void signOutUser()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 py-2 text-[12px] font-medium text-rose-200 transition-colors hover:bg-rose-500/20"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
