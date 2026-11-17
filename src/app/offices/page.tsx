import { redirect } from "next/navigation";

// The team list moved into my space (the team board in /me).
export default function Offices() {
  redirect("/me");
}
