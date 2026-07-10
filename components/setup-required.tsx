import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { missingEnvVars, requiredSetupEnvVars } from "@/lib/env";

export function SetupRequired() {
  const missing = missingEnvVars();

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="brand setup-brand">
          <span className="brand-mark">
            <AlertTriangle size={18} />
          </span>
          <span>Setup required</span>
        </div>
        <h1>Connect your services</h1>
        <p>
          The app is installed, but it needs environment variables before auth,
          research, and council runs can work.
        </p>
        <div className="stack">
          <div className="panel">
            <h2>Missing now</h2>
            <div className="pill-row">
              {(missing.length ? missing : ["All required keys are present"]).map((name) => (
                <span className="pill" key={name}>
                  {missing.length ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                  {name}
                </span>
              ))}
            </div>
          </div>
          <div className="panel">
            <h2>Create `.env.local`</h2>
            <pre className="code-block">{requiredSetupEnvVars.map((name) => `${name}=`).join("\n")}</pre>
          </div>
          <p className="muted">
            After saving `.env.local`, stop and restart `npm run dev` so Next.js
            picks up the new values.
          </p>
        </div>
      </section>
    </main>
  );
}
