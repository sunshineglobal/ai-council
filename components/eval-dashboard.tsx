"use client";

import { useEffect, useState } from "react";
import { Beaker, Play } from "lucide-react";
import { requestJson } from "@/lib/client-api";
import type { ModelOption } from "@/lib/types";

type EvalRun = {
  id: string;
  status: string;
  aggregate_score: number | null;
  created_at: string;
  baseline_label: string | null;
  eval_sets?: { name?: string; rubric?: string } | null;
  eval_scores?: Array<{ score: number | null; prompt: string; rationale: string | null }>;
};

type Notice = { kind: "error" | "status" | "success"; text: string };

export function EvalDashboard() {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [evals, setEvals] = useState<EvalRun[]>([]);
  const [name, setName] = useState("Private quality check");
  const [rubric, setRubric] = useState("Score for factuality, completeness, reasoning quality, and clarity.");
  const [items, setItems] = useState("Explain the tradeoffs of using multiple LLMs for one decision.");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [judgeModel, setJudgeModel] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void Promise.all([
      requestJson<{ models: ModelOption[] }>("/api/models", { signal: controller.signal }),
      requestJson<{ evals: EvalRun[] }>("/api/evals", { signal: controller.signal })
    ])
      .then(([modelsBody, evalsBody]) => {
        setModels(modelsBody.models);
        setSelectedModels((current) => (
          current.length ? current : modelsBody.models.slice(0, 3).map((model) => model.id)
        ));
        setJudgeModel((current) => current || modelsBody.models[0]?.id || "");
        setEvals(evalsBody.evals);
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof Error && loadError.name === "AbortError") return;
        setNotice({ kind: "error", text: loadError instanceof Error ? loadError.message : "Could not load evals." });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [refreshVersion]);

  function toggleModel(modelId: string) {
    setSelectedModels((current) => {
      if (current.includes(modelId)) return current.filter((id) => id !== modelId);
      if (current.length >= 6) return current;
      return [...current, modelId];
    });
  }

  async function runEval(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompts = items
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 5)
      .map((prompt) => ({ prompt }));

    if (!prompts.length) {
      setNotice({ kind: "error", text: "Add at least one prompt." });
      return;
    }

    setRunning(true);
    setNotice({ kind: "status", text: "Running eval. This can take a few minutes." });
    try {
      const body = await requestJson<{ aggregateScore: number }>("/api/evals/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          rubric,
          items: prompts,
          models: selectedModels,
          judgeModel,
          debateDepth: 1,
          researchEnabled: false
        })
      });
      setNotice({ kind: "success", text: `Eval complete. Aggregate score: ${Math.round(body.aggregateScore)}` });
      setRefreshVersion((version) => version + 1);
    } catch (runError) {
      setNotice({ kind: "error", text: runError instanceof Error ? runError.message : "Eval failed." });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="stack">
      <form className="panel stack" onSubmit={runEval}>
        <div className="section-title">
          <h2>Run private eval</h2>
          <Beaker size={16} />
        </div>
        <div className="form-row">
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="field">
            <span>Judge model</span>
            <select value={judgeModel} onChange={(event) => setJudgeModel(event.target.value)}>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Rubric</span>
          <textarea value={rubric} onChange={(event) => setRubric(event.target.value)} />
        </label>
        <label className="field">
          <span>Prompts, one per line</span>
          <textarea value={items} onChange={(event) => setItems(event.target.value)} />
        </label>
        <div className="model-list">
          {models.slice(0, 20).map((model) => (
            <label className="model-item" key={model.id}>
              <input checked={selectedModels.includes(model.id)} type="checkbox" onChange={() => toggleModel(model.id)} />
              <span>
                <strong>{model.name}</strong>
                <span>{model.id}</span>
              </span>
            </label>
          ))}
        </div>
        <button className="button primary" disabled={running || selectedModels.length === 0} type="submit">
          <Play size={16} />
          {running ? "Running" : "Run eval"}
        </button>
        {notice ? (
          <p
            className={notice.kind === "error" ? "error-text" : "success-text"}
            role={notice.kind === "error" ? "alert" : "status"}
          >
            {notice.text}
          </p>
        ) : null}
      </form>

      <section className="panel">
        <h2>Recent evals</h2>
        {loading ? <p className="muted small" role="status">Loading evals.</p> : null}
        {!loading && evals.length === 0 ? <p className="muted small">No evals yet.</p> : null}
        {evals.length ? (
          <div className="table-scroll">
            <table className="table">
              <caption className="sr-only">Recent evaluation runs</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Status</th>
                  <th scope="col">Score</th>
                  <th scope="col">Created</th>
                </tr>
              </thead>
              <tbody>
                {evals.map((evalRun) => (
                  <tr key={evalRun.id}>
                    <td>{evalRun.eval_sets?.name ?? "Eval"}</td>
                    <td>{evalRun.status}</td>
                    <td>{evalRun.aggregate_score?.toFixed(1) ?? "-"}</td>
                    <td>{new Date(evalRun.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
