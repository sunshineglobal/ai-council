"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { requestJson } from "@/lib/client-api";

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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void requestJson<{ invites: Invite[] }>("/api/admin/invites", { signal: controller.signal })
      .then((body) => setInvites(body.invites))
      .catch((loadError: unknown) => {
        if (loadError instanceof Error && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Could not load invites.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [refreshVersion]);

  async function addInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await requestJson<{ invite: Invite }>("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role })
      });
      setEmail("");
      setRefreshVersion((version) => version + 1);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not add invite.");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteInvite(invite: Invite) {
    const message = invite.accepted_at
      ? `Revoke access for ${invite.email}? They will lose access immediately and their profile will be removed.`
      : `Remove the pending invite for ${invite.email}?`;
    if (deletingId || !window.confirm(message)) return;
    setDeletingId(invite.id);
    setError("");
    try {
      await requestJson<{ ok: true }>(`/api/admin/invites/${invite.id}`, { method: "DELETE" });
      setInvites((current) => current.filter((item) => item.id !== invite.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not update invite.");
    } finally {
      setDeletingId(null);
    }
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
          <button className="button primary" disabled={submitting} type="submit">
            <Plus size={16} />
            {submitting ? "Adding" : "Add"}
          </button>
        </div>
        {error ? <p className="error-text" role="alert">{error}</p> : null}
      </form>

      <section className="panel">
        <h2>Invite list</h2>
        {loading ? <p className="muted small" role="status">Loading invites.</p> : null}
        {!loading && invites.length === 0 ? <p className="muted small">No invites yet.</p> : null}
        {invites.length ? (
          <div className="table-scroll">
            <table className="table">
              <caption className="sr-only">Invited users</caption>
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Created</th>
                  <th scope="col">Actions</th>
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
                      <button
                        aria-label={invite.accepted_at ? `Revoke access for ${invite.email}` : `Remove invite for ${invite.email}`}
                        className="icon-button"
                        disabled={deletingId !== null}
                        title={invite.accepted_at ? `Revoke ${invite.email}` : `Remove invite for ${invite.email}`}
                        type="button"
                        onClick={() => void deleteInvite(invite)}
                      >
                        {deletingId === invite.id ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </section>
  );
}
