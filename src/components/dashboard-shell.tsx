"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, BookUser, LogOut, Package, ReceiptIndianRupee, Settings, Zap } from "lucide-react";
import { ShopContext, useShopRealtime } from "@/hooks/use-shop-data";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { MemberRole, Shop } from "@/types/database.types";

const NAV = [
  { href: "/pos", label: "Billing", icon: ReceiptIndianRupee, key: "1" },
  { href: "/inventory", label: "Inventory", icon: Package, key: "2" },
  { href: "/khata", label: "Khata", icon: BookUser, key: "3" },
  { href: "/analytics", label: "Reports", icon: BarChart3, key: "4" },
  { href: "/settings", label: "Settings", icon: Settings, key: "5" },
];

function Realtime() {
  useShopRealtime();
  return null;
}

export function DashboardShell({
  shop,
  role,
  email,
  children,
}: {
  shop: Shop;
  role: MemberRole;
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Alt+1..5 jumps between modules without the mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const item = NAV.find((n) => n.key === e.key);
      if (item) {
        e.preventDefault();
        router.push(item.href);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const signOut = async () => {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <ShopContext.Provider value={{ shop, role }}>
      <Realtime />
      <div className="flex h-dvh">
        <nav className="flex w-16 shrink-0 flex-col items-center gap-1 border-r bg-muted/40 py-3">
          <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground" title={shop.name}>
            <Zap className="size-5" />
          </div>
          {NAV.map(({ href, label, icon: Icon, key }) => (
            <Link
              key={href}
              href={href}
              title={`${label} (Alt+${key})`}
              className={cn(
                "flex w-14 flex-col items-center gap-0.5 rounded-md py-2 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
                pathname.startsWith(href) && "bg-accent text-foreground",
              )}
            >
              <Icon className="size-5" />
              {label}
            </Link>
          ))}
          <button
            onClick={signOut}
            title={`Sign out ${email}`}
            className="mt-auto flex w-14 flex-col items-center gap-0.5 rounded-md py-2 text-[10px] text-muted-foreground hover:bg-accent"
          >
            <LogOut className="size-5" />
            Exit
          </button>
        </nav>
        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </ShopContext.Provider>
  );
}
