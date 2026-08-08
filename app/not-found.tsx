import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page">
      <section className="panel stack">
        <h1>Page not found</h1>
        <p className="muted">That route does not exist in AI Council.</p>
        <Link className="button primary" href="/app">
          Back to workspace
        </Link>
      </section>
    </main>
  );
}
