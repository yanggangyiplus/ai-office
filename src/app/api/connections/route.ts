import { db } from "@/db";
import { deleteConnection, saveConnection, type Provider } from "@/lib/connections";
import { handle } from "@/lib/http";
import { upsertUser } from "@/lib/offices";

// Tokens go in, never out: the response carries no token, and the page only learns "connected or not".
export async function POST(req: Request) {
  const { provider, token } = await req.json().catch(() => ({}));
  return handle(async (userId, user) => {
    await upsertUser(db, user); // the user row may be missing right after a dev database reset
    await saveConnection(db, userId, provider as Provider, String(token ?? ""));
  });
}

export async function DELETE(req: Request) {
  const provider = new URL(req.url).searchParams.get("provider");
  return handle((userId) => deleteConnection(db, userId, provider as Provider));
}
