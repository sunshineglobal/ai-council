import { EvalDashboard } from "@/components/eval-dashboard";

export default function EvalsPage() {
  return (
    <main className="page stack">
      <div className="page-title">
        <h1>Evals</h1>
        <p>Measure the council against private prompt sets and rubrics before making benchmark claims.</p>
      </div>
      <EvalDashboard />
    </main>
  );
}
