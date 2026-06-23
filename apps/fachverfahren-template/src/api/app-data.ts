import type {
  MailboxResponse,
  UserPreferencesResponse,
  UserPreferencesUpdate,
} from "../../shared/app-contracts.js";

type Fetcher = typeof fetch;

export async function loadUserPreferences(
  fetcher: Fetcher = fetch,
): Promise<UserPreferencesResponse> {
  return readJson<UserPreferencesResponse>(
    await fetcher("/api/v1/me/preferences", {
      headers: { accept: "application/json" },
    }),
  );
}

export async function saveUserPreferences(
  update: UserPreferencesUpdate,
  fetcher: Fetcher = fetch,
): Promise<UserPreferencesResponse> {
  return readJson<UserPreferencesResponse>(
    await fetcher("/api/v1/me/preferences", {
      method: "PUT",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(update),
    }),
  );
}

export async function loadMailbox(
  surface: "me" | "work",
  box: "posteingang" | "ausgang",
  fetcher: Fetcher = fetch,
): Promise<MailboxResponse> {
  return readJson<MailboxResponse>(
    await fetcher(`/api/v1/${surface}/${box}`, {
      headers: { accept: "application/json" },
    }),
  );
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}
