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
  personaDescriptors,
  personaRoute,
} from "../personas.js";
import { useSession } from "../session.js";
import { store } from "../store.js";

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
  // Ziel des Wechsels aus DERSELBEN Wahrheit wie die Landing-Einstiege (config.personas → home),
  // mit der App-Routen-Konvention als Fallback.
  const onPersonaChange = (next: Persona) =>
    navigate(personaRoute(next, store.config));
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
