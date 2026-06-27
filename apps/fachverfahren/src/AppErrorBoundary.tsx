// AppErrorBoundary — generischer Auffang für JEDEN Render-Fehler der generierten App. Wurzel-Schutz gegen den
// „weißen Screen": eine agent-generierte leistung.config.ts kann nicht zum Kit-Vertrag passen (z. B. fehlt
// `antrag.steps`) → ein Kit-Component wirft → ohne Boundary bleibt #root LEER (blank). Mit Boundary: lesbare
// Fehlermeldung im Bild UND eine postMessage-Meldung an die einbettende Builder-Konsole, damit die CHOS-Agenten
// die generierte App reparieren können (statt eines stillen weißen Screens). Inline-Styles → rendert auch, wenn
// das CSS/Theme selbst kaputt ist.
import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
  componentStack: string;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
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
          color: "#1e293b",
          background: "#f8fafc",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>Die App konnte nicht geladen werden</div>
        <div style={{ maxWidth: "40rem", fontSize: "0.875rem", lineHeight: 1.6, color: "#475569" }}>
          Ein Baustein ist beim Rendern auf einen Fehler gelaufen — häufig, weil die generierte
          {" "}
          <code style={{ background: "#e2e8f0", padding: "0 0.25rem", borderRadius: 3 }}>leistung.config.ts</code>
          {" "}
          nicht zum Kit-Vertrag passt (z. B. fehlt <code style={{ background: "#e2e8f0", padding: "0 0.25rem", borderRadius: 3 }}>antrag.steps</code> oder <code style={{ background: "#e2e8f0", padding: "0 0.25rem", borderRadius: 3 }}>register</code>).
        </div>
        <pre
          style={{
            maxWidth: "40rem",
            maxHeight: "12rem",
            overflow: "auto",
            background: "#0f172a",
            color: "#e2e8f0",
            padding: "0.75rem 1rem",
            borderRadius: 8,
            fontSize: "0.75rem",
            textAlign: "left",
            whiteSpace: "pre-wrap",
          }}
        >
          {error.message}
        </pre>
        <div style={{ fontSize: "0.8125rem", color: "#475569" }}>
          In der Builder-Konsole „Problem melden" wählen → die Agenten beheben die generierte App.
        </div>
      </div>
    );
  }
}
