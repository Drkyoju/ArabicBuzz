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
    envName: 'OPENROUTER_API_KEY',
    labelAr: 'OpenRouter',
    labelEn: 'OpenRouter',
    kind: 'llm',
    hintAr: 'Claude · DeepSeek · Qwen · Kimi · Hermes',
    docsUrl: 'https://openrouter.ai/keys',
  },
  {
    envName: 'GEMINI_API_KEY',
    labelAr: 'Google Gemini',
    labelEn: 'Gemini',
    kind: 'llm',
    hintAr: 'Gemini 2.0 Flash · 2.5 Pro',
    docsUrl: 'https://aistudio.google.com/apikey',
  },
  {
    envName: 'OPENAI_API_KEY',
    labelAr: 'OpenAI',
    labelEn: 'OpenAI',
    kind: 'llm',
    hintAr: 'GPT-4o · نسخ احتياطي للصوت',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  {
    envName: 'GLM_API_KEY',
    aliases: ['ZHIPU_API_KEY'],
    labelAr: 'GLM / Zhipu',
    labelEn: 'GLM',
    kind: 'llm',
    hintAr: 'GLM-4.5 عبر Z.AI',
    docsUrl: 'https://z.ai/',
  },
  {
    envName: 'PERPLEXITY_API_KEY',
    labelAr: 'Perplexity',
    labelEn: 'Perplexity',
    kind: 'llm',
    hintAr: 'Sonar للبحث',
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
    hintAr: 'عنوان خادم Ollama — افتراضي localhost',
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
