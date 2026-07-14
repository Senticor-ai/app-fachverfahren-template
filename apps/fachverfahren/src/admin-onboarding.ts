import type { AdminOnboardingStep } from "@senticor/fachverfahren-kit";

export async function userCountFromResponse(
  response: Response,
): Promise<number | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.includes("application/json")) return null;
  try {
    const body = (await response.json()) as unknown;
    return Array.isArray(body) ? body.length : null;
  } catch {
    return null;
  }
}

export function shouldShowAdminOnboarding({
  actorId,
  permissions,
  userCount,
  dismissed,
}: {
  actorId: string | null | undefined;
  permissions: readonly string[] | undefined;
  userCount: number | null;
  dismissed: boolean;
}): boolean {
  return Boolean(
    actorId &&
    permissions?.includes("users.manage") &&
    userCount === 1 &&
    !dismissed,
  );
}

export function onboardingDismissKey(actorId: string): string {
  return `fv-admin-onboarding-dismissed:${actorId}`;
}

export function onboardingSchritte(): readonly AdminOnboardingStep[] {
  return [
    {
      key: "organisation",
      titel: "Organisation konfigurieren",
      beschreibung:
        "Prüfen Sie Leistungsdaten in leistung.config.ts und die Runtime-Konfiguration der Umgebung.",
    },
    {
      key: "team",
      titel: "Team anlegen",
      beschreibung:
        "Legen Sie weitere Konten an und weisen Sie die benötigten Arbeitsbereiche zu.",
      href: "/admin/users",
      linkLabel: "Team anlegen",
    },
    {
      key: "idp",
      titel: "IdP verbinden (optional)",
      beschreibung:
        "Der Vertrauens- und Identitätsvertrag ist in docs/capabilities/identity-and-trust.md beschrieben.",
    },
    {
      key: "discovery",
      titel: "Discovery starten",
      beschreibung:
        "Öffnen Sie das Team-Discovery-Board in der Board-Liste unter dieser Checkliste.",
    },
  ];
}
