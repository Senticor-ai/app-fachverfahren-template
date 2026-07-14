// boards-shell — Workspace-Hülle = DIESELBE Persona-Sidebar wie die Fach-Sichten
// (FachverfahrenShell), mit aktivem „Boards"-Eintrag, permission-gated „Verwaltung"-Sektion
// und Konto im Header (Screen-Contract boards-list: „profile and settings remain reachable
// from the persistent shell"). Die Boards zeigen ECHTE Arbeitsdaten — deshalb
// showDemoBadge=false. (Verbatim aus App.tsx extrahiert.)
import { Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  FachverfahrenShell,
  type ShellNavItem,
  type ShellNavSection,
} from "@senticor/fachverfahren-kit";
import {
  allowedPersonas,
  PERSONA_HOME,
  personaDescriptors,
} from "../personas.js";
import { useSession } from "../session.js";
import { store } from "../store.js";
import { PUBLIC_FOOTER_LINKS } from "./shell.js";

export function BoardsShell({
  activeNavKey,
  children,
}: {
  activeNavKey: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const { logout, principal, capabilities } = useSession();
  const navigate = useNavigate();
  const verwaltung: ShellNavSection[] = principal?.permissions?.includes(
    "users.manage",
  )
    ? [
        {
          label: "Verwaltung",
          items: [
            {
              key: "admin-users",
              label: "Benutzer",
              icon: Users,
              href: "/admin/users",
            },
          ],
        },
      ]
    : [];
  return (
    <FachverfahrenShell
      config={store.config}
      // Boards = WORKSPACE-Navigation, keine Persona: keine aktive Rolle vortäuschen
      // (Boards-only-Konten haben ggf. gar keinen Arbeitsbereich). Der Wechsler zeigt
      // die zugewiesenen Arbeitsbereiche als Einstiege.
      onPersonaChange={(next) => navigate(PERSONA_HOME[next])}
      personas={personaDescriptors(
        allowedPersonas(principal, capabilities),
        store.config,
      )}
      activeNavKey={activeNavKey}
      onNavigate={(item: ShellNavItem) => {
        if (item.href) navigate(item.href);
      }}
      extraNavSections={verwaltung}
      showDemoBadge={false}
      footerLinks={PUBLIC_FOOTER_LINKS}
      accountSlot={
        <span className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="hidden md:inline">{principal?.email}</span>
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/konto/passwort")}
          >
            Passwort ändern
          </button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void logout()}
          >
            Abmelden
          </Button>
        </span>
      }
    >
      {children}
    </FachverfahrenShell>
  );
}
