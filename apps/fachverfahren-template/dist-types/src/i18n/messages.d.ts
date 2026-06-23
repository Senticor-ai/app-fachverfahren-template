export declare const messages: {
    readonly "app.skipToMain": "Zum Hauptinhalt springen";
    readonly "nav.citizen": "Bürgerportal";
    readonly "nav.caseworker": "Fachverfahren";
    readonly "nav.evidence": "Nachweise";
    readonly "nav.payments": "Zahlungen";
    readonly "nav.mailbox": "Postfach";
    readonly "nav.compliance": "Evidence";
};
export type MessageKey = keyof typeof messages;
export declare function t(key: MessageKey): string;
