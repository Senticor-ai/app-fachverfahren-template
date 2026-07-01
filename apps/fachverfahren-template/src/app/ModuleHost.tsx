// GENERISCHER Modul-Mount. Entdeckt zur Build-Zeit JEDE `modules/<domain>/ui/screens.tsx` (import.meta.glob) und
// rendert die zur Surface passende Komponente (Bürger / Sachbearbeitung). So wird ein vom CHOS-Build gefülltes
// Fachverfahren-Modul in der LAUFENDEN App sichtbar — ohne dass die App-Shell pro Modul angefasst werden muss.
// Findet die App kein Modul, zeigt sie einen klaren Hinweis statt einer leeren Surface.
import { useState, type ComponentType } from "react";

interface ModuleExport {
  moduleMeta?: {
    domain?: string;
    label?: string;
    citizenLabel?: string;
    caseworkerLabel?: string;
  };
  CitizenScreen?: ComponentType;
  CaseworkerScreen?: ComponentType;
  AuditScreen?: ComponentType;
}

interface MountedModule {
  domain: string;
  label: string;
  // explizit `| undefined` wegen exactOptionalPropertyTypes (Template-weit) — die Werte stammen aus dem glob.
  Citizen?: ComponentType | undefined;
  Caseworker?: ComponentType | undefined;
  Audit?: ComponentType | undefined;
}

// Pfad relativ zu dieser Datei (apps/fachverfahren-template/src/app) bis zum Repo-Root-`modules/`: 4 Ebenen hoch.
// eager → die Module sind synchron verfügbar (Registry beim Modul-Eval, damit die Navigation sie kennt).
const discovered = import.meta.glob<ModuleExport>(
  "../../../../modules/*/ui/screens.tsx",
  { eager: true },
);

export const mountedModules: MountedModule[] = Object.entries(discovered)
  .map(([filePath, mod]) => {
    const domain =
      mod.moduleMeta?.domain ??
      filePath.match(/modules\/([^/]+)\//)?.[1] ??
      "modul";
    return {
      domain,
      label: mod.moduleMeta?.label ?? domain,
      Citizen: mod.CitizenScreen,
      Caseworker: mod.CaseworkerScreen,
      Audit: mod.AuditScreen,
    };
  })
  // Interne `_`-Ordner duerfen nie als laufende App erscheinen. Die offene Vorlage enthaelt keine
  // Modul-Scaffolds mehr; konkrete Fachverfahren entstehen als `modules/<domain>/`.
  .filter(
    (m) => (m.Citizen || m.Caseworker || m.Audit) && !m.domain.startsWith("_"),
  );

/** True, sobald mindestens ein Modul mit einer App-Surface gemountet ist (steuert den Navigations-Eintrag). */
export const hasMountedModule = mountedModules.length > 0;

export function ModuleHost({ surface }: { surface: "citizen" | "caseworker" }) {
  const [active, setActive] = useState(0);
  if (!mountedModules.length) {
    return (
      <div style={{ padding: "1.5rem", maxWidth: "42rem" }}>
        <h2 style={{ marginTop: 0 }}>Noch kein Fachverfahren-Modul</h2>
        <p>
          Der governte Build legt{" "}
          <code>modules/&lt;domain&gt;/ui/screens.tsx</code> an (CitizenScreen /
          CaseworkerScreen, komponiert aus{" "}
          <code>@senticor/public-sector-ui</code>). Sobald das Modul existiert,
          erscheint es hier in der laufenden App.
        </p>
      </div>
    );
  }
  const mod = mountedModules[Math.min(active, mountedModules.length - 1)]!;
  const Screen = surface === "citizen" ? mod.Citizen : mod.Caseworker;
  return (
    <div>
      {mountedModules.length > 1 ? (
        <div
          role="tablist"
          aria-label="Fachverfahren-Module"
          style={{
            display: "flex",
            gap: "0.5rem",
            marginBottom: "1rem",
            flexWrap: "wrap",
          }}
        >
          {mountedModules.map((m, i) => (
            <button
              key={m.domain}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
            >
              {m.label}
            </button>
          ))}
        </div>
      ) : null}
      {Screen ? (
        <Screen />
      ) : (
        <div style={{ padding: "1.5rem" }}>
          Modul „{mod.label}" hat keine{" "}
          {surface === "citizen" ? "Bürger" : "Sachbearbeitungs"}-Surface.
        </div>
      )}
    </div>
  );
}
