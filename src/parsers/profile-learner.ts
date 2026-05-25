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

1. structure (PILIH SATU):
   - "key_value_header" → header pakai "Key : Value" lines (BCA, Mandiri umumnya)
     ★ WAJIB ada field 'table_start' dengan array kolom header
   - "marker_based" → setiap baris diawali marker (HSBC pakai H1/H2/D1/D2/T di kolom 0)
     ★ WAJIB ada field 'markers' dengan: marker_column (int), header_data (str),
       table_row (str), optional table_header (str), optional footer_summary (str)
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
   - index 0-based, INCLUDE marker kalau marker_based (jadi marker di index 0, kolom data mulai dari index 1)
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

CONTOH MARKER_BASED (HSBC Malaysia):
File:
   H1,Account Number,Type,Account Currency,Account Name,Date From,Date To
   H2,2233093302,CURRENT_ACCOUNT,MYR,EL SHADDAI CREATIVE,17/05/2026,22/05/2026
   D1,Account Number,Value Date,Date,Time,Description,...,Deposit,Withdrawal,Ledger Balance
   D2,2233093302,20/05/2026,20/05/2026,09:55:31 AM,Trf Wd EB,...,0.00,500.00,2040.93
   T,,,,,,...,Total in Account Currency,948.00,1314.24

Config yang BENAR untuk file di atas:
{
  "structure": "marker_based",
  "markers": {
    "marker_column": 0,
    "header_data": "H2",
    "table_row": "D2",
    "table_header": "D1",
    "footer_summary": "T"
  },
  "account_number": { "mode": "marker_column", "column": 1 },
  "currency":       { "mode": "marker_column", "column": 3 },
  "period":         { "mode": "marker_columns", "from_column": 5, "to_column": 6, "date_format": "DD/MM/YYYY" },
  "number":         { "thousand_separator": ",", "decimal_separator": "." },
  "tx_date_format": "DD/MM/YYYY",
  "tx_time_format": "HH:MM:SS_AM_PM",
  "columns": {
    "tx_date":     { "index": 3 },
    "tx_time":     { "index": 4 },
    "description": { "index": 5 },
    "credit":      { "index": 17 },
    "debit":       { "index": 18 },
    "balance":     { "index": 19 }
  },
  "footer": {
    "summary_marker": "T",
    "summary_credit_column": 17,
    "summary_debit_column": 18
  }
}

PENTING:
- Pattern regex harus escape special chars dengan benar (\\\\d, \\\\s, dst)
- Test mental: kalau ada file lain format sama tapi data berbeda, apakah pattern masih match?
- bank_hint: tebak bank-nya berdasarkan format khas (mis. "BCA Corporate", "HSBC Malaysia", "Mandiri Internet Banking")
- name: deskriptif, mis. "BCA Corporate CSV" atau "HSBC Malaysia CSV"
- detect_patterns: 1-3 regex yang HARUS match di ~2KB pertama file. Pilih unique signature (mis. "Informasi Rekening", "H1.*Account Number", dll)
- VALIDASI SENDIRI sebelum submit: kalau structure="marker_based", apakah markers ter-include? Kalau "key_value_header", apakah table_start ter-include?
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

  // Initial call
  let response = await client.messages.create({
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

  let toolBlock = response.content.find((c: any) => c.type === "tool_use") as any;
  if (!toolBlock) throw new Error("Claude tidak return tool_use");

  // Validate; kalau gagal, retry 1× dengan error feedback ke Claude
  let validationError: string | null = null;
  try {
    validateConfig(toolBlock.input.config);
  } catch (e: any) {
    validationError = e.message;
  }

  let retryCost = 0;
  if (validationError) {
    // Retry sekali dengan feedback
    const retryResponse = await client.messages.create({
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
        {
          role: "assistant",
          content: response.content as any,
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: toolBlock.id,
              is_error: true,
              content: `Config validation gagal: ${validationError}\n\nMohon perbaiki dan submit ulang config lengkap. Pastikan baca lagi contoh format di system prompt.`,
            } as any,
          ] as any,
        },
      ],
    });
    const retryToolBlock = retryResponse.content.find((c: any) => c.type === "tool_use") as any;
    if (!retryToolBlock) throw new Error(`Claude retry gagal, original error: ${validationError}`);

    try {
      validateConfig(retryToolBlock.input.config);
    } catch (e: any) {
      throw new Error(
        `LLM generate config invalid 2× berturut-turut. Original: ${validationError}. Retry: ${e.message}. ` +
        `File mungkin format yang sangat tidak biasa. Coba build profile manual di Kelola Format Parser.`
      );
    }

    toolBlock = retryToolBlock;
    response = retryResponse;
    retryCost = estimateCost(model, retryResponse.usage.input_tokens, retryResponse.usage.output_tokens);
  }

  const input = toolBlock.input as {
    name: string;
    bank_hint?: string;
    detect_patterns: string[];
    config: FormatProfileConfig;
  };

  // Validate minimal
  if (!input.name || !input.detect_patterns || !input.config) {
    throw new Error("Tool output dari LLM tidak lengkap (name/detect_patterns/config kosong)");
  }
  validateConfig(input.config);

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cost = estimateCost(model, inputTokens, outputTokens) + retryCost;

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

/**
 * Validasi structural FormatProfileConfig sebelum save.
 * Catch LLM yang generate config invalid (mis. structure="marker_based" tapi markers missing).
 */
function validateConfig(cfg: FormatProfileConfig): void {
  if (!cfg) throw new Error("Config kosong");
  if (!cfg.structure) throw new Error("Config.structure wajib");

  if (cfg.structure === "marker_based") {
    if (!cfg.markers) {
      throw new Error(
        "Config.structure='marker_based' tapi tidak include 'markers' object. " +
        "Wajib: { marker_column, header_data, table_row, optional table_header, optional footer_summary }"
      );
    }
    if (typeof cfg.markers.marker_column !== "number") {
      throw new Error("markers.marker_column wajib number (kolom index 0-based)");
    }
    if (!cfg.markers.header_data) {
      throw new Error("markers.header_data wajib (mis. 'H2' untuk HSBC)");
    }
    if (!cfg.markers.table_row) {
      throw new Error("markers.table_row wajib (mis. 'D2' untuk HSBC)");
    }
  }

  if (cfg.structure === "key_value_header") {
    if (!cfg.table_start) {
      throw new Error(
        "Config.structure='key_value_header' tapi tidak include 'table_start' object. " +
        "Wajib: { detect: string[], skip_until_after: boolean }"
      );
    }
    if (!Array.isArray(cfg.table_start.detect) || cfg.table_start.detect.length === 0) {
      throw new Error("table_start.detect wajib non-empty array (kolom header tabel)");
    }
  }

  if (!cfg.account_number) throw new Error("account_number wajib");
  if (!cfg.currency) throw new Error("currency wajib");
  if (!cfg.period) throw new Error("period wajib");
  if (!cfg.number) throw new Error("number config wajib (thousand_separator, decimal_separator)");
  if (!cfg.tx_date_format) throw new Error("tx_date_format wajib");
  if (!cfg.columns) throw new Error("columns wajib");
  if (!cfg.columns.tx_date) throw new Error("columns.tx_date wajib");
  if (!cfg.columns.description) throw new Error("columns.description wajib");

  // Amount: harus salah satu dari amount_with_suffix ATAU (debit + credit)
  const hasSuffix = !!cfg.columns.amount_with_suffix;
  const hasSplit = !!cfg.columns.debit && !!cfg.columns.credit;
  if (!hasSuffix && !hasSplit) {
    throw new Error(
      "columns wajib punya 'amount_with_suffix' (single column DR/CR) ATAU pasangan 'debit'+'credit' (two columns)"
    );
  }
}
