import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { DashboardShell } from "@/components/shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return (
    <DashboardShell user={{ name: user.name, email: user.email, hue: user.avatarHue ?? 100 }}>
      {children}
    </DashboardShell>
  );
}
