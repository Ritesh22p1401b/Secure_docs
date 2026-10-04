"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { readErrorMessage } from "@/lib/client/api";
import { useHydrated } from "@/lib/client/use-hydrated";
import { PASSWORD_MAX, PASSWORD_MIN, signupSchema } from "@/lib/validation/schemas";

type FieldErrors = Partial<Record<"email" | "password" | "confirm", string>>;

export function SignupForm() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Until JS is ready, submission is impossible: a native fallback submit must never
  // send credentials (and GET would put them in the URL).
  const hydrated = useHydrated();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const form = new FormData(e.currentTarget);
    const input = { email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") };

    // Client-side checks are for UX only; the server re-validates everything.
    const parsed = signupSchema.safeParse(input);
    const next: FieldErrors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if ((key === "email" || key === "password") && !next[key]) next[key] = issue.message;
      }
    }
    if (form.get("confirm") !== input.password) next.confirm = "Passwords do not match.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        setFormError(await readErrorMessage(res));
        return;
      }
      // Full navigation: auth cookies changed, so drop all client state.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/dashboard");
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-5" noValidate>
      <h1 className="text-2xl font-semibold text-slate-900">Create your account</h1>
      {formError && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
          {formError}
        </p>
      )}
      <Input label="Email" name="email" type="email" autoComplete="email" required maxLength={254} error={errors.email} />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN}
        maxLength={PASSWORD_MAX}
        error={errors.password}
        hint={`At least ${PASSWORD_MIN} characters. A long passphrase is best.`}
      />
      <Input label="Confirm password" name="confirm" type="password" autoComplete="new-password" required maxLength={PASSWORD_MAX} error={errors.confirm} />
      <Button type="submit" loading={loading} disabled={!hydrated} className="w-full">
        Create account
      </Button>
      <p className="text-center text-sm text-slate-600">
        Already registered?{" "}
        <Link href="/login" className="font-semibold text-indigo-700 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
