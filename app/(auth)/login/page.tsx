import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { getCurrentUser } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/validation/redirect";

export const metadata: Metadata = { title: "Sign in · SecureDocs" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(typeof next === "string" ? next : undefined);
  if (await getCurrentUser()) redirect(nextPath);
  return <LoginForm next={nextPath} />;
}
