import { auth } from "@/auth";
import { AlreadyConfirmedError } from "./meetings";
import { NotionLinkError } from "./notion";
import { ForbiddenError } from "./offices";

// Runs an authenticated handler body and maps domain errors to HTTP statuses.
export async function handle(fn: (userId: string) => Promise<unknown>): Promise<Response> {
  const s = await auth();
  if (!s) return new Response("unauthorized", { status: 401 });
  try {
    return Response.json((await fn(s.user.id)) ?? { ok: true });
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("forbidden", { status: 403 });
    if (e instanceof AlreadyConfirmedError) return new Response("already confirmed", { status: 409 });
    if (e instanceof NotionLinkError) return new Response(e.reason, { status: 422 });
    throw e;
  }
}
