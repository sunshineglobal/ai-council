export type MarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: InlineRun[] }
  | { type: "paragraph"; inlines: InlineRun[] }
  | { type: "blockquote"; blocks: MarkdownBlock[] }
  | { type: "code"; language?: string; text: string }
  | { type: "list"; ordered: boolean; items: ListItem[] }
  | { type: "table"; header: InlineRun[][]; rows: InlineRun[][][] }
  | { type: "rule" };

export type ListItem = {
  blocks: MarkdownBlock[];
};

export type InlineRun =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: InlineRun[] }
  | { kind: "italic"; text: InlineRun[] }
  | { kind: "code"; text: string }
  | { kind: "link"; href: string; text: InlineRun[] };

export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const language = line.slice(3).trim() || undefined;
      const start = index + 1;
      let end = start;
      while (end < lines.length && !lines[end].startsWith("```")) end += 1;
      const text = lines.slice(start, end).join("\n");
      blocks.push({ type: "code", language, text });
      index = end < lines.length ? end + 1 : end;
      continue;
    }

    if (/^\s*-{3,}\s*$/.test(line) || /^\s*\*{3,}\s*$/.test(line)) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      const level = Math.min(6, Math.max(1, headingMatch[1].length)) as 1 | 2 | 3 | 4 | 5 | 6;
      blocks.push({
        type: "heading",
        level,
        text: parseInlineRun(headingMatch[2])
      });
      index += 1;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const buffer: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        buffer.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "blockquote", blocks: parseMarkdown(buffer.join("\n")) });
      continue;
    }

    const unorderedMatch = /^\s*[-*+]\s+/.test(line);
    const orderedMatch = /^\s*\d+\.\s+/.test(line);
    if (unorderedMatch || orderedMatch) {
      const ordered = orderedMatch;
      const items: ListItem[] = [];
      while (index < lines.length) {
        const current = lines[index];
        const match = ordered ? /^\s*\d+\.\s+(.*)$/.exec(current) : /^\s*[-*+]\s+(.*)$/.exec(current);
        if (!match) break;
        const itemLines: string[] = [match[1]];
        index += 1;
        while (index < lines.length) {
          const peek = lines[index];
          if (/^\s*$/.test(peek)) {
            const lookahead = lines[index + 1] ?? "";
            const contMatch = ordered
              ? /^\s*\d+\.\s+/.test(lookahead)
              : /^\s*[-*+]\s+/.test(lookahead);
            if (contMatch) break;
            if (lines.slice(index + 1).every((line) => /^\s*$/.test(line))) break;
            itemLines.push("");
            index += 1;
            continue;
          }
          const indented = /^\s{2,}\S/.test(peek) || /^\t\S/.test(peek);
          if (!indented) break;
          itemLines.push(peek.replace(/^\s{2}/, "").replace(/^\t/, ""));
          index += 1;
        }
        items.push({ blocks: parseMarkdown(itemLines.join("\n").trim()) });
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      const header = splitTableRow(line);
      index += 1;
      if (index < lines.length && /^\s*\|?\s*:?-{2,}:?(\s*\|\s*:?-{2,}:?)+\s*\|?\s*$/.test(lines[index])) {
        index += 1;
        const rows: InlineRun[][][] = [];
        while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) {
          rows.push(splitTableRow(lines[index]).map((cell) => parseInlineRun(cell)));
          index += 1;
        }
        blocks.push({ type: "table", header: header.map((cell) => parseInlineRun(cell)), rows });
        continue;
      }
      blocks.push({ type: "paragraph", inlines: parseInlineRun(line.trim()) });
      continue;
    }

    const paragraphLines: string[] = [line];
    index += 1;
    while (index < lines.length) {
      const peek = lines[index];
      if (
        peek.trim() === "" ||
        /^\s*[-*+]\s+/.test(peek) ||
        /^\s*\d+\.\s+/.test(peek) ||
        /^\s*>/.test(peek) ||
        /^#{1,6}\s+/.test(peek) ||
        /^\s*\|.*\|\s*$/.test(peek) ||
        peek.startsWith("```")
      ) {
        break;
      }
      paragraphLines.push(peek);
      index += 1;
    }
    blocks.push({ type: "paragraph", inlines: parseInlineRun(paragraphLines.join(" ")) });
  }

  return blocks;
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function parseInlineRun(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  let buffer = "";
  let i = 0;

  const flushText = () => {
    if (buffer) {
      runs.push({ kind: "text", text: buffer });
      buffer = "";
    }
  };

  while (i < text.length) {
    const char = text[i];

    if (char === "\\" && i + 1 < text.length) {
      buffer += text[i + 1];
      i += 2;
      continue;
    }

    if (char === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i) {
        flushText();
        runs.push({ kind: "code", text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    if ((char === "*" || char === "_") && text[i + 1] === char) {
      const marker = text.slice(i, i + 2);
      const end = text.indexOf(marker, i + 2);
      if (end > i + 1) {
        flushText();
        runs.push({ kind: "bold", text: parseInlineRun(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    if (char === "*" || char === "_") {
      const end = text.indexOf(char, i + 1);
      if (end > i) {
        flushText();
        runs.push({ kind: "italic", text: parseInlineRun(text.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    if (char === "[") {
      const labelEnd = text.indexOf("]", i + 1);
      if (labelEnd > i) {
        const afterLabel = text[labelEnd + 1];
        if (afterLabel === "(") {
          const hrefEnd = text.indexOf(")", labelEnd + 2);
          if (hrefEnd > labelEnd + 1) {
            flushText();
            const href = text.slice(labelEnd + 2, hrefEnd).trim();
            if (isSafeHref(href)) {
              runs.push({
                kind: "link",
                href,
                text: parseInlineRun(text.slice(i + 1, labelEnd))
              });
              i = hrefEnd + 1;
              continue;
            }
          }
        }
      }
    }

    buffer += char;
    i += 1;
  }

  flushText();
  return runs.length ? runs : [{ kind: "text", text }];
}

export function inlineToText(runs: InlineRun[]): string {
  return runs
    .map((run) => {
      if (run.kind === "text" || run.kind === "code") return run.text;
      return inlineToText(run.text);
    })
    .join("");
}

const SAFE_PROTOCOLS = /^(https?:|mailto:|\/|#)/i;

export function isSafeHref(href: string): boolean {
  if (!href) return false;
  const trimmed = href.trim();
  if (!trimmed) return false;
  if (SAFE_PROTOCOLS.test(trimmed)) return true;
  if (!trimmed.includes(":")) return true;
  return false;
}