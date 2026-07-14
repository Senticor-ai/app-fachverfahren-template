// /boards/:boardId — EIN Kanban-Board des Team-Workspace.
import { useParams } from "react-router-dom";
import { KanbanBoard } from "@senticor/fachverfahren-kit";
import { boardPort } from "../app/board-port.js";
import { BoardsShell } from "../app/boards-shell.js";

export function BoardDetailPage(): React.JSX.Element {
  const { boardId = "" } = useParams();
  return (
    <BoardsShell activeNavKey="boards">
      <KanbanBoard boardId={boardId} port={boardPort} />
    </BoardsShell>
  );
}
