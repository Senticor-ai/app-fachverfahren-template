import {
  defaultMockUserId,
  type LoginRequest,
  type MockNotificationsResponse,
  type MockSessionResponse,
} from "../../shared/mock-data.js";

type Fetcher = typeof fetch;

export async function loadSession(
  fetcher: Fetcher = fetch,
): Promise<MockSessionResponse> {
  return readJson<MockSessionResponse>(
    await fetcher("/api/v1/session", {
      headers: { accept: "application/json" },
    }),
  );
}

export async function loginMockUser(
  userId: string = defaultMockUserId,
  fetcher: Fetcher = fetch,
): Promise<MockSessionResponse> {
  const body: LoginRequest = { userId };
  return readJson<MockSessionResponse>(
    await fetcher("/api/v1/session/login", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
}

export async function logoutSession(
  fetcher: Fetcher = fetch,
): Promise<MockSessionResponse> {
  return readJson<MockSessionResponse>(
    await fetcher("/api/v1/session/logout", {
      method: "POST",
      headers: { accept: "application/json" },
    }),
  );
}

export async function loadNotifications(
  fetcher: Fetcher = fetch,
): Promise<MockNotificationsResponse> {
  return readJson<MockNotificationsResponse>(
    await fetcher("/api/v1/notifications", {
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
