import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { ShopSetup } from "@/components/shop-setup";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole, Shop } from "@/types/database.types";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: member } = await supabase
    .from("shop_members")
    .select("role, shops(*)")
    .eq("user_id", auth.user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle<{ role: MemberRole; shops: Shop }>();

  if (!member?.shops) return <ShopSetup />;

  return (
    <DashboardShell shop={member.shops} role={member.role} email={auth.user.email ?? ""}>
      {children}
    </DashboardShell>
  );
}
