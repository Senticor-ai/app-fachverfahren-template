// /konto/passwort — Passwortwechsel des eigenen Kontos in der Workspace-Hülle.
import { BoardsShell } from "../app/boards-shell.js";
import { PasswordChangePage } from "../PasswordChangePage.js";

export function KontoPasswortPage(): React.JSX.Element {
  // Kein Sidebar-Eintrag „Konto" — bewusst kein aktiver Nav-Schlüssel.
  return (
    <BoardsShell activeNavKey="konto">
      <PasswordChangePage />
    </BoardsShell>
  );
}
