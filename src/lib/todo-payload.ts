export type Todo = { id: string; title: string; assigneeUserId: string | null; repo: string; description: string | null; issueUrl: string | null; role: string | null };

// The save body for the todo editor: editable rows only, and the role travels with them.
export const todoPayload = (rows: Todo[]) =>
  rows
    .filter((t) => !t.issueUrl && t.title.trim())
    .map(({ title, assigneeUserId, repo, description, role }) => ({ title, assigneeUserId, repo, description: description ?? undefined, role }));
