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

const tokens = [
  ["background", "helles Papier"],
  ["foreground", "Tinte"],
  ["status-ok", "gültig"],
  ["status-warn", "Review"],
  ["status-block", "blockiert"],
  ["status-info", "Hinweis"],
  ["sidebar", "Sidebar"],
];

export const TokenSystem: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card">
        <h1>Semantische Tokens</h1>
        <p>
          Komponenten verwenden semantische Tokens. Status wird immer mit Text
          oder Icon plus Farbe kommuniziert.
        </p>
        <div className="sb-token-grid">
          {tokens.map(([token, label]) => (
            <figure className="sb-token" key={token}>
              <span
                className="sb-token__swatch"
                style={{ background: `hsl(var(--${token}))` }}
              />
              <figcaption>
                <strong>{label}</strong>
                <code>--{token}</code>
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
