/** Providers the settings panel can configure (QM-style). */

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
    envName: 'OPENROUTER_API_KEY',
    labelAr: 'OpenRouter',
    labelEn: 'OpenRouter',
    kind: 'llm',
    hintAr: 'يفتح Claude · DeepSeek · Qwen · Kimi · Hermes بعد التحقق',
    docsUrl: 'https://openrouter.ai/keys',
  },
  {
    envName: 'AGENTROUTER_API_KEY',
    aliases: ['AGENT_ROUTER_TOKEN'],
    labelAr: 'AgentRouter',
    labelEn: 'AgentRouter',
    kind: 'llm',
    hintAr:
      'بوابة agentrouter.org — Opus 4.8 و GPT عبر مفتاحك (يتطلب ترويسة عميل مسموح)',
    docsUrl: 'https://agentrouter.org/console/token',
  },
  {
    envName: 'OPENAI_API_KEY',
    labelAr: 'OpenAI',
    labelEn: 'OpenAI',
    kind: 'llm',
    hintAr: 'يفتح GPT-4o بعد التحقق',
    docsUrl: 'https://platform.openai.com/api-keys',
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

export function findProviderDef(envName: string): ProviderDef | undefined {
  return PROVIDER_DEFS.find(
    (p) =>
      p.envName === envName ||
      p.aliases?.includes(envName)
  )
}
