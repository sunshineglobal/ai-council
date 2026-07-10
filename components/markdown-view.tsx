"use client";

import { useMemo } from "react";
import { parseMarkdown, type InlineRun, type MarkdownBlock } from "@/lib/markdown";

export function MarkdownView({ text, empty = "No content." }: { text?: string; empty?: string }) {
  const blocks = useMemo(() => (text?.trim() ? parseMarkdown(text) : []), [text]);

  if (!blocks.length) {
    return <div className="prose muted">{text?.trim() ? text : empty}</div>;
  }

  return (
    <div className="prose md-prose">
      {blocks.map((block, index) => (
        <MarkdownNode block={block} key={index} />
      ))}
    </div>
  );
}

function MarkdownNode({ block }: { block: MarkdownBlock }) {
  switch (block.type) {
    case "heading": {
      const Tag = `h${block.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return <Tag className={`md-heading md-h${block.level}`}>{renderInline(block.text)}</Tag>;
    }
    case "paragraph":
      return <p className="md-paragraph">{renderInline(block.inlines)}</p>;
    case "blockquote":
      return (
        <blockquote className="md-blockquote">
          {block.blocks.map((child, index) => (
            <MarkdownNode block={child} key={index} />
          ))}
        </blockquote>
      );
    case "code":
      return (
        <pre className="md-code" data-language={block.language}>
          <code>{block.text}</code>
        </pre>
      );
    case "rule":
      return <hr className="md-rule" />;
    case "list":
      return block.ordered ? (
        <ol className="md-list md-list-ordered">
          {block.items.map((item, index) => (
            <li key={index}>{renderListItem(item)}</li>
          ))}
        </ol>
      ) : (
        <ul className="md-list md-list-unordered">
          {block.items.map((item, index) => (
            <li key={index}>{renderListItem(item)}</li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="md-table-wrap">
          <table className="md-table">
            <thead>
              <tr>
                {block.header.map((cell, index) => (
                  <th key={index}>{renderInline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      return null;
  }
}

function renderListItem(item: { blocks: MarkdownBlock[] }) {
  if (!item.blocks.length) return null;
  return item.blocks.map((block, index) => <MarkdownNode block={block} key={index} />);
}

function renderInline(runs: InlineRun[]): React.ReactNode {
  return runs.map((run, index) => {
    if (run.kind === "text") return <span key={index}>{run.text}</span>;
    if (run.kind === "code") return <code key={index} className="md-inline-code">{run.text}</code>;
    if (run.kind === "bold") return <strong key={index}>{renderInline(run.text)}</strong>;
    if (run.kind === "italic") return <em key={index}>{renderInline(run.text)}</em>;
    if (run.kind === "link") {
      const isExternal = /^https?:/i.test(run.href);
      return (
        <a
          key={index}
          className="md-link"
          href={run.href}
          rel={isExternal ? "noreferrer noopener" : undefined}
          target={isExternal ? "_blank" : undefined}
        >
          {renderInline(run.text)}
        </a>
      );
    }
    return null;
  });
}
