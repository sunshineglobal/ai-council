import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { SetupRequired } from "@/components/setup-required";
import { getCurrentProfile } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!hasSupabaseEnv()) return <SetupRequired />;

  const profile = await getCurrentProfile();
  if (profile) redirect("/app");
  const { error } = await searchParams;

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <h1>AI Council</h1>
        <p>Sign in with an invited email address to use your private model council.</p>
        {error === "auth_callback_failed" ? (
          <p className="error-text" role="alert">The sign-in link could not be verified. Request a new link.</p>
        ) : null}
        <LoginForm />
      </section>
    </main>
  );
}
