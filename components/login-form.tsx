"use client";

import { useState } from "react";
import { Mail, Send } from "lucide-react";
import { requestJson } from "@/lib/client-api";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setMessage("");

    try {
      await requestJson<{ ok: true }>("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      setStatus("sent");
      setMessage("Check your email for the sign-in link.");
    } catch (submitError) {
      setStatus("error");
      setMessage(submitError instanceof Error ? submitError.message : "Could not send a magic link.");
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        <span>Email address</span>
        <span className="input-icon-wrapper">
          <Mail aria-hidden className="input-icon" size={16} />
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="input-with-icon"
            placeholder="you@example.com"
          />
        </span>
      </label>
      <button className="button primary" disabled={status === "sending"} type="submit">
        <Send size={16} />
        {status === "sending" ? "Sending" : "Send magic link"}
      </button>
      {message ? (
        <p className={status === "error" ? "error-text" : "success-text"} role={status === "error" ? "alert" : "status"}>
          {message}
        </p>
      ) : null}
    </form>
  );
}
