"use client";

import { ChevronDown, ExternalLink } from "lucide-react";
import { MarkdownBlock } from "@/components/markdown-block";
import type { CouncilRunResult } from "@/lib/types";

export function RunTrace({ result }: { result: CouncilRunResult }) {
  return (
    <section className="stack">
      {result.research ? (
        <Trace title="Sources" meta={`${result.research.sources.length} results`}>
          <div className="stack">
            {result.research.sources.map((source, index) => (
              <div className="panel" key={source.url || index}>
                <h3>
                  [{index + 1}] {source.title}
                </h3>
                <p className="muted">{source.description}</p>
                <a className="nav-link" href={source.url} rel="noreferrer" target="_blank">
                  <ExternalLink size={14} />
                  Open source
                </a>
                <MarkdownBlock text={source.snippet} />
              </div>
            ))}
          </div>
        </Trace>
      ) : null}

      <Trace title="Initial answers" meta={`${result.initialResponses.length} models`}>
        <div className="stack">
          {result.initialResponses.map((response) => (
            <ModelPanel
              key={response.id}
              title={response.modelId}
              status={response.status}
              meta={`${response.latencyMs}ms`}
              text={response.content || response.error}
            />
          ))}
        </div>
      </Trace>

      {result.critiqueRounds.map((round, index) => (
        <Trace key={index} title={`Debate round ${index + 1}`} meta={`${round.length} critiques`}>
          <div className="stack">
            {round.map((critique) => (
              <ModelPanel
                key={critique.id}
                title={critique.modelId}
                status={critique.status}
                meta={`${critique.latencyMs}ms`}
                text={critique.content || critique.error}
              />
            ))}
          </div>
        </Trace>
      ))}

      <Trace title="Revisions" meta={`${result.revisions.length} models`}>
        <div className="stack">
          {result.revisions.map((response) => (
            <ModelPanel
              key={response.id}
              title={response.modelId}
              status={response.status}
              meta={`${response.latencyMs}ms`}
              text={response.content || response.error}
            />
          ))}
        </div>
      </Trace>

      <Trace title="Judge ranking" meta={result.judge.modelId}>
        {result.judge.rankings.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Model</th>
                <th>Score</th>
                <th>Rationale</th>
              </tr>
            </thead>
            <tbody>
              {result.judge.rankings.map((ranking) => (
                <tr key={`${ranking.rank}-${ranking.modelId}`}>
                  <td>{ranking.rank}</td>
                  <td>{ranking.modelId}</td>
                  <td>{ranking.score}</td>
                  <td>{ranking.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <MarkdownBlock text={result.judge.error} empty="The judge did not return rankings." />
        )}
      </Trace>
    </section>
  );
}

function Trace({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <details className="trace">
      <summary>
        <span>
          <ChevronDown size={16} />
          {title}
        </span>
        {meta ? <span className="pill">{meta}</span> : null}
      </summary>
      <div className="trace-body">{children}</div>
    </details>
  );
}

function ModelPanel({
  title,
  status,
  meta,
  text
}: {
  title: string;
  status: "complete" | "error";
  meta: string;
  text?: string;
}) {
  return (
    <div className="panel">
      <div className="section-title">
        <h3>{title}</h3>
        <span className="pill">
          {status} - {meta}
        </span>
      </div>
      <MarkdownBlock text={text} />
    </div>
  );
}
