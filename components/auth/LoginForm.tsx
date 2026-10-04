"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { readErrorMessage } from "@/lib/client/api";
import { useHydrated } from "@/lib/client/use-hydrated";
import { safeNextPath } from "@/lib/validation/redirect";

export function LoginForm({ next }: { next?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Until JS is ready, submission is impossible: a native fallback submit must never
  // send credentials (and GET would put them in the URL).
  const hydrated = useHydrated();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      if (!res.ok) {
        setError(await readErrorMessage(res, "Invalid email or password."));
        return;
      }
      // Full navigation so server components pick up the new session cookies.
      window.location.assign(safeNextPath(next));
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-5" noValidate>
      <h1 className="text-2xl font-semibold text-slate-900">Sign in</h1>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
          {error}
        </p>
      )}
      <Input label="Email" name="email" type="email" autoComplete="email" required maxLength={254} />
      <Input label="Password" name="password" type="password" autoComplete="current-password" required maxLength={128} />
      <Button type="submit" loading={loading} disabled={!hydrated} className="w-full">
        Sign in
      </Button>
      <p className="text-center text-sm text-slate-600">
        No account?{" "}
        <Link href="/signup" className="font-semibold text-indigo-700 hover:underline">
          Create one
        </Link>
      </p>
    </form>
  );
}
