// contracts.test — valide und INVALIDE Proben je Schema. Schwerpunkt: die Abwehr von
// Kontext-Overrides (tenantId/actorId im Body/Query → additionalProperties: false)
// und die Enum-Grenzen (box, scope, colorScheme, status).
import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import { ErrorEnvelopeSchema } from "./error.js";
import {
  MailboxCreateRequestSchema,
  MailboxListQuerySchema,
  MailboxMessageDtoSchema,
} from "./mailbox.js";
import {
  UserPreferencesDtoSchema,
  UserPreferencesUpdateSchema,
} from "./preferences.js";
import { CapabilitiesDtoSchema, SessionDtoSchema } from "./session.js";

describe("ErrorEnvelopeSchema", () => {
  it("akzeptiert error mit optionaler requestId, weist Zusatzfelder ab", () => {
    expect(Value.Check(ErrorEnvelopeSchema, { error: "kaputt" })).toBe(true);
    expect(
      Value.Check(ErrorEnvelopeSchema, { error: "kaputt", requestId: "r-1" }),
    ).toBe(true);
    expect(Value.Check(ErrorEnvelopeSchema, { error: "" })).toBe(false);
    expect(
      Value.Check(ErrorEnvelopeSchema, { error: "kaputt", details: {} }),
    ).toBe(false);
  });
});

describe("SessionDtoSchema / CapabilitiesDtoSchema", () => {
  it("verlangt den vollständigen Sitzungskontext", () => {
    const valid = {
      actorId: "actor-1",
      tenantId: "tenant-1",
      authorityId: "authority-1",
      jurisdictionId: "de",
      rbacRoles: ["citizen"],
    };
    expect(Value.Check(SessionDtoSchema, valid)).toBe(true);
    expect(Value.Check(SessionDtoSchema, { ...valid, rbacRoles: [""] })).toBe(
      false,
    );
    const { authorityId: _weg, ...ohneAuthority } = valid;
    expect(Value.Check(SessionDtoSchema, ohneAuthority)).toBe(false);
  });

  it("capabilities: Rollen + aufgelöste Permissions", () => {
    expect(
      Value.Check(CapabilitiesDtoSchema, {
        rbacRoles: ["citizen"],
        permissions: ["session.read", "mailbox.own.write"],
      }),
    ).toBe(true);
    expect(Value.Check(CapabilitiesDtoSchema, { rbacRoles: ["citizen"] })).toBe(
      false,
    );
  });
});

describe("UserPreferences-Schemas", () => {
  it("DTO spiegelt die Store-Form vollständig", () => {
    expect(
      Value.Check(UserPreferencesDtoSchema, {
        actorId: "actor-1",
        tenantId: "tenant-1",
        colorScheme: "dark",
        accessibility: {
          highContrast: false,
          largeText: true,
          reducedMotion: false,
          reducedDensity: false,
        },
        navigation: { sidebarAutoExpand: true },
        updatedAt: "2026-07-14T00:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("Update ist partiell, kennt aber KEINE Kontextfelder", () => {
    expect(Value.Check(UserPreferencesUpdateSchema, {})).toBe(true);
    expect(
      Value.Check(UserPreferencesUpdateSchema, { colorScheme: "system" }),
    ).toBe(true);
    expect(
      Value.Check(UserPreferencesUpdateSchema, {
        accessibility: { largeText: true },
      }),
    ).toBe(true);
    expect(
      Value.Check(UserPreferencesUpdateSchema, { colorScheme: "neon" }),
    ).toBe(false);
    // Kontext-Override-Versuch: tenant kommt aus der Sitzung, nie aus dem Body.
    expect(
      Value.Check(UserPreferencesUpdateSchema, { tenantId: "fremd" }),
    ).toBe(false);
    expect(
      Value.Check(UserPreferencesUpdateSchema, {
        accessibility: { largeText: true, extra: true },
      }),
    ).toBe(false);
  });
});

describe("Mailbox-Schemas", () => {
  it("Query verlangt box, scope/limit optional mit Grenzen", () => {
    expect(Value.Check(MailboxListQuerySchema, { box: "inbox" })).toBe(true);
    expect(
      Value.Check(MailboxListQuerySchema, {
        box: "outbox",
        scope: "authority",
        limit: 200,
      }),
    ).toBe(true);
    expect(Value.Check(MailboxListQuerySchema, {})).toBe(false);
    expect(Value.Check(MailboxListQuerySchema, { box: "spam" })).toBe(false);
    expect(
      Value.Check(MailboxListQuerySchema, { box: "inbox", limit: 0 }),
    ).toBe(false);
    expect(
      Value.Check(MailboxListQuerySchema, { box: "inbox", limit: 201 }),
    ).toBe(false);
    expect(
      Value.Check(MailboxListQuerySchema, { box: "inbox", tenantId: "fremd" }),
    ).toBe(false);
  });

  it("Create verlangt subject, verbietet Kontext- und Server-Felder", () => {
    expect(
      Value.Check(MailboxCreateRequestSchema, {
        box: "outbox",
        subject: "Antrag eingegangen",
        bodyPreview: "Ihr Antrag ist eingegangen.",
      }),
    ).toBe(true);
    expect(
      Value.Check(MailboxCreateRequestSchema, {
        box: "outbox",
        scope: "own",
        subject: "Betreff",
        bodyPreview: "",
        caseId: null,
      }),
    ).toBe(true);
    expect(
      Value.Check(MailboxCreateRequestSchema, {
        box: "outbox",
        subject: "",
        bodyPreview: "",
      }),
    ).toBe(false);
    for (const override of [
      { tenantId: "fremd" },
      { authorityId: "fremd" },
      { ownerActorId: "fremd" },
      { messageId: "msg-1" },
      { status: "read" },
      { createdAt: "2026-01-01" },
    ]) {
      expect(
        Value.Check(MailboxCreateRequestSchema, {
          box: "outbox",
          subject: "Betreff",
          bodyPreview: "",
          ...override,
        }),
        JSON.stringify(override),
      ).toBe(false);
    }
  });

  it("Message-DTO exponiert die Server-Topologie nicht", () => {
    const valid = {
      messageId: "msg-1",
      box: "outbox",
      scope: "own",
      ownerActorId: "actor-1",
      caseId: null,
      subject: "Betreff",
      bodyPreview: "",
      status: "sent",
      createdAt: "2026-07-14T00:00:00.000Z",
    };
    expect(Value.Check(MailboxMessageDtoSchema, valid)).toBe(true);
    expect(
      Value.Check(MailboxMessageDtoSchema, { ...valid, tenantId: "tenant-1" }),
    ).toBe(false);
  });
});
