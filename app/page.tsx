import Link from "next/link";

/**
 * Landing page. A single call to action into the editor, where the whole
 * experience lives: talk, and the document changes.
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
        Dettatura intelligente
      </p>
      <h1 style={{ fontSize: "2.5rem", lineHeight: 1.1, margin: "0.5rem 0" }}>
        AI Voice Document Assistant
      </h1>
      <p style={{ color: "var(--color-muted)", fontSize: "1.1rem" }}>
        Accendi il microfono e parla. L&apos;assistente interpreta ciò che dici
        — testo, formattazione, tabelle, elenchi — e costruisce il documento in
        tempo reale. Nessun comando da imparare: detta come faresti con una
        persona.
      </p>
      <Link
        href="/editor"
        style={{
          display: "inline-block",
          marginTop: "1.5rem",
          padding: "0.85rem 1.6rem",
          borderRadius: "999px",
          background: "var(--color-accent)",
          color: "#fff",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Apri l&apos;editor →
      </Link>
    </main>
  );
}
