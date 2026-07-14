// shell — die Persona-Hülle der Fach-Sichten: Branding + Persona-Nav aus der Config,
// Persona-Wechsel + Nav-Klicks → Router. (Verbatim aus App.tsx extrahiert.)
import { useNavigate } from "react-router-dom";
import {
  FachverfahrenShell,
  type Persona,
  type ShellNavItem,
} from "@senticor/fachverfahren-kit";
import {
  allowedPersonas,
  PERSONA_HOME,
  personaDescriptors,
} from "../personas.js";
import { useSession } from "../session.js";
import { store } from "../store.js";

export const PUBLIC_FOOTER_LINKS: readonly ShellNavItem[] = [
  {
    key: "barrierefreiheit",
    label: "Erklärung zur Barrierefreiheit",
    href: "/barrierefreiheit",
  },
];

/** Eine Shell-Hülle um jede Route: Branding + Persona-Nav aus der Config, Persona-Wechsel + Nav-Klicks → Router. */
export function Shell({
  persona,
  activeNavKey,
  children,
}: {
  persona: Persona;
  activeNavKey?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const navigate = useNavigate();
  const { principal, capabilities } = useSession();
  const onPersonaChange = (next: Persona) => navigate(PERSONA_HOME[next]);
  const onNavigate = (item: ShellNavItem) => {
    if (item.href) navigate(item.href);
  };
  return (
    <FachverfahrenShell
      config={store.config}
      persona={persona}
      onPersonaChange={onPersonaChange}
      {...(activeNavKey ? { activeNavKey } : {})}
      onNavigate={onNavigate}
      // Der Wechsler zeigt NUR zugewiesene Arbeitsbereiche (bei ≤1 blendet ihn die
      // Shell aus) — Erlebnis-Filter, keine Autorisierung.
      personas={personaDescriptors(
        allowedPersonas(principal, capabilities),
        store.config,
      )}
      footerLinks={PUBLIC_FOOTER_LINKS}
    >
      {children}
    </FachverfahrenShell>
  );
}

// ── URL ↔ Persona. Die Shell-Personas hängen am Pfad-Präfix (PERSONA_HOME in personas.ts). ──
export function personaFromPath(pathname: string): Persona {
  if (pathname.startsWith("/amt")) return "sachbearbeitung";
  if (pathname.startsWith("/aufsicht")) return "aufsicht";
  return "buerger";
}
