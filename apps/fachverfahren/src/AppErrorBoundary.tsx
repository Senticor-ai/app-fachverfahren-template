// AppErrorBoundary — generischer Auffang für JEDEN Render-Fehler der generierten App. Wurzel-Schutz gegen den
// „weißen Screen": eine agent-generierte leistung.config.ts kann nicht zum Kit-Vertrag passen (z. B. fehlt
// `antrag.steps`) → ein Kit-Component wirft → ohne Boundary bleibt #root LEER (blank). Mit Boundary: lesbare
// Fehlermeldung im Bild UND eine postMessage-Meldung an die einbettende Builder-Konsole, damit einbettende
// Build-Werkzeuge die generierte App reparieren können (statt eines stillen weißen Screens). Inline-Styles → rendert auch, wenn
// das CSS/Theme selbst kaputt ist.
import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
  componentStack: string;
}

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  State
> {
  state: State = { error: null, componentStack: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ componentStack: info.componentStack ?? "" });
    try {
      if (typeof window !== "undefined" && window.parent !== window) {
        window.parent.postMessage(
          {
            source: "chos-app",
            kind: "error",
            detail: {
              message: error.message,
              stack: `${error.stack ?? ""}\n--- Component-Stack ---${info.componentStack ?? ""}`,
            },
            url: typeof location !== "undefined" ? location.href : "",
            at: new Date().toISOString(),
          },
          "*",
        );
      }
    } catch {
      /* Melden ist best-effort */
    }
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    // Token-frei (das CSS kann kaputt sein), aber theme-bewusst: die App schaltet Dark über die `.dark`-Klasse am
    // <html>; die lesen wir direkt, sonst leuchtet der Crash-Screen im Dark-Modus weiß. Fallback bei fehlender Klasse
    // = System-Präferenz. So bleibt der Auffang in BEIDEN Themes lesbar (Nutzer-Direktive „immer light UND dark").
    const dark =
      typeof document !== "undefined" &&
      (document.documentElement.classList.contains("dark") ||
        (!document.documentElement.classList.contains("light") &&
          typeof window !== "undefined" &&
          !!window.matchMedia?.("(prefers-color-scheme: dark)").matches));
    const c = dark
      ? {
          fg: "#e2e8f0",
          bg: "#0f172a",
          muted: "#94a3b8",
          codeBg: "#334155",
          preBg: "#020617",
          preBorder: "#1e293b",
        }
      : {
          fg: "#1e293b",
          bg: "#f8fafc",
          muted: "#475569",
          codeBg: "#e2e8f0",
          preBg: "#0f172a",
          preBorder: "#0f172a",
        };
    const codeStyle = {
      background: c.codeBg,
      padding: "0 0.25rem",
      borderRadius: 3,
    };
    return (
      <div
        role="alert"
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          padding: "2rem",
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          color: c.fg,
          background: c.bg,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>
          Die App konnte nicht geladen werden
        </div>
        <div
          style={{
            maxWidth: "40rem",
            fontSize: "0.875rem",
            lineHeight: 1.6,
            color: c.muted,
          }}
        >
          Ein Baustein ist beim Rendern auf einen Fehler gelaufen — häufig, weil
          die generierte <code style={codeStyle}>leistung.config.ts</code> nicht
          zum Kit-Vertrag passt (z. B. fehlt{" "}
          <code style={codeStyle}>antrag.steps</code> oder{" "}
          <code style={codeStyle}>register</code>).
        </div>
        <pre
          style={{
            maxWidth: "40rem",
            maxHeight: "12rem",
            overflow: "auto",
            background: c.preBg,
            color: "#e2e8f0",
            border: `1px solid ${c.preBorder}`,
            padding: "0.75rem 1rem",
            borderRadius: 8,
            fontSize: "0.75rem",
            textAlign: "left",
            whiteSpace: "pre-wrap",
          }}
        >
          {error.message}
        </pre>
        <div style={{ fontSize: "0.8125rem", color: c.muted }}>
          In der Builder-Konsole „Problem melden" wählen → die Agenten beheben
          die generierte App.
        </div>
      </div>
    );
  }
}
