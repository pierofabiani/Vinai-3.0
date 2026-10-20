import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { authClient } from "./auth";
import type { Me } from "./types";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/me"), staleTime: 60_000 });
}

export function useSignOut() {
  const qc = useQueryClient();
  return async () => {
    await authClient.signOut();
    qc.clear();
    window.location.assign("/accesso");
  };
}

export const isStaff = (me: Me | undefined) => me?.user?.role === "admin" || me?.user?.role === "tecnico";
export const isAdmin = (me: Me | undefined) => me?.user?.role === "admin";
