"use client";

import { useState } from "react";
import { Mail, Send } from "lucide-react";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setMessage("");

    const response = await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    if (response.ok) {
      setStatus("sent");
      setMessage("Check your email for the sign-in link.");
      return;
    }

    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setStatus("error");
    setMessage(body.error ?? "Could not send a magic link.");
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        <span>Email address</span>
        <span style={{ position: "relative" }}>
          <Mail aria-hidden size={16} style={{ left: 10, position: "absolute", top: 11 }} />
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            style={{ paddingLeft: 34 }}
            placeholder="you@example.com"
          />
        </span>
      </label>
      <button className="button primary" disabled={status === "sending"} type="submit">
        <Send size={16} />
        {status === "sending" ? "Sending" : "Send magic link"}
      </button>
      {message ? <p className={status === "error" ? "error-text" : "success-text"}>{message}</p> : null}
    </form>
  );
}
