// /boards — die Board-Übersicht des Team-Workspace. Die Session-Pflicht liegt zentral auf
// der RequireSessionOutlet-Layout-Route — die Sicht selbst prüft nur ihre Permission
// (über die Routen-Gruppe, siehe src/app/routes.tsx).
import { useNavigate } from "react-router-dom";
import { BoardList } from "@senticor/fachverfahren-kit";
import { boardPort } from "../app/board-port.js";
import { BoardsShell } from "../app/boards-shell.js";

export function BoardsListPage(): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <BoardsShell activeNavKey="boards">
      <BoardList port={boardPort} onOpen={(id) => navigate(`/boards/${id}`)} />
    </BoardsShell>
  );
}
