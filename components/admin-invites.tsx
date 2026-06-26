"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

type Invite = {
  id: string;
  email: string;
  role: "admin" | "member";
  accepted_at: string | null;
  created_at: string;
};

export function AdminInvites() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void loadInvites();
  }, []);

  async function loadInvites() {
    const response = await fetch("/api/admin/invites");
    if (!response.ok) return;
    const body = (await response.json()) as { invites: Invite[] };
    setInvites(body.invites);
  }

  async function addInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/admin/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role })
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setMessage(body.error ?? "Could not add invite.");
      return;
    }
    setEmail("");
    await loadInvites();
  }

  async function deleteInvite(id: string) {
    await fetch(`/api/admin/invites/${id}`, { method: "DELETE" });
    await loadInvites();
  }

  return (
    <section className="stack">
      <form className="panel" onSubmit={addInvite}>
        <h2>Add invite</h2>
        <div className="form-row">
          <label className="field">
            <span>Email</span>
            <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="field">
            <span>Role</span>
            <select value={role} onChange={(event) => setRole(event.target.value as "admin" | "member")}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button className="button primary" type="submit">
            <Plus size={16} />
            Add
          </button>
        </div>
        {message ? <p className="error-text">{message}</p> : null}
      </form>

      <section className="panel">
        <h2>Invite list</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {invites.map((invite) => (
              <tr key={invite.id}>
                <td>{invite.email}</td>
                <td>{invite.role}</td>
                <td>{invite.accepted_at ? "accepted" : "pending"}</td>
                <td>{new Date(invite.created_at).toLocaleString()}</td>
                <td>
                  <button className="icon-button" title="Delete invite" type="button" onClick={() => deleteInvite(invite.id)}>
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  );
}
