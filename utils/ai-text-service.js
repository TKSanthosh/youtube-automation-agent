const OpenAI = require('openai');
const { Logger } = require('./logger');

const GEMINI_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.7-flash',
  'gemini-3.1-pro-preview',
];
const GEMINI_DEFAULT_MODEL = process.env.GEMINI_MODEL || GEMINI_MODELS[0];

const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.6',
    models: ['gpt-5.6', 'gpt-5.6-terra', 'gpt-5.6-luna'],
    envKey: 'OPENAI_API_KEY',
  },
  openrouter: {
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    defaultModel: process.env.OPENROUTER_MODEL || 'particle-ai/particle-1:free',
    models: [
      'particle-ai/particle-1:free',
      'liquid/lfm-3-1.7b:free',
      'baidu/ernie-5.5-flash-preview:free',
      'recursive/flint-v1.0:free',
      'nvidia/nemotron-3.5-lightning:free'
    ],
    envKey: 'OPENROUTER_API_KEY',
  },
  kimi: {
    name: 'Kimi (Moonshot AI)',
    baseURL: 'https://api.moonshot.ai/v1',
    defaultModel: 'kimi-k3',
    models: ['kimi-k3', 'kimi-k2.7-code', 'kimi-k2.6'],
    envKey: 'MOONSHOT_API_KEY',
  },
  mimo: {
    name: 'MiMo (Xiaomi)',
    baseURL: 'https://api.xiaomimimo.com/v1',
    defaultModel: 'mimo-v2.5-pro',
    models: ['mimo-v2.5-pro', 'mimo-v2.5'],
    envKey: 'MIMO_API_KEY',
  },
  glm: {
    name: 'GLM (Zhipu AI)',
    baseURL: 'https://api.z.ai/api/paas/v4/',
    defaultModel: 'glm-5.3',
    models: ['glm-5.3', 'glm-5.2', 'glm-5.1'],
    envKey: 'GLM_API_KEY',
  },
};

class AITextService {
  constructor(credentials = {}) {
    this.logger = new Logger('AITextService');
    this.client = null;
    this.gemini = null;
    this.model = null;
    this.providerName = null;

    this._init(credentials);
  }

  _init(credentials) {
    if (credentials.credentials && !credentials.aiProvider) {
      this.logger.warn('Unwrapped credential object provided — text generation unavailable');
      return;
    }

    const provider = credentials.aiProvider?.provider;
    const apiKey = credentials.aiProvider?.apiKey;
    const model = credentials.aiProvider?.model;

    if (provider && PROVIDERS[provider] && apiKey) {
      return this._initOpenAICompatible(PROVIDERS[provider], apiKey, model);
    }

    // Prioritize OpenRouter when explicitly selected or when OPENROUTER_API_KEY is configured
    if ((process.env.AI_PROVIDER === 'openrouter' || !process.env.GEMINI_API_KEY) && process.env.OPENROUTER_API_KEY) {
      return this._initOpenAICompatible(PROVIDERS.openrouter, process.env.OPENROUTER_API_KEY, process.env.OPENROUTER_MODEL);
    }

    // Google Gemini
    const geminiKey = credentials.gemini?.apiKey || process.env.GEMINI_API_KEY;
    if (geminiKey) {
      return this._initGemini(geminiKey, credentials.gemini?.model);
    }

    // OpenRouter fallback or other presets
    if (process.env.OPENROUTER_API_KEY) {
      return this._initOpenAICompatible(PROVIDERS.openrouter, process.env.OPENROUTER_API_KEY, process.env.OPENROUTER_MODEL);
    }

    for (const [, preset] of Object.entries(PROVIDERS)) {
      const key = process.env[preset.envKey];
      if (key) {
        return this._initOpenAICompatible(preset, key);
      }
    }

    this.logger.warn('No AI text provider configured — text generation unavailable');
  }

  _initOpenAICompatible(preset, apiKey, model) {
    const options = { apiKey, baseURL: preset.baseURL };
    if (preset.name === 'OpenRouter') {
      options.defaultHeaders = {
        'HTTP-Referer': 'https://github.com/TKSanthosh/youtube-automation-agent',
        'X-Title': 'YouTube Automation Agent',
      };
      this.isFreeTierOpenRouter = true;
      this.openRouterModels = preset.models || [
        'nvidia/nemotron-3.5-lightning:free',
        'inclusionai/ling-3.2-flash:free',
        'google/gemma-4-26b-a4b-it:free',
        'baidu/ernie-5.5-flash-preview:free',
        'liquid/lfm-3-1.7b:free',
        'nvidia/nemotron-3-ultra-550b-a55b:free'
      ];
    }
    this.client = new OpenAI(options);
    this.model = model || preset.defaultModel;
    this.providerName = preset.name;
    this.logger.info(`${preset.name} initialized (model: ${this.model})`);
  }

  _initGemini(apiKey, model) {
    try {
      const { GoogleGenAI } = require('@google/genai');
      this.gemini = new GoogleGenAI({ apiKey });
      this.model = model || GEMINI_DEFAULT_MODEL;
      this.providerName = 'Google Gemini';
      this.logger.info(`Gemini initialized (model: ${this.model})`);
    } catch (error) {
      this.logger.error('Failed to initialize Gemini:', error.message);
    }
  }

  async generateText(prompt, options = {}) {
    const model = options.model || this.model;
    const maxTokens = options.maxTokens || 2048;
    const temperature = options.temperature ?? 0.7;

    if (this.gemini) {
      const config = { maxOutputTokens: maxTokens };
      if (!/^gemini-3\.(?:[5-9]|\d{2,})-/.test(model)) config.temperature = temperature;
      const response = await this.gemini.models.generateContent({
        model,
        contents: prompt,
        config,
      });
      const text = response && response.text;
      if (typeof text !== 'string' || !text.trim()) {
        throw new Error(
          `${this.providerName} returned an empty response. Check the API key and model quota — free-tier Gemini keys are rate-limited and can return empty output.`
        );
      }
      return text;
    }

    if (!this.client) {
      throw new Error('No AI text provider configured');
    }

    if (this.isFreeTierOpenRouter) {
      const candidates = [model, ...(this.openRouterModels || []).filter(m => m !== model)];
      let lastErr = null;
      for (const candidateModel of candidates) {
        try {
          const response = await this.client.chat.completions.create({
            model: candidateModel,
            messages: [{ role: 'user', content: prompt }],
            temperature,
            max_tokens: maxTokens,
          });
          return this._extractContent(response);
        } catch (err) {
          lastErr = err;
          this.logger.warn(`OpenRouter model ${candidateModel} notice: ${err.status || err.message} — trying next free candidate...`);
        }
      }
      throw lastErr || new Error('All OpenRouter free tier candidate models failed');
    }

    const params = {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature,
    };

    try {
      // Newer OpenAI models (gpt-5.x and later) reject the legacy max_tokens
      // parameter with a 400 error and require max_completion_tokens instead.
      const response = await this.client.chat.completions.create({
        ...params,
        max_completion_tokens: maxTokens,
      });
      return this._extractContent(response);
    } catch (error) {
      // Older models and some providers reject max_completion_tokens with a 400;
      // retry the same request using the legacy max_tokens spelling.
      if (
        error &&
        error.status === 400 &&
        /max(_completion)?_tokens/i.test(error.message || '')
      ) {
        const response = await this.client.chat.completions.create({
          ...params,
          max_tokens: maxTokens,
        });
        return this._extractContent(response);
      }
      throw error;
    }
  }

  _extractContent(response) {
    const choice = response?.choices?.[0];
    const message = choice?.message;
    let content = message?.content;
    if ((!content || !content.trim()) && message?.reasoning) {
      content = message.reasoning;
    }

    if (typeof content !== 'string' || !content.trim()) {
      // A null/empty body used to surface as cryptic "Unexpected end of JSON input"
      // in the agents' JSON parsers. Report the real cause instead.
      throw new Error(
        `${this.providerName} returned an empty response. Check the API key and model quota.`
      );
    }
    return content;
  }

  isAvailable() {
    return !!(this.client || this.gemini);
  }
}

module.exports = { AITextService, PROVIDERS, GEMINI_MODELS, GEMINI_DEFAULT_MODEL };
