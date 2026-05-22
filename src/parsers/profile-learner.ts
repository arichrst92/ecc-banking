// LLM bootstrap: analisa file unknown, generate FormatProfileConfig via tool use.
// Hasil profile disimpan ke tabel format_profiles untuk reuse di upload berikutnya.

import { getAnthropic, getParserModel, getParserMaxTokens, estimateCost } from "@/lib/anthropic";
import { db } from "@/lib/db";
import type { FormatProfileConfig } from "./profile-config";

const SYSTEM_PROMPT = `
Kamu adalah parser-generator untuk file mutasi rekening bank di Indonesia/Asia Tenggara.

TUGAS: Analisa file CSV mutasi yang user kirim, lalu generate FormatProfileConfig (JSON via tool 'submit_format_profile') yang menjelaskan CARA parse file format ini secara umum.

Profile ini akan disimpan dan dipakai untuk parse file lain dengan format YANG SAMA tanpa LLM call lagi. Jadi config harus akurat dan general — bukan untuk file spesifik ini saja.

ATURAN:

1. structure:
   - "key_value_header" → header pakai "Key : Value" lines (BCA, Mandiri umumnya)
   - "marker_based" → setiap baris diawali marker (HSBC pakai H1/H2/D1/D2/T di kolom 0)
   - "pure_table" → tidak ada header section, langsung tabel

2. account_number:
   - mode "regex_line" → tulis pattern PCRE yang cocok di SEMUA file format ini
   - mode "marker_column" → kolom index (0-based, MASUK marker)
   - Wajib output digit-only

3. currency:
   - mode "regex_line" / "marker_column" / "fixed"
   - normalize: kalau bank tulis "Rp" → output IDR. Tambah list normalize array kalau ada special char

4. period (date_from + date_to):
   - mode "regex_line" dengan 1 pattern + 2 groups, ATAU "marker_columns" 2 indices
   - date_format: enum DD/MM/YYYY | DD-MM-YYYY | YYYY-MM-DD | MM/DD/YYYY

5. tx_date_format dalam baris transaksi: kalau hanya DD/MM (tanpa tahun, BCA), tahun di-derive otomatis dari period

6. columns dalam baris transaksi:
   - index 0-based, INCLUDE marker kalau marker_based
   - description.extra_indices: kalau ada multiple kolom keterangan/reference, sebut indices-nya supaya digabung
   - amount_with_suffix: kalau bank pakai 1 kolom "1,000.00 DB" / "1,000.00 CR"
   - debit + credit: kalau pakai 2 kolom terpisah (mis. HSBC Deposit + Withdrawal)
   - balance: kolom saldo setelah transaksi

7. number format:
   - thousand_separator dan decimal_separator
   - Indonesia umumnya: thousand "," decimal "." (mis. "1,234,567.89")

8. footer (opsional):
   - opening_balance, closing_balance, total_debit, total_credit
   - mode pattern regex_line ATAU summary_marker + summary_*_column

9. JANGAN tebak format yang tidak terlihat di file. Lebih baik field optional null daripada salah pattern.

PENTING:
- Pattern regex harus escape special chars dengan benar (\\\\d, \\\\s, dst)
- Test mental: kalau ada file lain format sama tapi data berbeda, apakah pattern masih match?
- bank_hint: tebak bank-nya berdasarkan format khas (mis. "BCA Corporate", "HSBC Malaysia", "Mandiri Internet Banking")
- name: deskriptif, mis. "BCA Corporate CSV" atau "HSBC Malaysia CSV"
- detect_patterns: 1-3 regex yang HARUS match di ~2KB pertama file. Pilih unique signature (mis. "Informasi Rekening", "H1.*Account Number", dll)
`.trim();

export interface LearnResult {
  profile_id: number;
  name: string;
  bank_hint: string | null;
  config: FormatProfileConfig;
  llm_model: string;
  llm_input_tokens: number;
  llm_output_tokens: number;
  llm_cost_usd: number;
}

const FORMAT_PROFILE_TOOL = {
  name: "submit_format_profile" as const,
  description: "Submit hasil analisa format file mutasi sebagai parser config",
  input_schema: {
    type: "object" as const,
    required: ["name", "detect_patterns", "config"],
    properties: {
      name: {
        type: "string",
        description: "Nama deskriptif format, mis. 'BCA Corporate CSV' atau 'HSBC Malaysia CSV'",
      },
      bank_hint: {
        type: "string",
        description: "Tebakan bank/penerbit format, mis. 'BCA', 'HSBC Malaysia'",
      },
      detect_patterns: {
        type: "array",
        items: { type: "string" },
        description: "1-3 regex PCRE yang harus match di awal file (2KB pertama). Pilih unique signature dari format.",
        minItems: 1,
        maxItems: 3,
      },
      config: {
        type: "object",
        description: "FormatProfileConfig sesuai schema. Lihat system prompt untuk detail field.",
        // Tidak strict schema di sini supaya LLM bebas — validasi via Zod runtime.
      },
    },
  },
};

export async function learnFormatProfile(
  content: string,
  meta: { filename: string; actor_role: string }
): Promise<LearnResult> {
  const client = getAnthropic();
  const model = getParserModel();
  const maxTokens = getParserMaxTokens();

  // Truncate content kalau terlalu panjang (token limit safety)
  // Heuristik: ~4 char per token. Untuk 100K context, sisain margin 80K char = 20K tokens.
  const MAX_CHARS = 60_000;
  const trimmed = content.length > MAX_CHARS
    ? content.slice(0, MAX_CHARS) + "\n\n[... file terpotong, ada sekitar " +
      Math.round((content.length - MAX_CHARS) / 1000) + "KB lagi, struktur biasanya sama ...]"
    : content;

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: SYSTEM_PROMPT,
    tools: [FORMAT_PROFILE_TOOL as any],
    tool_choice: { type: "tool", name: FORMAT_PROFILE_TOOL.name } as any,
    messages: [
      {
        role: "user",
        content: `Filename: ${meta.filename}\n\n--- File content ---\n${trimmed}`,
      },
    ],
  });

  const toolBlock = response.content.find((c: any) => c.type === "tool_use") as any;
  if (!toolBlock) throw new Error("Claude tidak return tool_use");

  const input = toolBlock.input as {
    name: string;
    bank_hint?: string;
    detect_patterns: string[];
    config: FormatProfileConfig;
  };

  // Validate minimal
  if (!input.name || !input.detect_patterns || !input.config) {
    throw new Error("Tool output dari LLM tidak lengkap");
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cost = estimateCost(model, inputTokens, outputTokens);

  // Simpan ke DB
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO format_profiles
       (name, bank_hint, detect_patterns, config, status, created_by, created_by_role,
        llm_model, llm_input_tokens, llm_output_tokens, llm_cost_usd)
     VALUES ($1, $2, $3, $4::jsonb, 'active', 'llm', $5, $6, $7, $8, $9)
     ON CONFLICT (name) DO UPDATE SET
       config = EXCLUDED.config,
       detect_patterns = EXCLUDED.detect_patterns,
       llm_model = EXCLUDED.llm_model,
       llm_input_tokens = EXCLUDED.llm_input_tokens,
       llm_output_tokens = EXCLUDED.llm_output_tokens,
       llm_cost_usd = EXCLUDED.llm_cost_usd,
       updated_at = NOW()
     RETURNING id`,
    [
      input.name,
      input.bank_hint ?? null,
      input.detect_patterns,
      JSON.stringify(input.config),
      meta.actor_role,
      model,
      inputTokens,
      outputTokens,
      cost.toFixed(4),
    ]
  );

  return {
    profile_id: rows[0].id,
    name: input.name,
    bank_hint: input.bank_hint ?? null,
    config: input.config,
    llm_model: model,
    llm_input_tokens: inputTokens,
    llm_output_tokens: outputTokens,
    llm_cost_usd: cost,
  };
}
