import * as React from "react";
import { useNavigate } from "react-router-dom";
import { AdminOnboarding } from "@senticor/fachverfahren-kit";
import {
  onboardingDismissKey,
  onboardingSchritte,
  shouldShowAdminOnboarding,
  userCountFromResponse,
} from "./admin-onboarding.js";
import { apiPath } from "./board-client.js";
import { useSession } from "./session.js";

interface AdminOnboardingCardProps {
  onDismissed?: () => void;
  fetchImpl?: typeof fetch;
  storage?: Pick<Storage, "getItem" | "setItem">;
}

function readDismissed(
  actorId: string,
  storage: Pick<Storage, "getItem" | "setItem"> | undefined,
): boolean {
  try {
    return storage?.getItem(onboardingDismissKey(actorId)) === "1";
  } catch {
    return false;
  }
}

function defaultStorage(): Pick<Storage, "getItem" | "setItem"> | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function AdminOnboardingCard({
  onDismissed,
  fetchImpl = fetch,
  storage = defaultStorage(),
}: AdminOnboardingCardProps): React.ReactElement | null {
  const { principal } = useSession();
  const navigate = useNavigate();
  const actorId = principal?.actorId ?? null;
  const permissions = principal?.permissions;
  const canManageUsers = permissions?.includes("users.manage") ?? false;
  const [dismissState, setDismissState] = React.useState<{
    actorId: string | null;
    dismissed: boolean | null;
  }>({ actorId: null, dismissed: null });
  const [countState, setCountState] = React.useState<{
    actorId: string | null;
    count: number | null;
  }>({ actorId: null, count: null });

  React.useEffect(() => {
    setCountState({ actorId, count: null });
    setDismissState({
      actorId,
      dismissed: actorId ? readDismissed(actorId, storage) : null,
    });
  }, [actorId, storage]);

  const dismissed =
    dismissState.actorId === actorId ? dismissState.dismissed : null;

  React.useEffect(() => {
    if (!actorId || !canManageUsers || dismissed !== false) return;
    let active = true;
    void (async () => {
      try {
        const response = await fetchImpl(apiPath("/api/v1/users"), {
          credentials: "include",
        });
        const count = await userCountFromResponse(response);
        if (active && count !== null) {
          setCountState({ actorId, count });
        }
      } catch {
        // Fail closed: die Board-Liste bleibt nutzbar, die Karte unsichtbar.
      }
    })();
    return () => {
      active = false;
    };
  }, [actorId, canManageUsers, dismissed, fetchImpl]);

  const userCount = countState.actorId === actorId ? countState.count : null;
  if (
    dismissed === null ||
    !shouldShowAdminOnboarding({
      actorId,
      permissions,
      userCount,
      dismissed,
    })
  ) {
    return null;
  }

  const handleDismiss = () => {
    setDismissState({ actorId, dismissed: true });
    if (actorId) {
      try {
        storage?.setItem(onboardingDismissKey(actorId), "1");
      } catch {
        // In-Memory-Ausblendung gilt trotzdem bis zum Reload.
      }
    }
    onDismissed?.();
  };

  return (
    <AdminOnboarding
      schritte={onboardingSchritte()}
      onNavigate={(href) => navigate(href)}
      onDismiss={handleDismiss}
      className="mx-auto w-full max-w-5xl px-6 pt-6"
    />
  );
}
