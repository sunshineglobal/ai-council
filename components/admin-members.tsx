"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, RefreshCw, Save, Users } from "lucide-react";
import { currentMonthValue, formatRange, monthRange } from "@/components/admin-usage-dashboard/date-utils";
import { requestJson } from "@/lib/client-api";
import type { OrgMemberUsage, OrgMembersResponse } from "@/lib/admin/members";

type Notice = { kind: "error" | "success"; text: string };

export function AdminMembers() {
  const [month, setMonth] = useState(currentMonthValue);
  const [data, setData] = useState<OrgMembersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setNotice(null);
    try {
      const range = monthRange(month);
      const query = new URLSearchParams({ from: range.from, to: range.to });
      const body = await requestJson<OrgMembersResponse>(`/api/admin/members?${query}`, { signal });
      setData(body);
      setDrafts(Object.fromEntries(body.members.map((member) => [
        member.id,
        member.monthlyBudgetUsd === null ? "" : String(member.monthlyBudgetUsd)
      ])));
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not load members." });
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function saveBudget(member: OrgMemberUsage) {
    const raw = drafts[member.id] ?? "";
    const monthlyBudgetUsd = raw.trim() === "" ? null : Number(raw);
    if (monthlyBudgetUsd !== null && !Number.isFinite(monthlyBudgetUsd)) {
      setNotice({ kind: "error", text: "Budget must be a number or blank." });
      return;
    }

    setSavingId(member.id);
    setNotice(null);
    try {
      await requestJson<{ monthlyBudgetUsd: number | null }>(`/api/admin/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyBudgetUsd })
      });
      setNotice({ kind: "success", text: `Updated budget for ${member.email}.` });
      await load();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not save budget." });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="panel stack">
      <div className="usage-header">
        <div>
          <div className="section-title">
            <h2>Members</h2>
            <Users aria-hidden size={16} />
          </div>
          <p className="muted small">
            {data ? formatRange(data.range.from, data.range.to) : "Org spend and per-member budgets."}
          </p>
        </div>
        <button className="button subtle" type="button" disabled={loading} onClick={() => void load()}>
          <RefreshCw aria-hidden size={16} />
          Refresh
        </button>
      </div>

      <label className="field">
        <span>Month</span>
        <span className="input-shell">
          <CalendarDays aria-hidden size={16} />
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </span>
      </label>

      {notice ? (
        <p className={notice.kind === "error" ? "error-text" : "success-text"} role={notice.kind === "error" ? "alert" : "status"}>
          {notice.text}
        </p>
      ) : null}

      {loading && !data ? <p className="muted small" role="status">Loading members.</p> : null}
      {data?.members.length === 0 ? <p className="muted small">No members yet.</p> : null}

      {data?.members.length ? (
        <div className="table-scroll">
          <table className="table">
            <caption className="sr-only">Member usage and budgets</caption>
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Spend</th>
                <th scope="col">Runs</th>
                <th scope="col">Status</th>
                <th scope="col">Budget (USD)</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((member) => (
                <tr key={member.id}>
                  <td>{member.email}</td>
                  <td>{member.role}</td>
                  <td>${member.estimatedCost.toFixed(4)}</td>
                  <td>{member.runCount}</td>
                  <td>
                    <span className={`pill budget-${member.budgetStatus}`}>
                      {member.budgetStatus}
                      {member.percentUsed != null ? ` ${member.percentUsed}%` : ""}
                    </span>
                  </td>
                  <td>
                    <input
                      aria-label={`Monthly budget for ${member.email}`}
                      className="budget-input"
                      min={0}
                      step="0.000001"
                      type="number"
                      value={drafts[member.id] ?? ""}
                      placeholder={String(data.defaultMonthlyBudgetUsd)}
                      onChange={(event) => setDrafts((current) => ({
                        ...current,
                        [member.id]: event.target.value
                      }))}
                    />
                  </td>
                  <td>
                    <button
                      className="button subtle small"
                      type="button"
                      disabled={savingId !== null}
                      onClick={() => void saveBudget(member)}
                    >
                      <Save aria-hidden size={14} />
                      {savingId === member.id ? "Saving" : "Save"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {data ? (
        <p className="muted small">
          Blank budget uses the org default of ${data.defaultMonthlyBudgetUsd.toFixed(2)}.
        </p>
      ) : null}
    </section>
  );
}
