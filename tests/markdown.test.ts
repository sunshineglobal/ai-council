import { describe, expect, it } from "vitest";
import { inlineToText, isSafeHref, parseMarkdown } from "@/lib/markdown";

describe("isSafeHref", () => {
  it.each([
    "https://example.com/source",
    "http://example.com/source",
    "mailto:team@example.com",
    "/app/chats/123",
    "#result",
    "relative/path"
  ])("accepts safe link %s", (href) => {
    expect(isSafeHref(href)).toBe(true);
  });

  it.each(["", "   ", "javascript:alert(1)", "data:text/html,unsafe", "vbscript:msgbox(1)"])(
    "rejects unsafe link %s",
    (href) => {
      expect(isSafeHref(href)).toBe(false);
    }
  );
});

describe("parseMarkdown", () => {
  it("parses representative block and inline structures", () => {
    const blocks = parseMarkdown([
      "# Council **result**",
      "",
      "Read the [source](https://example.com) and `notes`.",
      "",
      "> Shared conclusion",
      "",
      "1. First model",
      "2. Second model",
      "",
      "```ts",
      "const score = 1;",
      "```",
      "",
      "| Model | Score |",
      "| --- | --- |",
      "| A | 0.9 |"
    ].join("\n"));

    expect(blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "blockquote",
      "list",
      "code",
      "table"
    ]);

    const heading = blocks[0];
    expect(heading.type).toBe("heading");
    if (heading.type === "heading") {
      expect(heading.level).toBe(1);
      expect(inlineToText(heading.text)).toBe("Council result");
    }

    const paragraph = blocks[1];
    expect(paragraph.type).toBe("paragraph");
    if (paragraph.type === "paragraph") {
      expect(inlineToText(paragraph.inlines)).toBe("Read the source and notes.");
      expect(paragraph.inlines).toContainEqual({
        kind: "link",
        href: "https://example.com",
        text: [{ kind: "text", text: "source" }]
      });
    }

    expect(blocks[4]).toEqual({ type: "code", language: "ts", text: "const score = 1;" });
  });

  it("leaves unsafe markdown links as plain text", () => {
    const source = "[click me](javascript:alert(1))";
    const [paragraph] = parseMarkdown(source);

    expect(paragraph.type).toBe("paragraph");
    if (paragraph.type === "paragraph") {
      expect(inlineToText(paragraph.inlines)).toBe(source);
      expect(paragraph.inlines.some((run) => run.kind === "link")).toBe(false);
    }
  });
});
