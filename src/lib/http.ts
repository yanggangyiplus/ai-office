import { auth } from "@/auth";
import { NotConnectedError } from "./connections";
import { GithubPermissionError } from "./github";
import { AlreadyConfirmedError, ValidationError } from "./meetings";
import { TeamSetupError } from "./errors";
import { NotionLinkError } from "./notion";
import { ForbiddenError } from "./offices";

// Runs an authenticated handler body and maps domain errors to HTTP statuses.
export async function handle(
  fn: (userId: string, user: { id: string; email: string; name: string }) => Promise<unknown>,
): Promise<Response> {
  const s = await auth();
  if (!s) return new Response("unauthorized", { status: 401 });
  try {
    return Response.json((await fn(s.user.id, s.user)) ?? { ok: true });
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("forbidden", { status: 403 });
    if (e instanceof AlreadyConfirmedError) return new Response("already confirmed", { status: 409 });
    if (e instanceof ValidationError) return new Response(e.message, { status: 400 });
    if (e instanceof TeamSetupError) return new Response(`team_setup:${e.what}`, { status: 409 });
    if (e instanceof NotConnectedError) return new Response(`not_connected:${e.provider}`, { status: 428 });
    if (e instanceof GithubPermissionError) return new Response(`github_permission:${e.repo}`, { status: 403 });
    if (e instanceof NotionLinkError) return new Response(e.reason, { status: 422 });
    throw e;
  }
}
