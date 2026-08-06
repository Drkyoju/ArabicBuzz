/** Providers the settings panel can configure (admin-only). */

export type ProviderDef = {
  envName: string
  /** Alternate env names that also count as configured. */
  aliases?: string[]
  labelAr: string
  labelEn: string
  kind: 'llm' | 'stt' | 'local'
  hintAr: string
  /** Optional: where to get a free/paid key. */
  docsUrl?: string
  /**
   * Provider is advertised but not routable with our OpenAI chat client.
   * Keys may still be stored; models must not be treated as serviceable.
   */
  degraded?: boolean
}

export const PROVIDER_DEFS: ProviderDef[] = [
  {
    envName: 'GEMINI_API_KEY',
    labelAr: 'Google Gemini',
    labelEn: 'Gemini',
    kind: 'llm',
    hintAr: 'Gemini 2.0 Flash · 2.5 Pro — يعمل الآن إن وُجد مفتاح صالح',
    docsUrl: 'https://aistudio.google.com/apikey',
  },
  {
    envName: 'GLM_API_KEY',
    aliases: ['ZHIPU_API_KEY'],
    labelAr: 'GLM / Zhipu',
    labelEn: 'GLM',
    kind: 'llm',
    hintAr: 'GLM-4.5 عبر Z.AI — يعمل الآن إن وُجد مفتاح صالح',
    docsUrl: 'https://z.ai/',
  },
  {
    envName: 'AGENTROUTER_API_KEY',
    aliases: ['AGENT_ROUTER_TOKEN'],
    labelAr: 'بوابة وكلاء',
    labelEn: 'Agent gateway',
    kind: 'llm',
    hintAr:
      'بوابة نماذج متقدمة — Opus و GPT عبر مفتاحك (يتطلب ترويسة عميل مسموح)',
    docsUrl: 'https://agentrouter.org/console/token',
  },
  {
    envName: 'TOKENROUTER_API_KEY',
    labelAr: 'TokenRouter · Kimi Free',
    labelEn: 'TokenRouter (Kimi Free)',
    kind: 'llm',
    hintAr:
      'يفتح moonshotai/kimi-k3-free عند وجود رصيد في المفتاح. إن ظهر «الرصيد منتهٍ» أنشئ مفتاحاً جديداً من لوحة TokenRouter.',
    docsUrl: 'https://docs.tokenrouter.io/',
  },
  {
    envName: 'PERPLEXITY_API_KEY',
    labelAr: 'Perplexity',
    labelEn: 'Perplexity',
    kind: 'llm',
    hintAr: 'يفتح Sonar بعد التحقق',
    docsUrl: 'https://www.perplexity.ai/settings/api',
  },
  {
    envName: 'HF_TOKEN',
    aliases: ['HUGGINGFACE_TOKEN', 'HUGGINGFACE_API_KEY'],
    labelAr: 'Hugging Face',
    labelEn: 'Hugging Face',
    kind: 'stt',
    hintAr: 'نسخ عربي مجاني (Cohere / SADA سعودي)',
    docsUrl: 'https://huggingface.co/settings/tokens',
  },
  {
    envName: 'GROQ_API_KEY',
    labelAr: 'Groq',
    labelEn: 'Groq',
    kind: 'stt',
    hintAr: 'Whisper مجاني كنسخة احتياطية للصوت',
    docsUrl: 'https://console.groq.com/keys',
  },
  {
    envName: 'OLLAMA_BASE_URL',
    labelAr: 'Ollama (محلي)',
    labelEn: 'Ollama',
    kind: 'local',
    hintAr: 'عنوان خادم Ollama اختياري (وضع معزول فقط) — اضبطه صراحة في Netlify',
    docsUrl: 'https://ollama.com',
  },
]

/** Removed from the product UI — purge leftover vault/env noise. */
export const RETIRED_PROVIDER_ENV_NAMES = [
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
] as const

export function findProviderDef(envName: string): ProviderDef | undefined {
  return PROVIDER_DEFS.find(
    (p) =>
      p.envName === envName ||
      p.aliases?.includes(envName)
  )
}
