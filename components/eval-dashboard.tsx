"use client";

import { useEffect, useState } from "react";
import { Beaker, Play } from "lucide-react";
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

export function EvalDashboard() {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [evals, setEvals] = useState<EvalRun[]>([]);
  const [name, setName] = useState("Private quality check");
  const [rubric, setRubric] = useState("Score for factuality, completeness, reasoning quality, and clarity.");
  const [items, setItems] = useState("Explain the tradeoffs of using multiple LLMs for one decision.");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [judgeModel, setJudgeModel] = useState("");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void loadModels();
    void loadEvals();
  }, []);

  async function loadModels() {
    const response = await fetch("/api/models");
    if (!response.ok) return;
    const body = (await response.json()) as { models: ModelOption[] };
    setModels(body.models);
    setSelectedModels((current) => (current.length ? current : body.models.slice(0, 3).map((model) => model.id)));
    setJudgeModel((current) => current || body.models[0]?.id || "");
  }

  async function loadEvals() {
    const response = await fetch("/api/evals");
    if (!response.ok) return;
    const body = (await response.json()) as { evals: EvalRun[] };
    setEvals(body.evals);
  }

  function toggleModel(modelId: string) {
    setSelectedModels((current) => {
      if (current.includes(modelId)) return current.filter((id) => id !== modelId);
      if (current.length >= 6) return current;
      return [...current, modelId];
    });
  }

  async function runEval(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRunning(true);
    setMessage("Running eval. This can take a few minutes.");
    const prompts = items
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 5)
      .map((prompt) => ({ prompt }));

    const response = await fetch("/api/evals/run", {
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

    const body = (await response.json().catch(() => ({}))) as { error?: string; aggregateScore?: number };
    if (!response.ok) {
      setMessage(body.error ?? "Eval failed.");
    } else {
      setMessage(`Eval complete. Aggregate score: ${Math.round(body.aggregateScore ?? 0)}`);
      await loadEvals();
    }
    setRunning(false);
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
        {message ? <p className={message.includes("failed") ? "error-text" : "success-text"}>{message}</p> : null}
      </form>

      <section className="panel">
        <h2>Recent evals</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Score</th>
              <th>Created</th>
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
      </section>
    </div>
  );
}
