import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth/SignupForm";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Create account · SecureDocs" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return <SignupForm />;
}
