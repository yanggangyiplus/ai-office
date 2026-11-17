"use server";
import { redirect } from "next/navigation";
import { auth, signIn, signOut } from "@/auth";
import { db } from "@/db";
import { createInvite, joinByInvite, requireAdmin, upsertUser } from "@/lib/offices";

// Server actions live here, not inline in pages: an inline action that captures a variable makes Next
// encrypt it with crypto.getRandomValues() during render, which breaks prerendering. Values arrive as form fields instead.

export async function googleSignIn() {
  await signIn("google", { redirectTo: "/me" });
}

export async function testSignIn(form: FormData) {
  await signIn("test", { name: String(form.get("name") ?? ""), redirectTo: "/me" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

export async function makeInvite(form: FormData) {
  const s = await auth();
  if (!s) redirect("/");
  const officeId = String(form.get("officeId") ?? "");
  await requireAdmin(db, officeId, s.user.id);
  const code = await createInvite(db, officeId);
  redirect(`/offices/${officeId}?invite=${code}`);
}

export async function joinOffice(form: FormData) {
  const s = await auth();
  if (!s) redirect("/");
  const github = String(form.get("github") ?? "").trim();
  if (!github) return;
  await upsertUser(db, s.user);
  const { officeId } = await joinByInvite(db, String(form.get("code") ?? ""), s.user.id, github);
  redirect(`/offices/${officeId}`);
}
