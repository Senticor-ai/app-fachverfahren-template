// /admin/users — Benutzerverwaltung: verlangt users.manage (Guard IN der Sicht, nicht als
// Routen-Gruppe — der Fallback führt Nicht-Admins zu /boards statt in eine Schleife).
import { RequirePermission } from "../app/guards.js";
import { BoardsShell } from "../app/boards-shell.js";
import { AdminUsersPage } from "../AdminUsersPage.js";

export function AdminUsersRoute(): React.JSX.Element {
  return (
    <RequirePermission permission="users.manage">
      <BoardsShell activeNavKey="admin-users">
        <AdminUsersPage />
      </BoardsShell>
    </RequirePermission>
  );
}
