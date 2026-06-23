import type { MailboxResponse, UserPreferencesResponse, UserPreferencesUpdate } from "../../shared/app-contracts.js";
type Fetcher = typeof fetch;
export declare function loadUserPreferences(fetcher?: Fetcher): Promise<UserPreferencesResponse>;
export declare function saveUserPreferences(update: UserPreferencesUpdate, fetcher?: Fetcher): Promise<UserPreferencesResponse>;
export declare function loadMailbox(surface: "me" | "work", box: "posteingang" | "ausgang", fetcher?: Fetcher): Promise<MailboxResponse>;
export {};
