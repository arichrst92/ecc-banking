"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { login } from "@/lib/auth";

export async function loginAction(formData: FormData) {
  const scope = String(formData.get("scope") ?? "global") as "global" | "branch";
  const branchIdRaw = formData.get("branch_id");
  const branchId = branchIdRaw ? Number(branchIdRaw) : undefined;
  const code = String(formData.get("code") ?? "");

  const h = headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "0.0.0.0";
  const userAgent = h.get("user-agent") ?? undefined;

  const result = await login({ scope, branchId, code, ip, userAgent });

  if (result.ok) redirect("/dashboard");

  const msg =
    result.reason === "RATE_LIMITED"
      ? "Terlalu banyak percobaan. Tunggu 15 menit lalu coba lagi."
      : result.reason === "BAD_INPUT"
      ? "Kode harus 8 digit angka."
      : "Kode akses salah.";

  redirect(`/login?err=${encodeURIComponent(msg)}`);
}
