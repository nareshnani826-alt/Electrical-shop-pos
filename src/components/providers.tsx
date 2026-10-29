"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Realtime pushes invalidations, so polling and focus refetches are unnecessary.
            staleTime: 5 * 60_000,
            gcTime: 24 * 60 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
          mutations: { networkMode: "online" },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
