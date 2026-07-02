import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Design System/Tokens und Patterns",
  parameters: {
    docs: {
      description: {
        component:
          "Gemeinsame UX/UI-Basis für Fachverfahren, Bürgerportal und agentische Build Console.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const colorAliases = [
  ["--color-bg", "warmes Papier"],
  ["--color-surface", "Fläche"],
  ["--color-text", "Tinte"],
  ["--color-primary", "Primäraktion"],
  ["--color-sidebar", "Sidebar"],
  ["--color-sidebar-fg", "Sidebar-Schrift"],
  ["--color-sidebar-accent", "Sidebar-Akzent"],
  ["--color-status-ok", "gültig"],
  ["--color-status-warn", "Review"],
  ["--color-status-block", "blockiert"],
  ["--color-status-info", "Hinweis"],
  ["--color-status-muted", "gedämpft"],
] as const;

export const TokenSystem: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card">
        <h1>Semantische Tokens</h1>
        <p>
          Komponenten verwenden direkt nutzbare `--color-*`-Aliasse. Die
          darunterliegenden HSL-Komponenten bleiben nur die Token-Quelle. Status
          wird immer mit Text oder Icon plus Farbe kommuniziert.
        </p>
        <div className="sb-token-grid">
          {colorAliases.map(([token, label]) => (
            <figure className="sb-token" key={token}>
              <span
                className="sb-token__swatch"
                style={{ background: `var(${token})` }}
              />
              <figcaption>
                <strong>{label}</strong>
                <code>{token}</code>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    </main>
  ),
};

export const PersonaDensity: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card sb-density-citizen">
        <h2>Bürgerportal</h2>
        <p>
          Geführt, mobile-first, ein Fokus pro Schritt, klare Sprache und Review
          vor Absenden.
        </p>
      </section>
      <section className="sb-card sb-density-caseworker">
        <h2>Sachbearbeitung</h2>
        <p>
          Dicht, tastatureffizient, List-Detail, Filter, Bulk-Review und
          unabhängige Scrollbereiche.
        </p>
        <div className="sb-table-frame">
          <table className="sb-table">
            <thead>
              <tr>
                <th>Vorgang</th>
                <th>Status</th>
                <th>Frist</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>CASE-2026-001</td>
                <td>Review</td>
                <td className="tabular-nums">2026-07-15</td>
                <td>Vier-Augen</td>
              </tr>
              <tr>
                <td>CASE-2026-002</td>
                <td>Bereit</td>
                <td className="tabular-nums">2026-07-20</td>
                <td>Stichprobe</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  ),
};
