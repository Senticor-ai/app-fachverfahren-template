import { describe, expect, it } from "vitest";
import {
  onboardingDismissKey,
  onboardingSchritte,
  userCountFromResponse,
  shouldShowAdminOnboarding,
} from "../src/admin-onboarding.js";

describe("shouldShowAdminOnboarding", () => {
  const eligible = {
    actorId: "actor.admin",
    permissions: ["users.manage"],
    userCount: 1,
    dismissed: false,
  } as const;

  it("zeigt die Karte nur beim ersten Admin-Konto", () => {
    expect(shouldShowAdminOnboarding(eligible)).toBe(true);
  });

  it.each([
    { ...eligible, actorId: null },
    { ...eligible, permissions: [] },
    { ...eligible, userCount: 0 },
    { ...eligible, userCount: 2 },
    { ...eligible, userCount: null },
    { ...eligible, dismissed: true },
  ])("blendet bei nicht erfüllter Voraussetzung aus: %o", (state) => {
    expect(shouldShowAdminOnboarding(state)).toBe(false);
  });
});

describe("userCountFromResponse", () => {
  it("liefert die Anzahl nur für erfolgreiche JSON-Arrays", async () => {
    const valid = new Response(JSON.stringify([{ id: 1 }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    await expect(userCountFromResponse(valid)).resolves.toBe(1);
  });

  it.each([
    new Response("error", { status: 503 }),
    new Response("<html></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
    new Response(JSON.stringify({ users: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
    new Response("not-json", {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ])(
    "behandelt Fehler und malformed Antworten als unbekannt",
    async (response) => {
      await expect(userCountFromResponse(response)).resolves.toBeNull();
    },
  );
});

describe("onboardingDismissKey", () => {
  it("ist stabil und Actor-spezifisch", () => {
    expect(onboardingDismissKey("actor.admin")).toBe(
      "fv-admin-onboarding-dismissed:actor.admin",
    );
    expect(onboardingDismissKey("actor.other")).not.toBe(
      onboardingDismissKey("actor.admin"),
    );
  });
});

describe("onboardingSchritte", () => {
  it("liefert vier offene Schritte in stabiler Reihenfolge", () => {
    const steps = onboardingSchritte();
    expect(steps.map((step) => step.key)).toEqual([
      "organisation",
      "team",
      "idp",
      "discovery",
    ]);
    expect(steps.every((step) => step.done !== true)).toBe(true);
  });

  it("verlinkt ausschließlich die Benutzerverwaltung", () => {
    const steps = onboardingSchritte();
    expect(steps.find((step) => step.key === "team")).toMatchObject({
      href: "/admin/users",
      linkLabel: "Team anlegen",
    });
    expect(
      steps.filter((step) => step.key !== "team").every((step) => !step.href),
    ).toBe(true);
  });
});
