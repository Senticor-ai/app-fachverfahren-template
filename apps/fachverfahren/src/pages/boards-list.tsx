// /boards — die Board-Übersicht des Team-Workspace. Die Session-Pflicht liegt zentral auf
// der RequireSessionOutlet-Layout-Route — die Sicht selbst prüft nur ihre Permission
// (über die Routen-Gruppe, siehe src/app/routes.tsx).
import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { BoardList } from "@senticor/fachverfahren-kit";
import { AdminOnboardingCard } from "../AdminOnboardingCard.js";
import { boardPort } from "../app/board-port.js";
import { BoardsShell } from "../app/boards-shell.js";

export function BoardsListPage(): React.JSX.Element {
  const navigate = useNavigate();
  const boardsRegion = useRef<HTMLDivElement>(null);
  return (
    <BoardsShell activeNavKey="boards">
      <AdminOnboardingCard onDismissed={() => boardsRegion.current?.focus()} />
      <div
        ref={boardsRegion}
        role="region"
        aria-label="Boards"
        tabIndex={-1}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <BoardList
          port={boardPort}
          onOpen={(id) => navigate(`/boards/${id}`)}
        />
      </div>
    </BoardsShell>
  );
}
