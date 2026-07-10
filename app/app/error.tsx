"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="page">
      <section className="panel stack" role="alert">
        <div className="section-title">
          <h1>Something went wrong</h1>
          <AlertTriangle aria-hidden size={18} />
        </div>
        <p className="muted">The workspace could not be loaded. Try the request again.</p>
        <button className="button primary" type="button" onClick={reset}>
          <RefreshCw aria-hidden size={16} />
          Try again
        </button>
      </section>
    </main>
  );
}
