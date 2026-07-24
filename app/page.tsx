/**
 * Landing placeholder.
 *
 * Phase 0 establishes the architecture and the server-side reasoning pipeline.
 * The editor surface (Tiptap) and the voice loop (STT) are wired in Phase 2–3;
 * this page will become the entry point into `/editor/[docId]`.
 */
export default function HomePage() {
  return (
    <main
      style={{
        maxWidth: "42rem",
        margin: "0 auto",
        padding: "6rem 1.5rem",
        lineHeight: 1.6,
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: ".75rem",
          letterSpacing: ".14em",
          textTransform: "uppercase",
          color: "var(--color-muted)",
        }}
      >
        Phase 0 · Foundation
      </p>
      <h1 style={{ fontSize: "2.25rem", lineHeight: 1.1, margin: "0.5rem 0" }}>
        AI Voice Document Assistant
      </h1>
      <p style={{ color: "var(--color-muted)", fontSize: "1.05rem" }}>
        Un assistente conversazionale che ragiona sul linguaggio naturale e
        costruisce un documento in tempo reale. L&apos;architettura e la
        pipeline di reasoning lato server sono attive; l&apos;editor e il loop
        vocale arrivano nelle fasi successive.
      </p>
      <p style={{ color: "var(--color-muted)", fontSize: ".95rem" }}>
        Vedi <code>README.md</code> per l&apos;architettura e la roadmap.
      </p>
    </main>
  );
}
