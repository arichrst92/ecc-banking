// AI-powered categorization batch. Klasifikasi semua transaksi dalam 1 LLM call.
// Fallback ke keyword categorizer kalau ANTHROPIC_API_KEY tidak ada.

import { getAnthropic, getParserModel, getParserMaxTokens, estimateCost } from "@/lib/anthropic";
import { categorize as keywordCategorize } from "./categorizer";
import type { Category } from "@/lib/types";
import type { ParsedTransaction } from "./types";
import { computeDupHash } from "@/lib/dup-hash";

export interface TxClassification {
  category_id: number;
  category_name: string;
  confidence: number; // 0–1
  reason: string;
  method: "ai" | "keyword";
}

export interface BatchCategorizeResult {
  method: "ai" | "keyword";
  model: string | null;
  computed_at: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  // Map: dup_hash → classification
  classifications: Record<string, TxClassification>;
}

const SYSTEM_PROMPT = `
Kamu klasifikator transaksi rekening gereja Indonesia/Asia.

TUGAS: Untuk SETIAP transaksi yang diberikan, tentukan kategori paling sesuai dari daftar kategori yang tersedia. Return via tool 'submit_classifications'.

ATURAN:
- Pakai konteks: keterangan transaksi + direction (in/out) + jumlah
- Setiap kategori punya: id, name, type ("masuk"/"keluar"/"keduanya"), keywords (sebagai hint)
- Pilih kategori yang type-nya cocok dengan direction:
  - direction="in"  → boleh kategori type="masuk" atau "keduanya"
  - direction="out" → boleh kategori type="keluar" atau "keduanya"
- Kalau benar-benar tidak ada yang cocok, gunakan kategori "Lain-lain" (is_system=true)
- confidence: 0.0–1.0
  - 0.9+ kalau keyword match jelas atau context sangat kuat
  - 0.6–0.8 kalau probable match
  - <0.5 kalau ragu — kemungkinan harus jadi "Lain-lain"
- reason: 1 kalimat singkat kenapa kategori itu dipilih (Bahasa Indonesia)

PENTING:
- Setiap transaksi WAJIB punya 1 klasifikasi (tidak boleh skip)
- index harus sesuai urutan transaksi input
- Pertimbangkan konteks gereja: PERSEMBAHAN/PERPULUHAN biasanya pemasukan, BIAYA/PLN biasanya operasional, RETREAT/PA biasanya pelayanan
- Hindari false positive substring (mis. "RAPAT" bukan kategori "PA" walaupun ada substring "PA")
`.trim();

const TOOL = {
  name: "submit_classifications" as const,
  description: "Submit klasifikasi kategori untuk semua transaksi",
  input_schema: {
    type: "object" as const,
    required: ["classifications"],
    properties: {
      classifications: {
        type: "array",
        description: "Klasifikasi per transaksi, urut sesuai input",
        items: {
          type: "object",
          required: ["index", "category_id", "confidence", "reason"],
          properties: {
            index: { type: "integer", description: "Index transaksi (0-based) sesuai urutan input" },
            category_id: { type: "integer", description: "ID kategori yang dipilih" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            reason: { type: "string", description: "1 kalimat penjelasan singkat" },
          },
        },
      },
    },
  },
};

/**
 * Klasifikasi batch transaksi via AI atau fallback keyword.
 * Returns mapping dup_hash → classification.
 */
export async function batchCategorize(
  accountId: number,
  transactions: ParsedTransaction[],
  categories: Category[]
): Promise<BatchCategorizeResult> {
  const computedAt = new Date().toISOString();

  // Build dup_hash → tx index map
  const hashByIndex = transactions.map((t, i) => ({
    index: i,
    dup_hash: computeDupHash(
      accountId,
      t.tx_date,
      t.debit,
      t.credit,
      t.description_normalized
    ),
    tx: t,
  }));

  const hasKey = !!process.env.ANTHROPIC_API_KEY;

  // ── Fallback path: keyword-only (no AI) ──
  if (!hasKey || transactions.length === 0) {
    const classifications: Record<string, TxClassification> = {};
    for (const { dup_hash, tx } of hashByIndex) {
      const catId = keywordCategorize(tx.description_normalized, tx.direction, categories);
      const cat = categories.find((c) => c.id === catId);
      classifications[dup_hash] = {
        category_id: catId,
        category_name: cat?.name ?? "Lain-lain",
        confidence: cat?.is_system ? 0.3 : 0.7,
        reason: cat?.is_system
          ? "Tidak ada keyword match, fallback ke Lain-lain"
          : `Keyword match di "${cat?.name}"`,
        method: "keyword",
      };
    }
    return {
      method: "keyword",
      model: null,
      computed_at: computedAt,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      classifications,
    };
  }

  // ── AI path ──
  const client = getAnthropic();
  const model = getParserModel();
  const maxTokens = getParserMaxTokens();

  // Compact format untuk hemat token
  const categoryList = categories.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    keywords: c.keywords,
    is_system: c.is_system,
  }));

  const txList = transactions.map((t, i) => ({
    index: i,
    desc: t.description,
    direction: t.direction,
    amount: t.direction === "in" ? t.credit : t.debit,
  }));

  const userPrompt = `
KATEGORI TERSEDIA:
${JSON.stringify(categoryList, null, 2)}

TRANSAKSI UNTUK DIKLASIFIKASI (${transactions.length} total):
${JSON.stringify(txList, null, 2)}
`.trim();

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: SYSTEM_PROMPT,
    tools: [TOOL as any],
    tool_choice: { type: "tool", name: TOOL.name } as any,
    messages: [{ role: "user", content: userPrompt }],
  });

  const toolBlock = response.content.find((c: any) => c.type === "tool_use") as any;
  if (!toolBlock) {
    // Fallback: keyword
    return batchCategorize(accountId, transactions, categories);
  }

  const input = toolBlock.input as {
    classifications: Array<{ index: number; category_id: number; confidence: number; reason: string }>;
  };

  const classifications: Record<string, TxClassification> = {};
  const fallbackCat = categories.find((c) => c.is_system);
  if (!fallbackCat) {
    throw new Error("Kategori system 'Lain-lain' tidak ditemukan. Jalankan seed migration.");
  }

  // Build by index
  const aiByIndex = new Map<number, { category_id: number; confidence: number; reason: string }>();
  for (const c of input.classifications) {
    aiByIndex.set(c.index, c);
  }

  for (const { index, dup_hash, tx } of hashByIndex) {
    const ai = aiByIndex.get(index);
    if (ai) {
      // Validate category exists
      const cat = categories.find((c) => c.id === ai.category_id);
      if (cat) {
        classifications[dup_hash] = {
          category_id: cat.id,
          category_name: cat.name,
          confidence: ai.confidence,
          reason: ai.reason,
          method: "ai",
        };
        continue;
      }
    }
    // Fallback per tx kalau AI miss atau category_id invalid
    const catId = keywordCategorize(tx.description_normalized, tx.direction, categories);
    const cat = categories.find((c) => c.id === catId);
    classifications[dup_hash] = {
      category_id: catId,
      category_name: cat?.name ?? "Lain-lain",
      confidence: 0.4,
      reason: ai
        ? `AI return category_id invalid (${ai.category_id}), fallback keyword`
        : "AI tidak return klasifikasi untuk tx ini, fallback keyword",
      method: "keyword",
    };
  }

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cost = estimateCost(model, inputTokens, outputTokens);

  return {
    method: "ai",
    model,
    computed_at: computedAt,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: cost,
    classifications,
  };
}
