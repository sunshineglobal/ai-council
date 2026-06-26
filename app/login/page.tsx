import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { SetupRequired } from "@/components/setup-required";
import { getCurrentProfile } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";

export default async function LoginPage() {
  if (!hasSupabaseEnv()) return <SetupRequired />;

  const profile = await getCurrentProfile();
  if (profile) redirect("/app");

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <h1>AI Council</h1>
        <p>Sign in with an invited email address to use your private model council.</p>
        <LoginForm />
      </section>
    </main>
  );
}
