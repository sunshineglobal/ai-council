export function MarkdownBlock({ text, empty = "No content." }: { text?: string; empty?: string }) {
  return <div className="prose">{text?.trim() ? text : empty}</div>;
}
