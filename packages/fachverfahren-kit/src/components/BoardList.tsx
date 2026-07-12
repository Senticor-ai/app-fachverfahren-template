// components/BoardList — Übersicht der eigenen Boards als responsives Karten-Grid (reflowt bei
// 400%-Zoom von selbst, anders als eine Tabelle). Data-driven über `BoardPort`.
import * as React from "react";
import { LayoutGrid, Plus } from "lucide-react";
import type { Board, BoardPort, CreateBoardInput } from "../board-types.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.js";
import { SkeletonCard } from "../ui/skeleton.js";
import { EmptyState } from "./EmptyState.js";
import { ErrorState } from "./ErrorState.js";
import { CreateBoardDialog } from "./CreateBoardDialog.js";

export interface BoardListProps<TCardData = Record<string, unknown>> {
  port: BoardPort<TCardData>;
  onOpen: (boardId: string) => void;
}

export function BoardList<TCardData = Record<string, unknown>>({
  port,
  onOpen,
}: BoardListProps<TCardData>): React.ReactElement {
  const [boards, setBoards] = React.useState<Board[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBoards(await port.listBoards());
    } catch {
      setError("Boards konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [port]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  async function handleCreate(input: CreateBoardInput) {
    const board = await port.createBoard(input);
    await reload();
    onOpen(board.boardId);
  }

  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-5 w-5 text-foreground" aria-hidden="true" />
          <h1 className="text-2xl font-semibold text-foreground">Boards</h1>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Neues Board
        </Button>
      </div>

      <div className="mt-6">
        {loading ? (
          <div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            role="status"
            aria-label="Boards werden geladen"
          >
            {Array.from({ length: 3 }, (_, index) => (
              <SkeletonCard key={index} className="h-32" />
            ))}
          </div>
        ) : error ? (
          <ErrorState
            title="Boards konnten nicht geladen werden"
            description={error}
            onRetry={() => void reload()}
          />
        ) : !boards || boards.length === 0 ? (
          <EmptyState
            icon={LayoutGrid}
            title="Noch keine Boards"
            description="Legen Sie Ihr erstes Board an, um loszulegen."
            action={{
              label: "Neues Board",
              onClick: () => setCreateOpen(true),
            }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {boards.map((board) => (
              <Card
                key={board.boardId}
                role="link"
                tabIndex={0}
                aria-label={`Board ${board.title} öffnen`}
                className="cursor-pointer transition-colors hover:bg-secondary/40 focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
                onClick={() => onOpen(board.boardId)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(board.boardId);
                  }
                }}
              >
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    <span className="truncate">{board.title}</span>
                    {/* Team-Boards sind für alle Tenant-Mitglieder sichtbar — der Hinweis
                        unterscheidet sie vom persönlichen Board. */}
                    {board.visibility === "team" && (
                      <Badge tone="info">Team</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                {board.description && (
                  <CardContent className="text-sm text-muted-foreground">
                    {board.description}
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      <CreateBoardDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={handleCreate}
      />
    </section>
  );
}
