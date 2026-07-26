"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import { MAX_COUNCIL_DEBATE_ROUNDS, MAX_COUNCIL_MODELS } from "@/lib/limits";
import type { ModelOption } from "@/lib/types";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export function SettingsDialog({
  models,
  filteredModels,
  selectedModels,
  selectedModelLabels,
  judgeModel,
  debateDepth,
  researchEnabled,
  researchAvailable,
  saveHistory,
  modelFilter,
  running,
  onJudgeModelChange,
  onDebateDepthChange,
  onResearchEnabledChange,
  onSaveHistoryChange,
  onModelFilterChange,
  onToggleModel,
  onClose
}: {
  models: ModelOption[];
  filteredModels: ModelOption[];
  selectedModels: string[];
  selectedModelLabels: Array<{ id: string; label: string }>;
  judgeModel: string;
  debateDepth: number;
  researchEnabled: boolean;
  researchAvailable: boolean;
  saveHistory: boolean;
  modelFilter: string;
  running: boolean;
  onJudgeModelChange: (modelId: string) => void;
  onDebateDepthChange: (depth: number) => void;
  onResearchEnabledChange: (enabled: boolean) => void;
  onSaveHistoryChange: (enabled: boolean) => void;
  onModelFilterChange: (value: string) => void;
  onToggleModel: (modelId: string) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const animationFrame = window.requestAnimationFrame(() => {
      setVisible(true);
      closeButtonRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(animationFrame);
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      previouslyFocused?.focus();
    };
  }, []);

  function requestClose() {
    if (closeTimerRef.current !== null) return;
    setVisible(false);
    closeTimerRef.current = window.setTimeout(onClose, 180);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      requestClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <aside
        ref={dialogRef}
        aria-labelledby="council-settings-title"
        aria-modal="true"
        className={`settings-pane ${visible ? "open" : ""}`}
        id="council-settings-dialog"
        role="dialog"
        onKeyDown={handleKeyDown}
      >
        <div className="settings-header">
          <div>
            <h2 id="council-settings-title">Council settings</h2>
            <p className="muted">{selectedModels.length}/{MAX_COUNCIL_MODELS} models selected</p>
          </div>
          <button
            ref={closeButtonRef}
            aria-label="Close council settings"
            className="icon-button ghost"
            type="button"
            title="Close settings"
            onClick={requestClose}
          >
            <X aria-hidden size={18} />
          </button>
        </div>

        <div className="settings-scroll">
          <label className="field">
            <span>Judge model</span>
            <select disabled={running} value={judgeModel} onChange={(event) => onJudgeModelChange(event.target.value)}>
              {models.map((model) => (
                <option key={model.id} value={model.id}>{model.name}</option>
              ))}
            </select>
          </label>

          {selectedModelLabels.length ? (
            <div className="selected-model-strip" aria-label="Selected council models">
              {selectedModelLabels.map((model) => (
                <button
                  aria-label={`Remove ${model.label} from the council`}
                  className="selected-model-chip"
                  disabled={running}
                  key={model.id}
                  type="button"
                  onClick={() => onToggleModel(model.id)}
                >
                  <span>{model.label}</span>
                  <X aria-hidden size={13} />
                </button>
              ))}
            </div>
          ) : (
            <p className="muted small">Choose at least one model.</p>
          )}

          <label className="field range-field">
            <span>Debate depth</span>
            <div className="range-row">
              <input
                aria-valuetext={`${debateDepth} ${debateDepth === 1 ? "round" : "rounds"}`}
                disabled={running}
                min={1}
                max={MAX_COUNCIL_DEBATE_ROUNDS}
                type="range"
                value={debateDepth}
                onChange={(event) => onDebateDepthChange(Number(event.target.value))}
              />
              <strong>{debateDepth} {debateDepth === 1 ? "round" : "rounds"}</strong>
            </div>
          </label>

          <div className="field">
            <span>Run mode</span>
            <label className="switch-row">
              <input
                checked={researchEnabled}
                disabled={running || !researchAvailable}
                type="checkbox"
                onChange={(event) => onResearchEnabledChange(event.target.checked)}
              />
              <span>Firecrawl research</span>
            </label>
            {!researchAvailable ? (
              <p className="muted small">Research is unavailable until Firecrawl is configured.</p>
            ) : null}
            <label className="switch-row">
              <input
                checked={saveHistory}
                disabled={running}
                type="checkbox"
                onChange={(event) => onSaveHistoryChange(event.target.checked)}
              />
              <span>Save history</span>
            </label>
          </div>

          <label className="field">
            <span>Search models</span>
            <span className="input-shell">
              <Search aria-hidden size={16} />
              <input
                value={modelFilter}
                onChange={(event) => onModelFilterChange(event.target.value)}
                placeholder="openai, claude, llama..."
              />
            </span>
          </label>

          <div className="model-list">
            {filteredModels.map((model) => {
              const selected = selectedModels.includes(model.id);
              return (
                <label className="model-item" key={model.id}>
                  <input
                    checked={selected}
                    disabled={running || (!selected && selectedModels.length >= MAX_COUNCIL_MODELS)}
                    type="checkbox"
                    onChange={() => onToggleModel(model.id)}
                  />
                  <span>
                    <strong>{model.name}</strong>
                    <span>{model.id}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </aside>
      <button className="drawer-scrim" type="button" aria-label="Close settings" onClick={requestClose} />
    </>
  );
}
