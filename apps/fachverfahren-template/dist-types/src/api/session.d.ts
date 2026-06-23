import { type MockNotificationsResponse, type MockSessionResponse } from "../../shared/mock-data.js";
type Fetcher = typeof fetch;
export declare function loadSession(fetcher?: Fetcher): Promise<MockSessionResponse>;
export declare function loginMockUser(userId?: string, fetcher?: Fetcher): Promise<MockSessionResponse>;
export declare function logoutSession(fetcher?: Fetcher): Promise<MockSessionResponse>;
export declare function loadNotifications(fetcher?: Fetcher): Promise<MockNotificationsResponse>;
export {};
