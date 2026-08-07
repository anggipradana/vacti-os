import { createHash } from 'node:crypto';

export interface AiProvider {
  generate(system: string, prompt: string): Promise<string>;
  /**
   * Multimodal generation: prompt + one or more images (base64 + mime). Present only for vision-capable
   * providers; undefined otherwise, so callers must feature-detect and skip gracefully.
   */
  generateVision?(system: string, prompt: string, images: VisionImage[]): Promise<string>;
}

export interface VisionImage {
  /** Raw base64 (no data: prefix). */
  base64: string;
  /** e.g. image/png, image/jpeg. */
  mediaType: string;
}

/** Build the `ai` SDK user message (prompt + images) for a vision call - shared by all providers. */
function visionMessages(prompt: string, images: VisionImage[]) {
  return [
    {
      role: 'user' as const,
      content: [
        { type: 'text' as const, text: prompt },
        ...images.map((im) => ({
          type: 'image' as const,
          image: Buffer.from(im.base64, 'base64'),
          mimeType: im.mediaType,
        })),
      ],
    },
  ];
}

export interface AiConfig {
  provider: 'openai' | 'ollama';
  model: string;
  openaiKey?: string;
  ollamaBaseUrl?: string;
  /**
   * Optional override endpoint for an OpenAI-compatible API (a local proxy or gateway).
   * Blank → the SDK's default vendor cloud endpoint. Does not apply to Ollama (use ollamaBaseUrl).
   */
  baseUrl?: string;
}

/** Sensible default model per provider, used when none is configured. */
export const DEFAULT_AI_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  ollama: 'llama3',
};

/**
 * Pick a model that is actually valid for the provider. Guards against a model left over from a
 * different provider - a mismatch makes the provider reject the request, so the AI features silently
 * degrade to no-ops.
 */
export function resolveAiModel(provider: string, model?: string | null): string {
  const m = (model ?? '').trim();
  return m || DEFAULT_AI_MODELS[provider] || 'gpt-4o-mini';
}

export interface VulnEnrichmentInput {
  name: string;
  type?: string | null;
  matchedAt?: string | null;
  severity?: number;
}

export interface VulnEnrichment {
  description: string;
  impact: string;
  remediation: string;
}

/**
 * Reports and narration must never contain em/en dashes (— / –). Even with the instruction in the
 * system prompt, models slip them in, so normalise any to a plain hyphen as a hard guarantee.
 */
export function stripEmDash(s: string): string {
  return s.replace(/[—–]/g, '-');
}

const SYSTEM = `You are a senior application security engineer. For the given vulnerability finding, write a concise, technically accurate report in EXACTLY three sections with these headings:
Description:
Impact:
Remediation:
Use plain text, no markdown bullets in headings. Be specific and actionable. Do not use em dashes (the "—" character); use hyphens, commas, or separate sentences instead.`;

export function buildVulnPrompt(v: VulnEnrichmentInput): string {
  return [
    `Finding: ${v.name}`,
    v.type ? `Type: ${v.type}` : '',
    v.matchedAt ? `Location: ${v.matchedAt}` : '',
    typeof v.severity === 'number' ? `Severity (0=info..4=critical): ${v.severity}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Parse the model's three-section output. Tolerant of missing sections. */
export function parseEnrichment(text: string): VulnEnrichment {
  const grab = (label: string, next: string[]): string => {
    const re = new RegExp(`${label}\\s*:?\\s*([\\s\\S]*?)(?=(?:${next.join('|')})\\s*:|$)`, 'i');
    return (text.match(re)?.[1] ?? '').trim();
  };
  return {
    description: grab('Description', ['Impact', 'Remediation']),
    impact: grab('Impact', ['Remediation', 'Description']),
    remediation: grab('Remediation', ['Description', 'Impact']),
  };
}

export async function enrichVulnerability(v: VulnEnrichmentInput, provider: AiProvider): Promise<VulnEnrichment> {
  return parseEnrichment(stripEmDash(await provider.generate(SYSTEM, buildVulnPrompt(v))));
}

/** Build a concrete provider via the Vercel AI SDK. Returns null when no key/config (graceful degrade). */
export async function makeProvider(cfg: AiConfig): Promise<AiProvider | null> {
  try {
    // A blank/whitespace baseUrl must behave exactly like "unset" (vendor default endpoint).
    const baseURL = cfg.baseUrl?.trim() || undefined;
    if (cfg.provider === 'openai') {
      if (!cfg.openaiKey) return null;
      const [{ generateText }, { createOpenAI }] = await Promise.all([import('ai'), import('@ai-sdk/openai')]);
      const openai = createOpenAI({ apiKey: cfg.openaiKey, ...(baseURL ? { baseURL } : {}) });
      return {
        generate: async (system, prompt) => (await generateText({ model: openai(cfg.model), system, prompt })).text,
        generateVision: async (system, prompt, images) =>
          (await generateText({ model: openai(cfg.model), system, messages: visionMessages(prompt, images) })).text,
      };
    }
    if (cfg.provider === 'ollama' && cfg.ollamaBaseUrl) {
      const base = cfg.ollamaBaseUrl;
      return {
        generate: async (system, prompt) => {
          const res = await fetch(`${base}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: cfg.model, system, prompt, stream: false }),
          });
          if (!res.ok) throw new Error(`ollama ${res.status}`);
          return ((await res.json()) as { response?: string }).response ?? '';
        },
        // Ollama vision models (llava, llama3.2-vision, ...) accept a base64 `images` array on /api/generate.
        generateVision: async (system, prompt, images) => {
          const res = await fetch(`${base}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: cfg.model,
              system,
              prompt,
              images: images.map((im) => im.base64),
              stream: false,
            }),
          });
          if (!res.ok) throw new Error(`ollama ${res.status}`);
          return ((await res.json()) as { response?: string }).response ?? '';
        },
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ---- News relevance triage (learns from analyst "Irrelevant" marks) ----

export interface NewsTriageInput {
  /** What the news is being monitored for, e.g. "banking sector security news" or "brand: Acme". */
  context: string;
  /** Titles the analyst previously marked Irrelevant — negative examples to learn from. */
  irrelevantExamples: string[];
  /** Titles the analyst marked Relevant/Actioned — positive examples to learn from. */
  relevantExamples: string[];
  /** Candidate (untriaged) titles to classify, in order. */
  candidates: string[];
}

export function buildNewsTriagePrompt(input: NewsTriageInput): { system: string; prompt: string } {
  const system =
    'You are a cyber threat-intelligence analyst assistant. You triage news headlines for relevance ' +
    "to a monitoring context. Learn from the analyst's past decisions. A headline is IRRELEVANT if it " +
    'is off-topic, marketing/promotional, generic non-security news, or unrelated to the context. ' +
    'Return ONLY a compact JSON array of the 1-based indices of the IRRELEVANT candidates, e.g. [1,4,5]. ' +
    'If every candidate is relevant, return []. Output nothing else.';
  const ex = (label: string, xs: string[]) =>
    xs.length
      ? `${label}:\n${xs
          .slice(0, 15)
          .map((t) => `- ${t}`)
          .join('\n')}`
      : '';
  const prompt = [
    `Monitoring context: ${input.context}`,
    ex('Examples the analyst marked IRRELEVANT', input.irrelevantExamples),
    ex('Examples the analyst marked RELEVANT', input.relevantExamples),
    `Candidates to classify:\n${input.candidates.map((t, i) => `${i + 1}. ${t}`).join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  return { system, prompt };
}

/** Parse the model's JSON array of 1-based indices; keep only valid, in-range, unique values. */
export function parseIrrelevantIndices(text: string, max: number): number[] {
  const m = text.match(/\[[\s\S]*?\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]) as unknown;
    if (!Array.isArray(arr)) return [];
    const out = new Set<number>();
    for (const v of arr) {
      const n = typeof v === 'number' ? v : parseInt(String(v), 10);
      if (Number.isInteger(n) && n >= 1 && n <= max) out.add(n);
    }
    return [...out];
  } catch {
    return [];
  }
}

/** Ask the provider which candidate headlines are irrelevant. Returns 1-based indices. */
export async function triageNewsRelevance(input: NewsTriageInput, provider: AiProvider): Promise<number[]> {
  if (!input.candidates.length) return [];
  const { system, prompt } = buildNewsTriagePrompt(input);
  return parseIrrelevantIndices(await provider.generate(system, prompt), input.candidates.length);
}

export function enrichmentHash(v: VulnEnrichmentInput): string {
  return createHash('sha256')
    .update(`${v.name}|${v.type ?? ''}`)
    .digest('hex');
}

// ---- Executive summary (VA report) ----

export interface ExecSummaryInput {
  target: string;
  lang: 'en' | 'id';
  counts: { subdomains: number; endpoints: number; ports: number; vulns: number; active: number };
  severities: { critical: number; high: number; medium: number; low: number; info: number };
  topFindings: string[];
}

export async function generateExecutiveSummary(input: ExecSummaryInput, provider: AiProvider): Promise<string> {
  const system =
    input.lang === 'id'
      ? 'Anda penulis laporan keamanan senior. Tulis ringkasan eksekutif 2-4 kalimat dalam Bahasa Indonesia untuk pembaca manajemen. Faktual, ringkas, tanpa markdown. Jangan gunakan tanda em dash (karakter "—"); pakai tanda hubung, koma, atau kalimat terpisah.'
      : 'You are a senior security report writer. Write a 2-4 sentence executive summary for a management audience. Factual, concise, no markdown. Do not use em dashes (the "—" character); use hyphens, commas, or separate sentences instead.';
  const prompt = [
    `Target: ${input.target}`,
    `Subdomains: ${input.counts.subdomains}, live endpoints: ${input.counts.endpoints}, open ports: ${input.counts.ports}`,
    `Vulnerabilities: ${input.counts.vulns} (${input.counts.active} active), crit ${input.severities.critical}, high ${input.severities.high}, med ${input.severities.medium}, low ${input.severities.low}, info ${input.severities.info}`,
    input.topFindings.length ? `Notable findings: ${input.topFindings.slice(0, 5).join('; ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return stripEmDash((await provider.generate(system, prompt)).trim());
}

// ---- Brand-monitoring sentiment (per headline) ----

export type BrandSentiment = 'positive' | 'negative' | 'neutral';
export type BrandRelevance = 'relevant' | 'irrelevant';
export interface BrandSentimentResult {
  sentiment: BrandSentiment;
  /** Whether the headline is actually about THIS brand/company (vs a coincidental name match). */
  relevance: BrandRelevance;
  reason: string;
}

/**
 * Classify a brand-monitoring headline along two axes TOWARD THE BRAND: (1) sentiment - negative
 * (breach/lawsuit/outage), positive (award/partnership/growth), neutral (routine); (2) relevance -
 * whether it is genuinely about this company vs a coincidental name match / generic industry news.
 * Returns a one-line reason. Falls back to neutral/relevant on an unparseable reply.
 */
export async function generateBrandSentiment(
  input: { brand: string; title: string; summary?: string | null; lang?: 'en' | 'id' },
  provider: AiProvider,
): Promise<BrandSentimentResult> {
  const system =
    input.lang === 'id'
      ? 'Anda analis pemantauan reputasi merek. Nilai sebuah berita pada DUA sumbu TERHADAP MEREK ini: (1) SENTIMENT: negative (kabar buruk: kebocoran data, gugatan, gangguan, penipuan, skandal), positive (kabar baik: penghargaan, kemitraan, pertumbuhan), neutral (liputan rutin/tidak berdampak); (2) RELEVANCE: relevant (memang tentang perusahaan ini) atau irrelevant (kebetulan nama mirip / berita industri umum yang tidak menyangkut perusahaan ini). Balas TEPAT satu baris: "SENTIMENT | RELEVANCE | alasan singkat". Tanpa markdown, tanpa tanda em dash.'
      : 'You are a brand reputation-monitoring analyst. Judge a headline on TWO axes TOWARD THIS BRAND: (1) SENTIMENT: negative (breach, lawsuit, outage, fraud, scandal), positive (award, partnership, growth), neutral (routine/no-impact); (2) RELEVANCE: relevant (genuinely about this company) or irrelevant (coincidental name match / generic industry news not about this company). Reply EXACTLY one line: "SENTIMENT | RELEVANCE | short reason". No markdown, no em dashes.';
  const prompt = [`Brand: ${input.brand}`, `Headline: ${input.title}`, input.summary ? `Summary: ${input.summary}` : '']
    .filter(Boolean)
    .join('\n');
  const raw = stripEmDash((await provider.generate(system, prompt)).trim());
  const parts = raw.split('|');
  const sentToken = (parts[0] ?? '').toLowerCase();
  const relToken = (parts[1] ?? '').toLowerCase();
  const sentiment: BrandSentiment = sentToken.includes('negative')
    ? 'negative'
    : sentToken.includes('positive')
      ? 'positive'
      : 'neutral';
  // Default to relevant unless the model clearly says irrelevant (avoid hiding real hits).
  const relevance: BrandRelevance = relToken.includes('irrelevant') ? 'irrelevant' : 'relevant';
  const reason = (parts.slice(2).join('|').trim() || parts.slice(1).join('|').trim() || raw).slice(0, 280);
  return { sentiment, relevance, reason };
}

// ---- Threat-intelligence narrative (TI report / page) ----

export interface ThreatNarrativeInput {
  project: string;
  lang: 'en' | 'id';
  riskScore: number;
  riskLevel: string;
  totals: { pulses: number; malware: number; leaks: number };
  components?: Record<string, number>;
}

export async function generateThreatNarrative(input: ThreatNarrativeInput, provider: AiProvider): Promise<string> {
  const system =
    input.lang === 'id'
      ? 'Anda analis threat intelligence senior. Tulis narasi analisis risiko 3-5 kalimat dalam Bahasa Indonesia: jelaskan pendorong utama skor risiko dan rekomendasi prioritas. Faktual, tanpa markdown. Jangan gunakan tanda em dash (karakter "—"); pakai tanda hubung, koma, atau kalimat terpisah.'
      : 'You are a senior threat-intelligence analyst. Write a 3-5 sentence risk-analysis narrative: explain the main drivers of the risk score and the priority recommendation. Factual, no markdown. Do not use em dashes (the "—" character); use hyphens, commas, or separate sentences instead.';
  const prompt = [
    `Project: ${input.project}`,
    `Unified risk score: ${input.riskScore}/100 (${input.riskLevel})`,
    `Threat pulses: ${input.totals.pulses}, malware references: ${input.totals.malware}, leaked credentials: ${input.totals.leaks}`,
    input.components
      ? `Risk components: ${Object.entries(input.components)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${k}=${Math.round(v)}`)
          .join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  return stripEmDash((await provider.generate(system, prompt)).trim());
}
