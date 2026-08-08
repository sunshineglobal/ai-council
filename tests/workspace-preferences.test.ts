import { afterEach, describe, expect, it, vi } from "vitest";
import {
  filterAvailableModelIds,
  readWorkspacePreferences,
  writeWorkspacePreferences
} from "@/lib/workspace-preferences";

describe("workspace preferences", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("filters model ids against the current allowlist", () => {
    expect(filterAvailableModelIds(["a", "b", "c"], new Set(["b", "c", "d"]))).toEqual(["b", "c"]);
  });

  it("reads and writes versioned local storage preferences", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        }
      }
    });

    writeWorkspacePreferences({
      models: ["model-a", "model-b"],
      judgeModel: "judge-a",
      debateDepth: 2,
      researchEnabled: true
    });

    expect(readWorkspacePreferences()).toEqual({
      models: ["model-a", "model-b"],
      judgeModel: "judge-a",
      debateDepth: 2,
      researchEnabled: true
    });
  });

  it("ignores malformed stored preferences", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => "{\"models\":null}",
        setItem: () => undefined
      }
    });
    expect(readWorkspacePreferences()).toBeNull();
  });
});
