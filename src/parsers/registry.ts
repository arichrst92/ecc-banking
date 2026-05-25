// Parser registry — flow hybrid:
//   1. Hardcoded adapters (BCA, dll) — paling cepat
//   2. format_profiles dari DB (active) — generic engine + schema config
//   3. LLM bootstrap — analisa format baru, generate profile, parse

import { bcaCsvAdapter } from "./bca-csv";
import { genericParse } from "./generic-engine";
import { learnFormatProfile } from "./profile-learner";
import { query } from "@/lib/db";
import type { ParseAdapter, ParseResult } from "./types";
import type { FormatProfileConfig } from "./profile-config";

const hardcodedAdapters: ParseAdapter[] = [bcaCsvAdapter];

export interface DetectResult {
  result: ParseResult;
  source: "hardcoded" | "profile" | "llm";
  profile_id?: number;
  profile_name?: string;
  llm_cost_usd?: number;
}

export async function detectAndParse(
  content: string,
  filename: string,
  options: {
    actor_role: string;
    allow_llm_fallback?: boolean;
    /**
     * Skip detect, paksa pakai profile dengan ID ini.
     * Useful saat re-parse upload yang format_profile_id-nya sudah tersimpan.
     */
    force_profile_id?: number | null;
  }
): Promise<DetectResult> {
  // ── Step 0: Forced profile (dari upload.format_profile_id) ──
  // Skip detection entirely, langsung apply config dari profile yang dipilih.
  // NOTE: Step 0 = re-parse untuk upload yg sama (preview/confirm), bukan upload baru.
  // Jadi TIDAK increment upload_count/success_count (kalau di-counter, 1 upload jadi 3x).
  if (options.force_profile_id) {
    const profile = await query<{
      id: number;
      name: string;
      config: FormatProfileConfig;
    }>(
      `SELECT id, name, config FROM format_profiles WHERE id = $1 AND status != 'disabled' LIMIT 1`,
      [options.force_profile_id]
    );
    if (profile.length > 0) {
      const p = profile[0];
      const result = genericParse(content, p.config as FormatProfileConfig, p.name);
      return { result, source: "profile", profile_id: p.id, profile_name: p.name };
    }
    // Profile yang di-force tidak ditemukan atau disabled → fall through ke normal flow
  }

  // ── Step 1: hardcoded adapters ──
  for (const a of hardcodedAdapters) {
    if (a.detect(content, filename)) {
      try {
        const result = await Promise.resolve(a.parse(content));
        return { result, source: "hardcoded", profile_name: a.name };
      } catch {
        // Adapter gagal parse, lanjut ke step berikutnya
      }
    }
  }

  // ── Step 2: format_profiles dari DB ──
  const profiles = await query<{
    id: number;
    name: string;
    detect_patterns: string[];
    config: FormatProfileConfig;
  }>(
    `SELECT id, name, detect_patterns, config
       FROM format_profiles
      WHERE status = 'active'
      ORDER BY upload_count DESC`
  );

  const head = content.slice(0, 2000);
  for (const p of profiles) {
    const allMatch = (p.detect_patterns ?? []).every((pat) => {
      try {
        return new RegExp(pat, "i").test(head);
      } catch {
        return false;
      }
    });
    if (!allMatch) continue;

    try {
      const result = genericParse(content, p.config as FormatProfileConfig, p.name);
      // Bump usage stats
      await query(
        `UPDATE format_profiles
            SET upload_count = upload_count + 1,
                success_count = success_count + 1,
                last_used_at = NOW()
          WHERE id = $1`,
        [p.id]
      );
      return { result, source: "profile", profile_id: p.id, profile_name: p.name };
    } catch (e) {
      await query(
        `UPDATE format_profiles
            SET upload_count = upload_count + 1,
                fail_count = fail_count + 1,
                last_used_at = NOW()
          WHERE id = $1`,
        [p.id]
      );
      // Profile gagal parse — lanjut coba profile berikutnya atau LLM
    }
  }

  // ── Step 3: LLM bootstrap ──
  if (!options.allow_llm_fallback) {
    const hasKey = !!process.env.ANTHROPIC_API_KEY;
    if (!hasKey) {
      throw new Error(
        "Format file tidak dikenal & ANTHROPIC_API_KEY belum di-set di .env.local. " +
        "Tambahkan key dari console.anthropic.com → restart `npm run dev` → upload ulang. " +
        "Atau bangun format profile manual di Kelola Format Parser."
      );
    }
    throw new Error(
      "Format file tidak dikenal. Tidak ada adapter hardcoded atau profile aktif yang cocok. " +
      "LLM fallback di-disable di context ini (mis. saat confirm re-parse)."
    );
  }

  const learned = await learnFormatProfile(content, { filename, actor_role: options.actor_role });

  // Parse pakai config yang baru dipelajari
  const result = genericParse(content, learned.config, learned.name);

  // Bump usage
  await query(
    `UPDATE format_profiles
        SET upload_count = 1, success_count = 1, last_used_at = NOW()
      WHERE id = $1`,
    [learned.profile_id]
  );

  return {
    result,
    source: "llm",
    profile_id: learned.profile_id,
    profile_name: learned.name,
    llm_cost_usd: learned.llm_cost_usd,
  };
}

export function getAdapterNames(): string[] {
  return hardcodedAdapters.map((a) => a.name);
}
