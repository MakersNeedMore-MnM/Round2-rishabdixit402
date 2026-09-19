import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Already signed in? Never ask a second time - go straight to the workspace.
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  return <LoginForm />;
}
