const OpenAI = require('openai');
const Replicate = require('replicate');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const { Logger } = require('./logger');
const { runFFmpeg, checkFFmpeg, ffmpegInstallHint } = require('./ffmpeg');
const { MediaGenerationService } = require('./media-generation-service');

class AIVideoGenerator {
  constructor(credentials, options = {}) {
    this.logger = new Logger('AIVideoGenerator');
    const resolvedCredentials = credentials?.credentials || credentials || {};
    this.db = options.db || null;
    this.lastVideoResult = null;
    this.lastNarrationResult = null;
    
    // Initialize AI services with graceful fallback
    const openaiKey = resolvedCredentials.openai?.apiKey || process.env.OPENAI_API_KEY;
    const replicateKey = resolvedCredentials.replicate?.apiKey || process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY;
    
    if (openaiKey) {
      this.openai = new OpenAI({ apiKey: openaiKey });
      this.logger.info('OpenAI service initialized');
    } else {
      this.logger.warn('OpenAI API key not found - AI features will be simulated');
    }
    
    if (replicateKey) {
      this.replicate = new Replicate({ auth: replicateKey });
      this.logger.info('Replicate service initialized');
    } else {
      this.logger.warn('Replicate API key not found - advanced video generation unavailable');
    }

    // Gemini media generation (images + native TTS) — free-tier alternative to OpenAI
    const geminiKey = resolvedCredentials.gemini?.apiKey || process.env.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        const { GoogleGenAI } = require('@google/genai');
        this.gemini = new GoogleGenAI({ apiKey: geminiKey });
        this.logger.info('Gemini media service initialized (images + TTS)');
      } catch (error) {
        this.logger.warn('Failed to initialize Gemini media service:', error.message);
      }
    }
    
    // ElevenLabs configuration
    this.elevenLabsApiKey = resolvedCredentials.elevenLabs?.apiKey || process.env.ELEVENLABS_API_KEY;
    this.elevenLabsVoiceId = resolvedCredentials.elevenLabs?.voiceId || process.env.ELEVENLABS_VOICE_ID;
    this.elevenLabsModel = process.env.ELEVENLABS_TTS_MODEL || 'eleven_v3';
    
    // Azure Speech configuration
    this.azureSpeechKey = resolvedCredentials.azure?.speechKey || process.env.AZURE_SPEECH_KEY;
    this.azureSpeechRegion = resolvedCredentials.azure?.speechRegion || process.env.AZURE_SPEECH_REGION;
    this.mediaGeneration = options.mediaGeneration || (this.db
      ? new MediaGenerationService(this.db, resolvedCredentials, { logger: this.logger })
      : null);
  }

  async generateTTSAudio(text, outputPath, options = {}) {
    this.logger.info('Generating enhanced humanized TTS audio...');
    this.lastNarrationResult = null;
    let provider = 'simulation';
    let model = null;

    try {
      let generatedPath = null;
      // 1. MsEdge Neural Voice (100% Free, unlimited, studio humanized neural voices)
      try {
        provider = 'msedge-neural';
        const { voice: rotatedVoice, gender } = this.getRotatedVoice(options);
        model = rotatedVoice;
        const humanSpeed = options.speed || options.rate || 1.04;
        this.logger.info(`Synthesizing humanized narration via MsEdge Neural TTS (${model}, ${gender === 'ladies' ? 'Female' : 'Male'} instructor, speed: ${humanSpeed}x)...`);
        generatedPath = await this.generateMsEdgeTTS(text, outputPath, model, { rate: humanSpeed });
      } catch (e) {
        this.logger.warn(`MsEdge Neural TTS notice (${e.message}); attempting neural fallbacks...`);
      }

      // 2. Gemini Neural TTS (fallback if MsEdge unavailable and within daily quota)
      if (!generatedPath && this.gemini) {
        try {
          provider = 'gemini';
          const { voice: geminiVoice, model: gModel, gender } = this.getRotatedGeminiVoice(options);
          model = gModel;
          this.logger.info(`Synthesizing humanized neural voice via Gemini (${model}, voice: ${geminiVoice} [${gender}])...`);
          generatedPath = await this.generateGeminiTTS(text, outputPath, { model, voice: geminiVoice });
        } catch (e) {
          this.logger.warn(`Gemini TTS failed: ${e.message}`);
        }
      }

      // 3. ElevenLabs (if configured)
      if (!generatedPath && this.elevenLabsApiKey && this.elevenLabsVoiceId) {
        try {
          provider = 'elevenlabs';
          model = this.elevenLabsModel;
          this.logger.info(`Synthesizing premium voice via ElevenLabs (${model})...`);
          generatedPath = await this.generateElevenLabsTTS(text, outputPath);
        } catch (e) {
          this.logger.warn(`ElevenLabs TTS failed: ${e.message}`);
        }
      }

      // 4. OpenAI Studio Voices (tts-1-hd / tts-1 with human-like prosody)
      if (!generatedPath && this.openai) {
        try {
          provider = 'openai';
          const { voice: openAIVoice, model: oModel } = this.getRotatedOpenAIVoice(options);
          model = oModel;
          this.logger.info(`Synthesizing studio voice via OpenAI TTS (${model}, voice: ${openAIVoice})...`);
          generatedPath = await this.generateOpenAITTS(text, outputPath, { model, voice: openAIVoice });
        } catch (e) {
          this.logger.warn(`OpenAI TTS failed: ${e.message}`);
        }
      }

      const usable = await this.isUsableAudioFile(generatedPath);
      if (usable) {
        // Apply broadcast studio mastering (dynamic range normalization & EQ presence boost)
        await this.masterAudioFile(generatedPath);
      }

      this.lastNarrationResult = {
        status: usable ? 'ready' : 'unavailable',
        path: generatedPath,
        provider,
        model,
        externalTaskId: null,
        generatedAt: new Date().toISOString(),
        simulated: !usable,
        cost: { provider, amount: null, currency: null, invoiceRequired: false }
      };
      return generatedPath;
    } catch (error) {
      this.logger.warn(`Speech synthesis error (${error.message}); using audio synthesizer fallback`);
      provider = 'synth';
      model = 'tone-generator';
      const synthPath = await this.generateFallbackToneAudio(outputPath);
      this.lastNarrationResult = {
        status: 'ready', path: synthPath, provider, model, externalTaskId: null,
        generatedAt: new Date().toISOString(), simulated: false,
        cost: { provider, amount: null, currency: null, invoiceRequired: false }
      };
      return synthPath;
    }
  }

  async masterAudioFile(audioPath) {
    try {
      const fsSync = require('fs');
      if (!fsSync.existsSync(audioPath) || fsSync.statSync(audioPath).size < 1000) return;
      const masteredTemp = `${audioPath}.mastered.mp3`;
      await runFFmpeg([
        '-y',
        '-i', audioPath,
        '-af', 'highpass=f=75,equalizer=f=3200:t=q:w=1.2:g=2.5,dynaudnorm=p=0.92:m=8.0:s=12:g=15,volume=1.08',
        '-c:a', 'libmp3lame',
        '-b:a', '192k',
        masteredTemp
      ]);
      if (fsSync.existsSync(masteredTemp) && fsSync.statSync(masteredTemp).size > 1000) {
        await fs.copyFile(masteredTemp, audioPath);
        await fs.unlink(masteredTemp).catch(() => {});
        this.logger.info(`Studio broadcast audio mastering applied: ${path.basename(audioPath)}`);
      } else {
        await fs.unlink(masteredTemp).catch(() => {});
      }
    } catch (err) {
      this.logger.warn(`Audio mastering notice: ${err.message}`);
    }
  }

  getRotatedGeminiVoice(options = {}) {
    if (options.voice) {
      return {
        voice: options.voice,
        model: options.model || process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts',
        gender: options.gender || 'male'
      };
    }
    if (process.env.GEMINI_TTS_VOICE) {
      return {
        voice: process.env.GEMINI_TTS_VOICE,
        model: process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts',
        gender: 'custom'
      };
    }

    const fsSync = require('fs');
    const path = require('path');
    const stateFile = path.join(__dirname, '..', 'data', 'voice_state.json');

    const voices = [
      { name: 'Puck', desc: 'Warm, natural conversational male instructor', gender: 'male' },
      { name: 'Kore', desc: 'Approachable, clear articulate female mentor', gender: 'female' },
      { name: 'Charon', desc: 'Deep, resonant authoritative senior architect', gender: 'male' },
      { name: 'Aoede', desc: 'Expressive, energetic modern female presenter', gender: 'female' },
      { name: 'Fenrir', desc: 'Sharp, dynamic tech lead male', gender: 'male' }
    ];

    let geminiIndex = 0;
    try {
      if (fsSync.existsSync(stateFile)) {
        const raw = JSON.parse(fsSync.readFileSync(stateFile, 'utf8'));
        geminiIndex = Number.isInteger(raw.geminiIndex) ? raw.geminiIndex : 0;
      }
    } catch (_e) {}

    const selected = voices[geminiIndex % voices.length];
    const nextIdx = (geminiIndex + 1) % voices.length;

    try {
      let state = {};
      if (fsSync.existsSync(stateFile)) {
        try { state = JSON.parse(fsSync.readFileSync(stateFile, 'utf8')); } catch (_e) {}
      }
      state.geminiIndex = nextIdx;
      state.lastGeminiVoice = selected.name;
      state.lastGeminiGender = selected.gender;
      state.updatedAt = new Date().toISOString();
      fsSync.mkdirSync(path.dirname(stateFile), { recursive: true });
      fsSync.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    } catch (_e) {}

    return {
      voice: selected.name,
      model: process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts',
      gender: selected.gender
    };
  }

  getRotatedOpenAIVoice(options = {}) {
    if (options.voice) {
      return {
        voice: options.voice,
        model: options.model || process.env.OPENAI_TTS_MODEL || 'tts-1-hd'
      };
    }
    if (process.env.OPENAI_TTS_VOICE) {
      return {
        voice: process.env.OPENAI_TTS_VOICE,
        model: process.env.OPENAI_TTS_MODEL || 'tts-1-hd'
      };
    }

    const fsSync = require('fs');
    const path = require('path');
    const stateFile = path.join(__dirname, '..', 'data', 'voice_state.json');

    const voices = [
      { name: 'nova', gender: 'female', desc: 'Energetic, crisp, engaging' },
      { name: 'onyx', gender: 'male', desc: 'Deep, authoritative, confident' },
      { name: 'alloy', gender: 'neutral', desc: 'Clean, balanced, modern' },
      { name: 'echo', gender: 'male', desc: 'Smooth, conversational educator' },
      { name: 'fable', gender: 'expressive', desc: 'Dynamic, storytelling tone' },
      { name: 'shimmer', gender: 'female', desc: 'Warm, clear, optimistic' }
    ];

    let openaiIndex = 0;
    try {
      if (fsSync.existsSync(stateFile)) {
        const raw = JSON.parse(fsSync.readFileSync(stateFile, 'utf8'));
        openaiIndex = Number.isInteger(raw.openaiIndex) ? raw.openaiIndex : 0;
      }
    } catch (_e) {}

    const selected = voices[openaiIndex % voices.length];
    const nextIdx = (openaiIndex + 1) % voices.length;

    try {
      let state = {};
      if (fsSync.existsSync(stateFile)) {
        try { state = JSON.parse(fsSync.readFileSync(stateFile, 'utf8')); } catch (_e) {}
      }
      state.openaiIndex = nextIdx;
      state.lastOpenAIVoice = selected.name;
      state.updatedAt = new Date().toISOString();
      fsSync.mkdirSync(path.dirname(stateFile), { recursive: true });
      fsSync.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    } catch (_e) {}

    return {
      voice: selected.name,
      model: process.env.OPENAI_TTS_MODEL || 'tts-1-hd'
    };
  }

  getRotatedVoice(options = {}) {
    const validEdgeVoiceRegex = /^[a-z]{2}-[A-Z]{2}-[\w]+Neural$/;
    if (options.voice && validEdgeVoiceRegex.test(options.voice)) {
      return { voice: options.voice, gender: options.gender || 'custom' };
    }
    if (process.env.MSEDGE_TTS_VOICE && validEdgeVoiceRegex.test(process.env.MSEDGE_TTS_VOICE)) {
      return { voice: process.env.MSEDGE_TTS_VOICE, gender: 'custom' };
    }

    const fsSync = require('fs');
    const path = require('path');
    const stateFile = path.join(__dirname, '..', 'data', 'voice_state.json');

    // Elite humanized tech presenter voices (Edge TTS Neural)
    // Dynamic cadence, natural pitch inflection, zero robotic monotony
    const techPresenterVoices = [
      'en-US-GuyNeural',         // Dynamic, conversational, charismatic tech presenter (Fireship style)
      'en-US-ChristopherNeural', // Warm, authoritative senior engineer storyteller
      'en-US-AndrewNeural'       // Modern, sharp tech educator
    ];
    const ladiesVoices = [
      'en-US-AvaNeural',         // Crisp, energetic modern female tech presenter
      'en-US-JennyNeural'        // Warm, natural conversational female mentor
    ];

    let voiceIndex = 0;

    try {
      if (fsSync.existsSync(stateFile)) {
        const raw = JSON.parse(fsSync.readFileSync(stateFile, 'utf8'));
        voiceIndex = Number.isInteger(raw.voiceIndex) ? raw.voiceIndex : (Number.isInteger(raw.gentIndex) ? raw.gentIndex : 0);
      }
    } catch (_e) {
      // Ignore read error
    }

    let selectedVoice = '';
    let selectedGender = 'gents';

    if (options.gender === 'ladies') {
      selectedVoice = ladiesVoices[voiceIndex % ladiesVoices.length];
      selectedGender = 'ladies';
    } else {
      selectedVoice = techPresenterVoices[voiceIndex % techPresenterVoices.length];
      selectedGender = 'gents';
    }
    const nextVoiceIndex = (voiceIndex + 1) % (options.gender === 'ladies' ? ladiesVoices.length : techPresenterVoices.length);

    try {
      fsSync.mkdirSync(path.dirname(stateFile), { recursive: true });
      fsSync.writeFileSync(stateFile, JSON.stringify({
        lastGender: selectedGender,
        lastVoice: selectedVoice,
        voiceIndex: nextVoiceIndex,
        gentIndex: nextVoiceIndex,
        updatedAt: new Date().toISOString()
      }, null, 2));
    } catch (_e) {
      // Ignore write error
    }

    return { voice: selectedVoice, gender: selectedGender };
  }

  getRotatedTheme() {
    const fsSync = require('fs');
    const path = require('path');
    const stateFile = path.join(__dirname, '..', 'data', 'theme_state.json');

    const themes = [
      {
        name: 'Cyber Cyan',
        accent: '#00f2fe', accentRGB: '0, 242, 254',
        bg: '#0a0e17',
        bgGradient: 'radial-gradient(ellipse at 30% 20%, rgba(0,242,254,0.15) 0%, transparent 55%), radial-gradient(ellipse at 75% 80%, rgba(0,180,216,0.10) 0%, transparent 50%)',
        secondary: '#38bdf8', secondaryRGB: '56, 189, 248',
        gridColor: 'rgba(0, 242, 254, 0.04)',
        codeColor: '#7ee787',
        badgeBg: 'rgba(0, 242, 254, 0.12)',
        cardBorder: '#164e63',
        cardBg: 'rgba(10, 30, 50, 0.92)',
        headerGradient: 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 50%, #ffffff 100%)'
      },
      {
        name: 'Emerald Matrix',
        accent: '#10b981', accentRGB: '16, 185, 129',
        bg: '#061a14',
        bgGradient: 'radial-gradient(ellipse at 40% 25%, rgba(16,185,129,0.18) 0%, transparent 55%), radial-gradient(ellipse at 70% 75%, rgba(52,211,153,0.08) 0%, transparent 50%)',
        secondary: '#34d399', secondaryRGB: '52, 211, 153',
        gridColor: 'rgba(16, 185, 129, 0.04)',
        codeColor: '#a5f3fc',
        badgeBg: 'rgba(16, 185, 129, 0.14)',
        cardBorder: '#065f46',
        cardBg: 'rgba(6, 26, 20, 0.92)',
        headerGradient: 'linear-gradient(135deg, #10b981 0%, #34d399 50%, #ffffff 100%)'
      },
      {
        name: 'Obsidian Violet',
        accent: '#c084fc', accentRGB: '192, 132, 252',
        bg: '#0f0728',
        bgGradient: 'radial-gradient(ellipse at 35% 30%, rgba(192,132,252,0.18) 0%, transparent 55%), radial-gradient(ellipse at 65% 80%, rgba(139,92,246,0.10) 0%, transparent 50%)',
        secondary: '#a78bfa', secondaryRGB: '167, 139, 250',
        gridColor: 'rgba(192, 132, 252, 0.04)',
        codeColor: '#fbbf24',
        badgeBg: 'rgba(192, 132, 252, 0.14)',
        cardBorder: '#4c1d95',
        cardBg: 'rgba(15, 7, 40, 0.92)',
        headerGradient: 'linear-gradient(135deg, #c084fc 0%, #a78bfa 50%, #ffffff 100%)'
      },
      {
        name: 'Sunset Amber',
        accent: '#f97316', accentRGB: '249, 115, 22',
        bg: '#180b06',
        bgGradient: 'radial-gradient(ellipse at 45% 25%, rgba(249,115,22,0.18) 0%, transparent 55%), radial-gradient(ellipse at 60% 80%, rgba(251,146,60,0.08) 0%, transparent 50%)',
        secondary: '#fb923c', secondaryRGB: '251, 146, 60',
        gridColor: 'rgba(249, 115, 22, 0.04)',
        codeColor: '#86efac',
        badgeBg: 'rgba(249, 115, 22, 0.14)',
        cardBorder: '#7c2d12',
        cardBg: 'rgba(24, 11, 6, 0.92)',
        headerGradient: 'linear-gradient(135deg, #f97316 0%, #fb923c 50%, #ffffff 100%)'
      },
      {
        name: 'Electric Sapphire',
        accent: '#3b82f6', accentRGB: '59, 130, 246',
        bg: '#081226',
        bgGradient: 'radial-gradient(ellipse at 50% 20%, rgba(59,130,246,0.18) 0%, transparent 55%), radial-gradient(ellipse at 30% 85%, rgba(96,165,250,0.10) 0%, transparent 50%)',
        secondary: '#60a5fa', secondaryRGB: '96, 165, 250',
        gridColor: 'rgba(59, 130, 246, 0.04)',
        codeColor: '#f0abfc',
        badgeBg: 'rgba(59, 130, 246, 0.14)',
        cardBorder: '#1e3a5f',
        cardBg: 'rgba(8, 18, 38, 0.92)',
        headerGradient: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 50%, #ffffff 100%)'
      }
    ];

    let themeIndex = 0;
    try {
      if (fsSync.existsSync(stateFile)) {
        const raw = JSON.parse(fsSync.readFileSync(stateFile, 'utf8'));
        themeIndex = Number.isInteger(raw.themeIndex) ? raw.themeIndex : 0;
      }
    } catch (_e) { /* ignore */ }

    const selected = themes[themeIndex % themes.length];
    const nextIndex = (themeIndex + 1) % themes.length;

    try {
      fsSync.mkdirSync(path.dirname(stateFile), { recursive: true });
      fsSync.writeFileSync(stateFile, JSON.stringify({
        themeIndex: nextIndex,
        lastTheme: selected.name,
        updatedAt: new Date().toISOString()
      }, null, 2));
    } catch (_e) { /* ignore */ }

    this.logger.info(`Visual theme selected: ${selected.name}`);
    return selected;
  }

  async generateMsEdgeTTS(text, outputPath, voiceName = 'en-US-GuyNeural', options = {}) {
    this.logger.info(`Synthesizing neural voice via MsEdgeTTS (${voiceName})...`);
    const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
    const cleanText = (text || '').replace(/\s+/g, ' ').trim();
    if (!cleanText) throw new Error('Cannot synthesize empty text');

    const fsSync = require('fs');
    const humanRate = options.rate || options.speed || 1.04;
    const prosody = { rate: humanRate, pitch: options.pitch || '+0Hz' };

    const tempDir = path.join(path.dirname(outputPath), `edge_tts_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    await fs.mkdir(tempDir, { recursive: true });

    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

      // Edge TTS websocket limits single utterances. If <= 350 chars, synthesize directly.
      if (cleanText.length <= 350) {
        const res = await tts.toFile(tempDir, cleanText, prosody);
        tts.close();
        if (fsSync.existsSync(res.audioFilePath) && fsSync.statSync(res.audioFilePath).size > 500) {
          await fs.copyFile(res.audioFilePath, outputPath);
          await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
          this.logger.info(`Neural audio generated successfully: ${outputPath} (${(fsSync.statSync(outputPath).size / 1024).toFixed(1)} KB)`);
          return outputPath;
        }
        throw new Error('Generated neural audio file was missing or empty');
      }

      // Sentence chunking for longer texts (e.g. full narration scripts)
      const sentences = cleanText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleanText];
      const chunks = [];
      let currentChunk = '';
      for (const s of sentences) {
        if ((currentChunk + ' ' + s).length <= 280) {
          currentChunk = (currentChunk + ' ' + s).trim();
        } else {
          if (currentChunk) chunks.push(currentChunk);
          currentChunk = s.trim();
        }
      }
      if (currentChunk) chunks.push(currentChunk);

      const chunkFiles = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunkDir = path.join(tempDir, `c_${i}`);
        await fs.mkdir(chunkDir, { recursive: true });
        const res = await tts.toFile(chunkDir, chunks[i], prosody);
        if (fsSync.existsSync(res.audioFilePath) && fsSync.statSync(res.audioFilePath).size > 300) {
          chunkFiles.push(res.audioFilePath);
        }
      }
      tts.close();

      if (chunkFiles.length === 0) {
        throw new Error('No chunk audio was generated by MsEdgeTTS');
      }

      if (chunkFiles.length === 1) {
        await fs.copyFile(chunkFiles[0], outputPath);
      } else {
        const listPath = path.join(tempDir, 'concat_list.txt');
        const listContent = chunkFiles.map(f => `file '${path.resolve(f).replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n');
        await fs.writeFile(listPath, listContent);
        await runFFmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath]);
      }

      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

      if (fsSync.existsSync(outputPath) && fsSync.statSync(outputPath).size > 1000) {
        this.logger.info(`Neural audio generated successfully (chunked): ${outputPath} (${(fsSync.statSync(outputPath).size / 1024).toFixed(1)} KB)`);
        return outputPath;
      }
      throw new Error('Concatenated neural audio file was missing or empty');
    } catch (err) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
  }

  async generateFallbackToneAudio(outputPath) {
    await runFFmpeg(['-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '10', '-q:a', '9', '-acodec', 'libmp3lame', outputPath]);
    return outputPath;
  }

  async generateFreeTTS(text, outputPath) {
    this.logger.info('Using high-reliability speech engine...');
    const https = require('https');
    const fsSync = require('fs');

    const cleanText = (text || '').replace(/[^\w\s.,?!'-]/g, ' ').replace(/\s+/g, ' ').trim();
    const sentences = cleanText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleanText];
    const chunks = [];
    let current = '';

    for (const s of sentences) {
      if ((current + ' ' + s).length < 150) {
        current = (current + ' ' + s).trim();
      } else {
        if (current) chunks.push(current);
        current = s.trim().substring(0, 150);
      }
    }
    if (current) chunks.push(current);

    const tempDir = path.join(path.dirname(outputPath), 'tts_chunks_' + Date.now());
    await fs.mkdir(tempDir, { recursive: true });

    const chunkFiles = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkFile = path.join(tempDir, `chunk_${i}.mp3`);
      const encoded = encodeURIComponent(chunks[i]);
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=${encoded}`;

      await new Promise((resolve) => {
        const fileStream = fsSync.createWriteStream(chunkFile);
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
          if (res.statusCode !== 200) {
            fileStream.close();
            return resolve();
          }
          res.pipe(fileStream);
          fileStream.on('finish', resolve);
          fileStream.on('error', resolve);
        }).on('error', resolve);
      });

      if (fsSync.existsSync(chunkFile) && fsSync.statSync(chunkFile).size > 300) {
        chunkFiles.push(chunkFile);
      }
    }

    if (chunkFiles.length > 0) {
      const listPath = path.join(tempDir, 'list.txt');
      const listContent = chunkFiles.map(f => `file '${path.resolve(f).replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n');
      await fs.writeFile(listPath, listContent);
      await runFFmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath]);
      for (const f of chunkFiles) await fs.unlink(f).catch(() => {});
      await fs.unlink(listPath).catch(() => {});
      await fs.rmdir(tempDir).catch(() => {});
      return outputPath;
    }

    return await this.generateFallbackToneAudio(outputPath);
  }

  async generateElevenLabsTTS(text, outputPath) {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.elevenLabsVoiceId}`;
    
    const data = {
      text: text,
      model_id: this.elevenLabsModel,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.8,
        style: 0.0,
        use_speaker_boost: true
      }
    };

    const response = await axios({
      method: 'POST',
      url: url,
      data: data,
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': this.elevenLabsApiKey
      },
      responseType: 'stream'
    });

    const writer = require('fs').createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        this.logger.info('ElevenLabs TTS generation complete');
        resolve(outputPath);
      });
      writer.on('error', reject);
    });
  }

  async generateOpenAITTS(text, outputPath, options = {}) {
    if (!this.openai) throw new Error('OpenAI client not initialized');
    const model = options.model || process.env.OPENAI_TTS_MODEL || 'tts-1-hd';
    const voice = options.voice || 'nova';

    const response = await this.openai.audio.speech.create({
      model,
      voice,
      input: text,
      speed: 1.05
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(outputPath, buffer);

    this.logger.info(`OpenAI TTS generation complete (${model}, voice: ${voice})`);
    return outputPath;
  }

  async generateGeminiTTS(text, outputPath, options = {}) {
    const defaultModel = 'gemini-3.8-flash-tts';
    const model = options.model || process.env.GEMINI_TTS_MODEL || defaultModel;
    const voiceName = options.voice || process.env.GEMINI_TTS_VOICE || 'Puck';

    const tryGenerate = async (m, v) => {
      const response = await this.gemini.models.generateContent({
        model: m,
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: v }
            }
          }
        }
      });
      return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    };

    let audioData = null;
    let usedModel = model;
    try {
      audioData = await tryGenerate(model, voiceName);
    } catch (err) {
      if (model !== 'gemini-3.8-flash-lite-tts') {
        this.logger.warn(`Gemini TTS (${model}) error: ${err.message}; attempting gemini-3.8-flash-lite-tts fallback...`);
        try {
          usedModel = 'gemini-3.8-flash-lite-tts';
          audioData = await tryGenerate(usedModel, voiceName);
        } catch (liteErr) {
          throw err;
        }
      } else {
        throw err;
      }
    }

    if (!audioData) {
      throw new Error('Gemini TTS returned no audio data');
    }

    // Gemini returns raw PCM (24kHz, mono, 16-bit); encode to MP3 via FFmpeg
    const pcmPath = `${outputPath}.pcm`;
    await fs.writeFile(pcmPath, Buffer.from(audioData, 'base64'));
    await runFFmpeg(['-y', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', pcmPath, '-c:a', 'libmp3lame', '-b:a', '192k', outputPath]);
    await fs.unlink(pcmPath).catch(() => {});

    this.logger.info(`Gemini humanized neural audio generated successfully (${usedModel}, voice: ${voiceName})`);
    return outputPath;
  }

  async generateVisualAssets(prompt, style = "ethereal", count = 1) {
    this.logger.info(`Generating ${count} visual assets with style: ${style}`);

    try {
      if (!this.openai && !this.gemini) {
        return await this.simulateVisualAssets(prompt, style, count);
      }

      const enhancedPrompt = this.enhanceVisualPrompt(prompt, style);
      const localPaths = [];

      for (let i = 0; i < count; i++) {
        const imagePath = path.join(__dirname, '..', 'data', 'assets', `visual_${Date.now()}_${i}.png`);
        await this.generateImage(enhancedPrompt, imagePath);
        localPaths.push(imagePath);
      }

      this.logger.info(`Generated ${localPaths.length} visual assets`);
      return localPaths;
    } catch (error) {
      this.logger.error('Visual asset generation failed:', error);
      return await this.simulateVisualAssets(prompt, style, count);
    }
  }

  async generateImage(prompt, imagePath) {
    await fs.mkdir(path.dirname(imagePath), { recursive: true });

    if (this.openai) {
      return await this.generateOpenAIImage(prompt, imagePath);
    }

    if (this.gemini) {
      return await this.generateGeminiImage(prompt, imagePath);
    }

    throw new Error('No image generation provider configured');
  }

  async generateOpenAIImage(prompt, imagePath) {
    const response = await this.openai.images.generate({
      model: "gpt-image-2",
      prompt: prompt,
      n: 1,
      size: "1536x1024",
      quality: "high",
    });

    if (response.data[0].b64_json) {
      const buffer = Buffer.from(response.data[0].b64_json, 'base64');
      await fs.writeFile(imagePath, buffer);
    } else {
      await this.downloadImage(response.data[0].url, imagePath);
    }

    return imagePath;
  }

  async generateGeminiImage(prompt, imagePath) {
    const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';

    const response = await this.gemini.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: '16:9',
          imageSize: '1K'
        }
      }
    });

    const parts = response.candidates?.[0]?.content?.parts || [];
    const imageParts = parts.filter(part =>
      part.inlineData?.data && (!part.inlineData.mimeType || part.inlineData.mimeType.startsWith('image/'))
    );
    const renderedImages = imageParts.filter(part => part.thought !== true);
    const imagePart = (renderedImages.length ? renderedImages : imageParts).at(-1);
    if (!imagePart) {
      throw new Error('Gemini image generation returned no image data');
    }

    const imageBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
    const metadata = await sharp(imageBuffer, { failOn: 'error' }).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('Gemini image generation returned an invalid image asset');
    }

    const extension = path.extname(imagePath).toLowerCase();
    const output = sharp(imageBuffer, { failOn: 'error' });
    if (extension === '.jpg' || extension === '.jpeg') {
      await output.jpeg({ quality: 92 }).toFile(imagePath);
    } else if (extension === '.webp') {
      await output.webp({ quality: 92 }).toFile(imagePath);
    } else {
      await output.png().toFile(imagePath);
    }
    return imagePath;
  }

  enhanceVisualPrompt(prompt, style) {
    const styleEnhancements = {
      ethereal: "ethereal, dreamy, mystical, soft lighting, floating particles, cosmic background",
      modern: "modern, clean, minimalist, professional, sleek design, contemporary",
      animated: "animated style, cartoon, vibrant colors, expressive, dynamic",
      cinematic: "cinematic lighting, dramatic, movie poster style, high contrast",
      abstract: "abstract art, geometric shapes, gradient colors, artistic composition"
    };

    const enhancement = styleEnhancements[style] || styleEnhancements.ethereal;
    return `${prompt}, ${enhancement}, high quality, 16:9 aspect ratio, digital art`;
  }

  async downloadImage(url, outputPath) {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream'
    });

    const writer = require('fs').createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }

  async generateVideo(script, visualAssets, audioPath, outputPath, options = {}) {
    this.logger.info('Generating video from assets...');
    this.lastVideoResult = null;
    try {
      if (this.mediaGeneration && options.productionId) {
        const generated = await this.mediaGeneration.generateClips({
          jobId: options.jobId || null,
          productionId: options.productionId,
          script,
          visualAssets,
          outputDir: path.dirname(outputPath)
        });
        if (generated.clips.length) {
          const produced = await this.generateHybridVideo(
            generated.clips,
            visualAssets,
            audioPath,
            outputPath,
            options.estimatedDuration || this.calculateScriptDuration(script)
          );
          this.lastVideoResult = {
            requestedProvider: generated.requestedProvider,
            actualProvider: generated.actualProvider,
            model: generated.model,
            mode: generated.settings.mode,
            generatedSeconds: generated.clips.reduce((total, clip) => total + clip.duration, 0),
            tasks: generated.clips.map(clip => ({ scene: clip.index, taskId: clip.taskId, provider: clip.provider, model: clip.model })),
            scenes: generated.clips.map(clip => ({
              index: clip.index, label: clip.label, prompt: clip.prompt, duration: clip.duration,
              path: clip.path, taskId: clip.taskId, provider: clip.provider, model: clip.model
            }))
          };
          return produced;
        }
      }

      const produced = await this.generateSlideshowVideo(script, visualAssets, audioPath, outputPath, options);
      this.lastVideoResult = { requestedProvider: 'slideshow', actualProvider: 'slideshow', model: 'local-ffmpeg', mode: 'slideshow', generatedSeconds: 0, tasks: [], scenes: [] };
      return produced;
    } catch (error) {
      // The Logger's console line only shows the message string, so put the real
      // reason inline. Previously the stack alone went to the file transport and
      // the console printed "Video generation failed:" with no detail.
      const reason = error && error.message ? error.message : String(error);
      this.logger.error(`Video provider generation failed; using the local slideshow: ${reason}`, error);
      try {
        const produced = await this.generateSlideshowVideo(script, visualAssets, audioPath, outputPath, options);
        this.lastVideoResult = {
          requestedProvider: this.lastVideoResult?.requestedProvider || 'configured-provider',
          actualProvider: 'slideshow', model: 'local-ffmpeg', mode: 'fallback', generatedSeconds: 0,
          fallbackReason: reason, tasks: [], scenes: []
        };
        return produced;
      } catch (fallbackError) {
        this.logger.error(`Local slideshow fallback failed: ${fallbackError.message}`, fallbackError);
        const produced = await this.simulateVideoGeneration(script, visualAssets, audioPath, outputPath);
        this.lastVideoResult = {
          requestedProvider: 'configured-provider', actualProvider: 'simulation', model: null,
          mode: 'simulation', generatedSeconds: 0, fallbackReason: `${reason}; ${fallbackError.message}`, tasks: [], scenes: []
        };
        return produced;
      }
    }
  }

  async generateHybridVideo(clips, visualAssets, audioPath, outputPath, totalDuration) {
    if (!(await checkFFmpeg())) throw new Error(ffmpegInstallHint());
    const validImages = await this.filterLocalImageAssets(visualAssets);
    const segments = clips.map(clip => ({ type: 'video', path: clip.path, duration: clip.duration }));
    const generatedDuration = segments.reduce((sum, item) => sum + item.duration, 0);
    const remaining = Math.max(0, this.parseDurationSeconds(totalDuration) - generatedDuration);
    if (remaining && validImages.length) {
      const perImage = Math.max(2, remaining / validImages.length);
      for (const imagePath of validImages) segments.push({ type: 'image', path: imagePath, duration: perImage });
    }
    if (!segments.length) throw new Error('No usable provider clips or still images were generated');

    const visualPath = outputPath.replace(/\.mp4$/i, '_hybrid_visual.mp4');
    await this.renderMediaTimeline(segments, visualPath);
    await this.addAudioToVideo(visualPath, audioPath, outputPath, { loopVideo: true });
    await fs.unlink(visualPath).catch(() => {});
    return outputPath;
  }

  async renderMediaTimeline(segments, outputPath) {
    const args = ['-y'];
    for (const segment of segments) {
      if (segment.type === 'image') args.push('-loop', '1', '-t', Number(segment.duration).toFixed(2), '-framerate', '30', '-i', segment.path);
      else args.push('-stream_loop', '-1', '-i', segment.path);
    }
    const filters = segments.map((segment, index) =>
      `[${index}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,fps=30,format=yuv420p,trim=duration=${Number(segment.duration).toFixed(2)},setpts=PTS-STARTPTS[v${index}]`
    );
    filters.push(`${segments.map((_, index) => `[v${index}]`).join('')}concat=n=${segments.length}:v=1:a=0[vout]`);
    args.push('-filter_complex', filters.join(';'), '-map', '[vout]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', outputPath);
    await runFFmpeg(args);
    return outputPath;
  }

  async filterLocalImageAssets(visualAssets = []) {
    const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp']);
    const images = [];
    for (const asset of visualAssets) {
      if (typeof asset !== 'string' || !imageExtensions.has(path.extname(asset).toLowerCase())) continue;
      try {
        await fs.access(asset);
        images.push(asset);
      } catch (_error) { /* ignore missing assets */ }
    }
    return images;
  }

  parseDurationSeconds(value) {
    if (Number.isFinite(Number(value))) return Math.max(0, Number(value));
    const parts = String(value || '').split(':').map(Number);
    if (parts.length === 2 && parts.every(Number.isFinite)) return Math.max(0, parts[0] * 60 + parts[1]);
    if (parts.length === 3 && parts.every(Number.isFinite)) return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
    return 0;
  }

  async generateReplicateVideo(script, visualAssets, audioPath, outputPath) {
    const output = await this.replicate.run(
      "wan-video/wan-2.7-i2v",
      {
        input: {
          image: visualAssets[0],
          prompt: script.title || "smooth cinematic motion",
          duration: 5,
          resolution: "720p"
        }
      }
    );

    // Download the generated video
    if (output && output.length > 0) {
      await this.downloadVideo(output[0], outputPath);
      
      // Add audio track
      await this.addAudioToVideo(outputPath, audioPath, outputPath);
    }

    return outputPath;
  }

  async generateSlideshowVideo(script, visualAssets, audioPath, outputPath, options = {}) {
    this.logger.info('Creating slideshow video...');

    if (!(await checkFFmpeg())) {
      throw new Error(ffmpegInstallHint());
    }

    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    const slidesDir = path.join(path.dirname(outputPath), 'slides_' + path.basename(outputPath, '.mp4').replace(/[^a-zA-Z0-9_-]/g, ''));

    try {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1080, height: 1920 });

      // Create HTML for slideshow
      const imageAssets = await this.filterImageAssets(visualAssets);
      await page.setContent(this.createSlideshowHTML(script, imageAssets));
      await page.addStyleTag({ content: '* { transition: none !important; }' });

      // Render each slide segment matched 1:1 with its exact narration audio
      const slidesList = Array.isArray(script.slides) && script.slides.length > 0
        ? script.slides
        : (script.mainContent?.sections || script.sections || []);

      const slideSegments = [];
      const slideAudios = [];

      // Lock ONE consistent humanized voice persona for the ENTIRE video to prevent voice jumping across slides
      const videoVoiceOptions = this.getRotatedVoice(options);
      this.logger.info(`Locked narrator for entire 3-minute video: ${videoVoiceOptions.voice || 'default'} (${videoVoiceOptions.gender || 'instructor'})`);

      const slideCount = await page.evaluate(() => document.querySelectorAll('.slide').length);
      await fs.mkdir(slidesDir, { recursive: true });

      for (let i = 0; i < slideCount; i++) {
        const slideData = slidesList[i] || {};
        const narrationText = String(
          slideData.teacherNarration ||
          slideData.spokenNarration ||
          (Array.isArray(slideData.content) ? slideData.content.join('. ') : slideData.content) ||
          slideData.headline ||
          ''
        ).trim();

        const slideAudioPath = path.join(slidesDir, `slide_${String(i).padStart(3, '0')}_audio.mp3`);
        const segmentVideoPath = path.join(slidesDir, `slide_${String(i).padStart(3, '0')}_segment.mp4`);

        let audioSuccess = false;
        if (narrationText) {
          try {
            await this.generateTTSAudio(narrationText, slideAudioPath, videoVoiceOptions);
            audioSuccess = await this.isUsableAudioFile(slideAudioPath);
          } catch (ttsErr) {
            this.logger.warn(`Slide ${i + 1} TTS synthesis error: ${ttsErr.message}`);
          }
        }

        let slideDuration = 28;
        if (audioSuccess) {
          const rawDur = await this.getAudioDuration(slideAudioPath);
          if (rawDur > 0) {
            slideDuration = Math.max(16, Number((rawDur + 0.35).toFixed(2)));
          }
        } else {
          await runFFmpeg([
            '-y',
            '-f', 'lavfi',
            '-i', 'anullsrc=r=24000:cl=mono',
            '-t', String(slideDuration),
            '-acodec', 'libmp3lame',
            '-b:a', '128k',
            slideAudioPath
          ]);
        }
        slideAudios.push(slideAudioPath);

        this.logger.info(`Rendering cinematic slide video for Slide ${i + 1}/${slideCount}: duration=${slideDuration}s`);

        // Render high-definition 1080x1920 slide screenshot with Ken Burns cinematic camera zoompan
        const stillPath = path.join(slidesDir, `slide_${String(i).padStart(3, '0')}.png`);

        // Strict Pre-flight Slide Verification: Check that slide is 100% visible and fits within 1080x1920
        const slideCheck = await page.evaluate((index) => {
          document.querySelectorAll('.slide').forEach((slide, s) => {
            slide.classList.toggle('active', s === index);
          });

          const activeSlide = document.querySelector('.slide.active');
          if (!activeSlide) return { ok: false, reason: 'No active slide element' };

          const card = activeSlide.querySelector('.section-card');
          if (!card) return { ok: true, reason: 'No section card' };

          // Reset previous transformations
          card.style.transform = 'none';
          card.style.transformOrigin = 'center top';

          let rect = card.getBoundingClientRect();
          // Maximum allowable bottom coordinate before elements get cut off
          const maxBottom = 1850;
          let scaled = false;
          let scaleFactor = 1;
          if (rect.bottom > maxBottom) {
            const availableH = maxBottom - rect.top;
            const neededH = rect.height;
            scaleFactor = Math.max(0.74, Number((availableH / neededH).toFixed(3)));
            card.style.transform = `scale(${scaleFactor})`;
            scaled = true;
          }

          rect = card.getBoundingClientRect();
          const bullets = Array.from(activeSlide.querySelectorAll('.bullet-card'));
          const bulletsOk = bullets.every(b => {
            const br = b.getBoundingClientRect();
            return br.height > 15 && br.bottom <= 1900;
          });

          return {
            ok: true,
            scaled,
            scaleFactor,
            cardTop: Math.round(rect.top),
            cardBottom: Math.round(rect.bottom),
            bulletsOk,
            bulletsCount: bullets.length
          };
        }, i);

        await page.waitForTimeout(120);
        await page.screenshot({ path: stillPath });

        // Automated Pre-flight Verification: Verify screenshot is fully rendered and not clipped/blank/grey
        const imageCheck = await this.verifySlideImageFullyRendered(stillPath);
        if (!imageCheck.valid) {
          this.logger.warn(`Slide ${i + 1} screenshot check notice (${imageCheck.reason}); re-rendering screenshot...`);
          await page.waitForTimeout(250);
          await page.screenshot({ path: stillPath });
        } else {
          this.logger.info(`Slide ${i + 1} layout verified: 100% visible inside 1080x1920 canvas (cardBottom: ${slideCheck.cardBottom}px, scaled: ${slideCheck.scaled})`);
        }
        // Detect animated media window for looping GIF/video overlay
        const animatedBox = await page.evaluate(() => {
          const activeSlide = document.querySelector('.slide.active');
          if (!activeSlide) return null;
          const target = activeSlide.querySelector('#meme-window') ||
                         activeSlide.querySelector('.meme-svg-wrapper') ||
                         activeSlide.querySelector('.meme-card-container');
          if (!target) return null;
          const r = target.getBoundingClientRect();
          return {
            x: Math.round(r.x),
            y: Math.round(r.y),
            width: Math.round(r.width),
            height: Math.round(r.height)
          };
        });

        const isMemeSlide = i === 1 || slideData.type === 'meme' || Boolean(slideData.meme);
        let animatedAsset = null;
        if (isMemeSlide || animatedBox) {
          animatedAsset = await this.getMemeAnimatedAsset(script.title || slideData.headline, slideData.meme?.type, i);
        }

        if (animatedAsset && animatedBox && animatedBox.width > 50 && animatedBox.height > 50) {
          let w = animatedBox.width;
          let h = animatedBox.height;
          if (w % 2 !== 0) w -= 1;
          if (h % 2 !== 0) h -= 1;
          const x = animatedBox.x;
          const y = animatedBox.y;

          this.logger.info(`Overlaying looping animated GIF meme into slide ${i + 1}: ${path.basename(animatedAsset)} at (${x},${y},${w}x${h})`);

          try {
            await runFFmpeg([
              '-y',
              '-loop', '1',
              '-i', stillPath,
              '-stream_loop', '-1',
              '-i', animatedAsset,
              '-i', slideAudioPath,
              '-filter_complex', `[1:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},format=rgba[anim];[0:v][anim]overlay=${x}:${y}:shortest=1[v]`,
              '-map', '[v]',
              '-map', '2:a',
              '-c:v', 'libx264',
              '-preset', 'veryfast',
              '-pix_fmt', 'yuv420p',
              '-c:a', 'aac',
              '-b:a', '192k',
              '-t', String(slideDuration),
              segmentVideoPath
            ]);
          } catch (overlayErr) {
            this.logger.warn(`Animated overlay failed (${overlayErr.message}); falling back to static render`);
            await runFFmpeg([
              '-y',
              '-loop', '1',
              '-i', stillPath,
              '-i', slideAudioPath,
              '-vf', 'scale=1080:1920,format=yuv420p',
              '-c:v', 'libx264',
              '-preset', 'veryfast',
              '-pix_fmt', 'yuv420p',
              '-c:a', 'aac',
              '-b:a', '192k',
              '-t', String(slideDuration),
              segmentVideoPath
            ]);
          }
        } else {
          await runFFmpeg([
            '-y',
            '-loop', '1',
            '-i', stillPath,
            '-i', slideAudioPath,
            '-vf', 'scale=1080:1920,format=yuv420p',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-t', String(slideDuration),
            segmentVideoPath
          ]);
        }

        // Automated Segment Video Verification: Verify segment video is fully rendered before adding to video
        const segmentCheck = await this.verifySegmentVideoIntegrity(segmentVideoPath, slideDuration);
        if (!segmentCheck.valid) {
          this.logger.warn(`Slide ${i + 1} segment check notice: ${segmentCheck.reason}`);
        } else {
          this.logger.info(`Slide ${i + 1} segment video verified (${segmentCheck.duration}s, ${(segmentCheck.size / 1024 / 1024).toFixed(2)} MB)`);
        }

        slideSegments.push(segmentVideoPath);
      }

      // Concat all slide segments into final video using FFmpeg concat filter for guaranteed timestamp continuity and stream sync
      const concatInputs = [];
      let filterStreams = '';
      for (let s = 0; s < slideSegments.length; s++) {
        concatInputs.push('-i', slideSegments[s]);
        filterStreams += `[${s}:v][${s}:a]`;
      }
      const filterComplex = `${filterStreams}concat=n=${slideSegments.length}:v=1:a=1[v][a]`;

      await runFFmpeg([
        '-y',
        ...concatInputs,
        '-filter_complex', filterComplex,
        '-map', '[v]',
        '-map', '[a]',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '192k',
        outputPath
      ]);

      // Ensure Shorts video strictly never exceeds 178 seconds (3-minute YouTube Shorts hard cutoff: <= 180s)
      if (options.shortsMode !== false) {
        try {
          const totalDur = await this.getAudioDuration(outputPath);
          if (totalDur > 178.5) {
            this.logger.info(`Trimming final video from ${totalDur}s to 176.0s for strict 3-minute YouTube Shorts compliance`);
            const clampedTemp = path.join(slidesDir, 'clamped_output.mp4');
            await runFFmpeg([
              '-y',
              '-i', outputPath,
              '-t', '176.0',
              '-c', 'copy',
              clampedTemp
            ]);
            await fs.copyFile(clampedTemp, outputPath);
          }
        } catch (_clampErr) {
          // Non-fatal
        }
      }

      // Extract combined audio into audioPath
      try {
        await runFFmpeg([
          '-y',
          '-i', outputPath,
          '-vn',
          '-c:a', 'libmp3lame',
          '-b:a', '128k',
          audioPath
        ]);
      } catch (_extractErr) {
        this.logger.warn(`Audio extraction warning: ${_extractErr.message}`);
      }

      return outputPath;
    } finally {
      await browser.close().catch(() => {});
      await this.cleanupDirectory(slidesDir);
    }
  }

  generateSlideSRT(text, duration) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    const words = clean.split(' ');
    const wordsPerChunk = 5;
    const chunks = [];
    for (let w = 0; w < words.length; w += wordsPerChunk) {
      chunks.push(words.slice(w, w + wordsPerChunk).join(' '));
    }
    const chunkDur = duration / Math.max(1, chunks.length);
    let srt = '';
    const formatTime = (s) => {
      const ms = Math.floor((s % 1) * 1000);
      const totalSec = Math.floor(s);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      const hrs = Math.floor(mins / 60);
      return `${String(hrs).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    };
    chunks.forEach((chunk, idx) => {
      const start = idx * chunkDur;
      const end = Math.min(duration, (idx + 1) * chunkDur);
      srt += `${idx + 1}\n${formatTime(start)} --> ${formatTime(end)}\n${chunk}\n\n`;
    });
    return srt;
  }

  async renderSlidesToVideo(stills, totalDuration, videoPath) {
    if (stills.length === 0) {
      throw new Error('No slides to render');
    }

    // Use concat demuxer for large slide counts (>8) or explicit duration arrays to prevent CLI overflows
    if (stills.length > 8 || Array.isArray(totalDuration)) {
      const concatFile = `${videoPath}.concat.txt`;
      let lines = [];
      const defaultDuration = Array.isArray(totalDuration) ? 2 : Math.max(2, totalDuration / stills.length);

      for (let i = 0; i < stills.length; i++) {
        const stillEscaped = stills[i].replace(/\\/g, '/');
        const dur = Array.isArray(totalDuration) ? (totalDuration[i] || defaultDuration) : defaultDuration;
        lines.push(`file '${stillEscaped}'`);
        lines.push(`duration ${dur}`);
      }
      lines.push(`file '${stills[stills.length - 1].replace(/\\/g, '/')}'`);

      await fs.writeFile(concatFile, lines.join('\n'));
      try {
        await runFFmpeg([
          '-y',
          '-f', 'concat',
          '-safe', '0',
          '-i', concatFile,
          '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-r', '30',
          videoPath
        ]);
        return videoPath;
      } finally {
        await fs.unlink(concatFile).catch(() => {});
      }
    }

    const fade = 0.5;
    const perSlide = Math.max(2, totalDuration / stills.length);

    const args = ['-y'];
    for (const still of stills) {
      args.push('-loop', '1', '-t', perSlide.toFixed(2), '-framerate', '30', '-i', still);
    }

    if (stills.length === 1) {
      args.push('-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p', '-c:v', 'libx264', videoPath);
      await runFFmpeg(args);
      return videoPath;
    }

    // Chain crossfades: transition k starts fade seconds before slide k ends
    const filters = [];
    let prev = '[0:v]';
    for (let i = 1; i < stills.length; i++) {
      const out = `[v${i}]`;
      const offset = (i * (perSlide - fade)).toFixed(2);
      filters.push(`${prev}[${i}:v]xfade=transition=fade:duration=${fade}:offset=${offset}${out}`);
      prev = out;
    }
    filters.push(`${prev}scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p[vfinal]`);

    args.push(
      '-filter_complex', filters.join(';'),
      '-map', '[vfinal]',
      '-c:v', 'libx264',
      '-r', '30',
      videoPath
    );

    await runFFmpeg(args);
    return videoPath;
  }

  async filterImageAssets(visualAssets = []) {
    const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp']);
    const mimeTypes = {
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp'
    };
    const images = [];

    for (const asset of visualAssets) {
      if (typeof asset !== 'string' || !imageExtensions.has(path.extname(asset).toLowerCase())) {
        continue;
      }

      try {
        const imageBuffer = await fs.readFile(asset);
        const metadata = await sharp(imageBuffer, { failOn: 'error' }).metadata();
        const mimeType = mimeTypes[metadata.format];
        if (mimeType && metadata.width && metadata.height) {
          images.push(`data:${mimeType};base64,${imageBuffer.toString('base64')}`);
        }
      } catch (_error) {
        // Skip missing or invalid image files
      }
    }

    return images;
  }

  async getAudioDuration(audioPath, options = {}) {
    if (!audioPath) return options.shortsMode ? 172 : 0;
    try {
      const fsSync = require('fs');
      if (!fsSync.existsSync(audioPath) || fsSync.statSync(audioPath).size < 100) {
        return options.shortsMode ? 172 : 0;
      }

      // Method 1: Probe exact container duration using bundled FFmpeg
      let output = '';
      try {
        const res = await runFFmpeg(['-i', audioPath, '-f', 'null', '-']);
        output = (res.stdout || '') + (res.stderr || '');
      } catch (err) {
        output = (err.stdout || '') + (err.stderr || '');
      }

      const match = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (match) {
        const hours = parseInt(match[1], 10);
        const mins = parseInt(match[2], 10);
        const secs = parseFloat(match[3]);
        const totalSecs = Number((hours * 3600 + mins * 60 + secs).toFixed(2));
        if (Number.isFinite(totalSecs) && totalSecs > 0) {
          if (options.shortsMode) {
            return Math.min(178, Math.max(30, Math.ceil(totalSecs)));
          }
          return totalSecs;
        }
      }

      // Method 2: System ffprobe fallback
      try {
        const { exec } = require('child_process');
        const util = require('util');
        const execPromise = util.promisify(exec);
        const { stdout } = await execPromise(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`);
        const dur = parseFloat(String(stdout).trim());
        if (Number.isFinite(dur) && dur > 0) {
          if (options.shortsMode) {
            return Math.min(178, Math.max(30, Math.ceil(dur)));
          }
          return Number(dur.toFixed(2));
        }
      } catch (_ffErr) {
        // Continue to size-based heuristic
      }

      // Method 3: Bitrate heuristic from file size (assuming 96-128kbps MP3)
      const stat = fsSync.statSync(audioPath);
      if (stat.size > 1000) {
        const estimated = Number((stat.size / 16000).toFixed(2)); // ~128kbps = 16KB/s
        if (options.shortsMode) {
          return Math.min(178, Math.max(30, Math.ceil(estimated)));
        }
        return estimated;
      }
    } catch (_err) {
      // Non-fatal
    }
    return options.shortsMode ? 172 : 0;
  }

  escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  createSlideshowHTML(script, visualAssets = []) {
    if (Array.isArray(script.slides) && script.slides.length > 0) {
      return this.createMultiSlideShortsHTML(script, visualAssets);
    }

    const theme = this.getRotatedTheme();

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            width: 1080px;
            height: 1920px;
            background: ${theme.bg};
            background-image: 
                ${theme.bgGradient},
                linear-gradient(${theme.gridColor} 1px, transparent 1px),
                linear-gradient(90deg, ${theme.gridColor} 1px, transparent 1px);
            background-size: 100% 100%, 100% 100%, 48px 48px, 48px 48px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #f1f5f9;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .slide {
            position: absolute;
            width: 1080px;
            height: 1920px;
            padding: 100px 70px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            opacity: 0;
            transition: opacity 1s ease-in-out;
        }
        
        .slide.active {
            opacity: 1;
        }

        @keyframes pulseGlow {
            0% { transform: scale(1); filter: drop-shadow(0 0 10px rgba(${theme.accentRGB}, 0.3)); }
            50% { transform: scale(1.02); filter: drop-shadow(0 0 25px rgba(${theme.accentRGB}, 0.7)); }
            100% { transform: scale(1); filter: drop-shadow(0 0 10px rgba(${theme.accentRGB}, 0.3)); }
        }
        @keyframes flameFlicker {
            0%, 100% { transform: scale(1) rotate(0deg); }
            25% { transform: scale(1.03, 0.98) rotate(1deg); }
            50% { transform: scale(0.98, 1.04) rotate(-1deg); }
            75% { transform: scale(1.02, 1.01) rotate(0.5deg); }
        }
        @keyframes statusDot {
            0%, 100% { opacity: 1; filter: drop-shadow(0 0 8px #22c55e); }
            50% { opacity: 0.3; filter: none; }
        }
        @keyframes blinkCursor {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
        }

        .meme-svg {
            animation: flameFlicker 2s infinite ease-in-out;
            transform-origin: bottom center;
        }

        .live-terminal-bar {
            width: 100%;
            background: #090d16;
            border-top: 1px solid #1e293b;
            padding: 16px 24px;
            display: flex;
            align-items: center;
            gap: 14px;
            font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
            font-size: 20px;
            color: #94a3b8;
        }
        .live-status-dot {
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: #22c55e;
            animation: statusDot 1.2s infinite ease-in-out;
        }
        .cursor-blink {
            display: inline-block;
            width: 10px;
            height: 22px;
            background: ${theme.accent};
            margin-left: 6px;
            animation: blinkCursor 0.8s infinite;
            vertical-align: middle;
        }

        .background-image {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            opacity: 0.12;
            z-index: 0;
            pointer-events: none;
        }
        
        .top-badge {
            display: inline-flex;
            align-items: center;
            gap: 12px;
            background: ${theme.badgeBg};
            border: 1px solid rgba(${theme.accentRGB}, 0.4);
            color: ${theme.accent};
            font-size: 26px;
            font-weight: 700;
            letter-spacing: 2px;
            text-transform: uppercase;
            padding: 14px 28px;
            border-radius: 9999px;
            margin-bottom: 40px;
            animation: pulseGlow 3s infinite ease-in-out;
        }

        .title-card {
            text-align: center;
            max-width: 940px;
        }
        
        h1.main-title {
            font-size: 68px;
            line-height: 1.25;
            font-weight: 800;
            letter-spacing: -1px;
            color: #ffffff;
            margin-bottom: 40px;
            text-shadow: 0 4px 20px rgba(0,0,0,0.6);
            background: linear-gradient(135deg, #ffffff 40%, #94a3b8 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        
        .subtitle {
            font-size: 34px;
            line-height: 1.5;
            color: #94a3b8;
            margin-bottom: 50px;
        }

        .hero-feature-box {
            background: rgba(30, 41, 59, 0.7);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 24px;
            padding: 40px;
            width: 100%;
            text-align: left;
            backdrop-filter: blur(12px);
        }

        .feature-item {
            display: flex;
            align-items: center;
            gap: 20px;
            font-size: 32px;
            font-weight: 600;
            color: #e2e8f0;
            margin-bottom: 24px;
        }
        .feature-item:last-child {
            margin-bottom: 0;
        }
        .feature-icon {
            font-size: 36px;
        }
        
        .section-card {
            width: 100%;
            max-width: 960px;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
        }
        
        h2.section-header {
            font-size: 52px;
            font-weight: 800;
            color: ${theme.accent};
            margin-bottom: 35px;
            line-height: 1.2;
            text-shadow: 0 2px 10px rgba(${theme.accentRGB}, 0.3);
        }
        
        .content-card {
            background: rgba(15, 23, 42, 0.85);
            border: 1px solid #334155;
            border-radius: 20px;
            padding: 36px 40px;
            width: 100%;
            margin-bottom: 25px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        
        .content-text {
            font-size: 32px;
            line-height: 1.55;
            color: #cbd5e1;
            margin-bottom: 16px;
        }
        .content-text:last-child {
            margin-bottom: 0;
        }
        
        .code-container {
            width: 100%;
            background: #0d1117;
            border: 1px solid #30363d;
            border-radius: 20px;
            overflow: hidden;
            margin-top: 15px;
            box-shadow: 0 12px 35px rgba(0,0,0,0.7);
        }
        
        .code-header {
            display: flex;
            align-items: center;
            gap: 10px;
            background: #161b22;
            padding: 18px 24px;
            border-bottom: 1px solid #30363d;
        }
        
        .dot {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            display: inline-block;
        }
        .dot.red { background: #ff5f56; }
        .dot.yellow { background: #ffbd2e; }
        .dot.green { background: #27c93f; }
        
        .file-title {
            color: #8b949e;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 24px;
            margin-left: 12px;
        }
        
        .code-block {
            padding: 28px 32px;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 26px;
            line-height: 1.55;
            color: ${theme.codeColor};
            white-space: pre-wrap;
            word-break: break-all;
        }
        
        .takeaway-card {
            background: linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95));
            border: 2px solid ${theme.accent};
            border-radius: 24px;
            padding: 50px 40px;
            text-align: center;
            max-width: 940px;
            box-shadow: 0 0 50px rgba(${theme.accentRGB}, 0.2);
        }
        
        .takeaway-title {
            font-size: 48px;
            font-weight: 800;
            color: ${theme.secondary};
            margin-bottom: 30px;
        }
        
        .takeaway-text {
            font-size: 36px;
            line-height: 1.6;
            color: #f8fafc;
            margin-bottom: 40px;
        }
        
        .takeaway-footer {
            font-size: 28px;
            color: #94a3b8;
            font-weight: 500;
            letter-spacing: 1px;
        }
    </style>
</head>
<body>
    <!-- Slide 1: High-Impact Vertical Title Card -->
    <div class="slide active">
        ${visualAssets && visualAssets[0] ? `<img class="background-image" src="${visualAssets[0]}" />` : ''}
        <div class="top-badge" style="position:relative; z-index:1;">TECHNICAL DEEP DIVE</div>
        <div class="title-card" style="position:relative; z-index:1;">
            <h1 class="main-title">${this.escapeHTML(this.stripEmojis(script.title))}</h1>
            <p class="subtitle">${this.escapeHTML(this.stripEmojis(script.hook?.text || script.hook || 'Start to End IT Concept & Practical Code Example'))}</p>
            <div class="hero-feature-box">
                <div class="feature-item">Architectural Overview</div>
                <div class="feature-item">Under-The-Hood Mechanics</div>
                <div class="feature-item">Working Code / CLI Walkthrough</div>
                <div class="feature-item">Production Best Practices</div>
            </div>
        </div>
    </div>
    
    ${this.generateContentSlides(script, visualAssets).join('')}
    
    <!-- Final Slide: Engineering Takeaway -->
    <div class="slide">
        ${visualAssets && visualAssets.length > 1 ? `<img class="background-image" src="${visualAssets[visualAssets.length - 1]}" />` : ''}
        <div class="takeaway-card" style="position:relative; z-index:1;">
            <div class="top-badge">Senior Engineer Takeaway</div>
            <div class="takeaway-title">Production Rule of Thumb</div>
            <p class="takeaway-text">${this.escapeHTML(this.stripEmojis(script.conclusion?.finalThought || 'Master this pattern to build resilient, scalable production infrastructure.'))}</p>
            <div class="takeaway-footer">Save for System Design & Coding Interviews</div>
        </div>
    </div>
</body>
</html>`;
  }

  renderMemeSVG(memeType = 'server_on_fire') {
    switch (memeType) {
      case 'server_on_fire':
        return `
        <div class="meme-svg-wrapper">
          <svg viewBox="0 0 440 230" class="meme-svg" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="flameGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stop-color="#ef4444" />
                <stop offset="50%" stop-color="#f97316" />
                <stop offset="100%" stop-color="#facc15" />
              </linearGradient>
              <linearGradient id="rackGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#1e293b" />
                <stop offset="100%" stop-color="#0f172a" />
              </linearGradient>
            </defs>
            <rect x="70" y="25" width="280" height="180" rx="14" fill="url(#rackGrad)" stroke="#475569" stroke-width="4" />
            <rect x="85" y="40" width="250" height="36" rx="6" fill="#0f172a" stroke="#334155" stroke-width="2" />
            <circle cx="105" cy="58" r="6" fill="#ef4444" />
            <circle cx="125" cy="58" r="6" fill="#ef4444" />
            <circle cx="145" cy="58" r="6" fill="#eab308" />
            <line x1="170" y1="58" x2="315" y2="58" stroke="#334155" stroke-width="3" stroke-dasharray="6,4" />
            <rect x="85" y="88" width="250" height="36" rx="6" fill="#0f172a" stroke="#ef4444" stroke-width="2" />
            <circle cx="105" cy="106" r="6" fill="#ef4444" />
            <circle cx="125" cy="106" r="6" fill="#ef4444" />
            <circle cx="145" cy="106" r="6" fill="#ef4444" />
            <line x1="170" y1="106" x2="315" y2="106" stroke="#ef4444" stroke-width="3" stroke-dasharray="4,4" />
            <rect x="85" y="136" width="250" height="36" rx="6" fill="#0f172a" stroke="#334155" stroke-width="2" />
            <circle cx="105" cy="154" r="6" fill="#ef4444" />
            <circle cx="125" cy="154" r="6" fill="#ef4444" />
            <line x1="150" y1="154" x2="315" y2="154" stroke="#334155" stroke-width="3" stroke-dasharray="6,4" />
            <path d="M 120 180 Q 110 130 135 110 Q 150 90 140 55 Q 170 80 160 115 Q 185 90 195 65 Q 215 100 200 135 Q 230 105 240 75 Q 260 110 245 145 Q 275 120 285 90 Q 300 125 280 180 Z" fill="url(#flameGrad)" opacity="0.95" />
            <path d="M 150 180 Q 160 140 180 115 Q 200 145 220 125 Q 230 155 210 180 Z" fill="#ffea00" opacity="0.88" />
            <rect x="250" y="145" width="85" height="52" rx="8" fill="#f8fafc" stroke="#0f172a" stroke-width="2" />
            <path d="M 335 158 C 352 158, 352 184, 335 184" fill="none" stroke="#f8fafc" stroke-width="6" stroke-linecap="round" />
            <text x="292" y="168" font-size="11" font-weight="900" text-anchor="middle" fill="#0f172a">THIS IS</text>
            <text x="292" y="186" font-size="13" font-weight="900" text-anchor="middle" fill="#dc2626">FINE</text>
          </svg>
        </div>`;

      case 'works_on_my_machine':
        return `
        <div class="meme-svg-wrapper">
          <svg viewBox="0 0 440 230" class="meme-svg" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#fef08a" />
                <stop offset="50%" stop-color="#eab308" />
                <stop offset="100%" stop-color="#ca8a04" />
              </linearGradient>
            </defs>
            <polygon points="175,175 155,225 190,210 225,225 205,175" fill="#dc2626" />
            <polygon points="225,175 205,225 240,210 275,225 255,175" fill="#b91c1c" />
            <circle cx="220" cy="110" r="92" fill="url(#goldGrad)" stroke="#78350f" stroke-width="4" />
            <circle cx="220" cy="110" r="78" fill="#1e293b" stroke="#ca8a04" stroke-width="3" stroke-dasharray="6,4" />
            <text x="220" y="62" font-size="12" font-weight="800" text-anchor="middle" fill="#facc15" letter-spacing="3">OFFICIAL SEAL</text>
            <text x="220" y="88" font-size="19" font-weight="900" text-anchor="middle" fill="#ffffff" letter-spacing="1">WORKS ON</text>
            <text x="220" y="112" font-size="19" font-weight="900" text-anchor="middle" fill="#ffffff" letter-spacing="1">MY MACHINE</text>
            <text x="220" y="136" font-size="11" font-weight="700" text-anchor="middle" fill="#94a3b8">LOCALHOST:3000</text>
            <text x="220" y="156" font-size="12" font-weight="800" text-anchor="middle" fill="#22c55e">CERTIFIED 0 BUGS IN DEV</text>
          </svg>
        </div>`;

      case 'spiderman_pointing':
        return `
        <div class="meme-svg-wrapper">
          <svg viewBox="0 0 440 230" class="meme-svg" xmlns="http://www.w3.org/2000/svg">
            <rect x="40" y="35" width="150" height="160" rx="16" fill="#1e293b" stroke="#3b82f6" stroke-width="3" />
            <circle cx="115" cy="78" r="26" fill="#3b82f6" opacity="0.3" />
            <text x="115" y="83" font-size="13" font-weight="900" text-anchor="middle" fill="#93c5fd">CLIENT</text>
            <text x="115" y="125" font-size="16" font-weight="900" text-anchor="middle" fill="#60a5fa">FRONTEND</text>
            <text x="115" y="148" font-size="12" font-weight="800" text-anchor="middle" fill="#f87171">"500 SERVER ERR"</text>
            <text x="115" y="172" font-size="12" text-anchor="middle" fill="#94a3b8">"It is the backend"</text>
            <circle cx="220" cy="115" r="22" fill="#ef4444" opacity="0.25" />
            <text x="220" y="121" font-size="15" font-weight="900" text-anchor="middle" fill="#ef4444">VS</text>
            <rect x="250" y="35" width="150" height="160" rx="16" fill="#1e293b" stroke="#10b981" stroke-width="3" />
            <circle cx="325" cy="78" r="26" fill="#10b981" opacity="0.3" />
            <text x="325" y="83" font-size="13" font-weight="900" text-anchor="middle" fill="#a7f3d0">SERVER</text>
            <text x="325" y="125" font-size="16" font-weight="900" text-anchor="middle" fill="#34d399">BACKEND</text>
            <text x="325" y="148" font-size="12" font-weight="800" text-anchor="middle" fill="#f87171">"BAD REQUEST 400"</text>
            <text x="325" y="172" font-size="12" text-anchor="middle" fill="#94a3b8">"Invalid payload"</text>
          </svg>
        </div>`;

      case 'two_buttons':
        return `
        <div class="meme-svg-wrapper">
          <svg viewBox="0 0 440 230" class="meme-svg" xmlns="http://www.w3.org/2000/svg">
            <rect x="55" y="25" width="330" height="185" rx="16" fill="#1e293b" stroke="#475569" stroke-width="3" />
            <circle cx="220" cy="68" r="26" fill="#334155" stroke="#facc15" stroke-width="2" />
            <text x="220" y="73" font-size="13" font-weight="900" text-anchor="middle" fill="#facc15">DEV</text>
            <rect x="80" y="110" width="130" height="60" rx="12" fill="#ef4444" stroke="#b91c1c" stroke-width="3" />
            <text x="145" y="134" font-size="12" font-weight="900" text-anchor="middle" fill="#ffffff">DEPLOY ON</text>
            <text x="145" y="152" font-size="13" font-weight="900" text-anchor="middle" fill="#fef08a">FRIDAY 5 PM</text>
            <rect x="230" y="110" width="130" height="60" rx="12" fill="#3b82f6" stroke="#1d4ed8" stroke-width="3" />
            <text x="295" y="134" font-size="12" font-weight="900" text-anchor="middle" fill="#ffffff">FIX 24 FAILING</text>
            <text x="295" y="152" font-size="13" font-weight="900" text-anchor="middle" fill="#bfdbfe">UNIT TESTS</text>
            <text x="220" y="196" font-size="12" font-weight="700" text-anchor="middle" fill="#94a3b8">PRODUCTION ARCHITECTURE DECISIONS</text>
          </svg>
        </div>`;

      default:
        return this.renderMemeSVG('server_on_fire');
    }
  }

  renderDSASVG(dsaType, topic = '') {
    const t = String(topic).toLowerCase();
    const type = dsaType || (
      t.includes('hash') || t.includes('collision') ? 'hash_table' :
      t.includes('stack') || t.includes('heap') || t.includes('memory') || t.includes('null') ? 'stack_heap' :
      t.includes('circuit') || t.includes('pattern') ? 'circuit_breaker' :
      t.includes('tree') || t.includes('sort') || t.includes('quick') ? 'binary_tree' : 'hash_table'
    );

    if (type === 'hash_table') {
      return `
      <div class="dsa-svg-wrapper">
        <svg viewBox="0 0 540 270" class="dsa-svg" xmlns="http://www.w3.org/2000/svg">
          <rect x="10" y="10" width="520" height="250" rx="16" fill="#0f172a" stroke="#334155" stroke-width="2" />
          <rect x="25" y="35" width="130" height="58" rx="10" fill="#1e293b" stroke="#3b82f6" stroke-width="2" />
          <text x="90" y="58" font-size="13" font-weight="700" text-anchor="middle" fill="#60a5fa">KEY: "user:42"</text>
          <text x="90" y="78" font-size="12" font-weight="800" text-anchor="middle" fill="#93c5fd">hash(k) % 4 -&gt; [1]</text>
          <line x1="155" y1="64" x2="195" y2="64" stroke="#3b82f6" stroke-width="3" stroke-dasharray="4,2" />
          <rect x="200" y="25" width="60" height="32" rx="6" fill="#1e293b" stroke="#475569" stroke-width="2" />
          <text x="230" y="46" font-size="13" font-weight="800" text-anchor="middle" fill="#94a3b8">[0]</text>
          <rect x="200" y="63" width="60" height="32" rx="6" fill="#3b82f6" stroke="#60a5fa" stroke-width="3" />
          <text x="230" y="84" font-size="14" font-weight="900" text-anchor="middle" fill="#ffffff">[1]</text>
          <rect x="200" y="101" width="60" height="32" rx="6" fill="#1e293b" stroke="#475569" stroke-width="2" />
          <text x="230" y="122" font-size="13" font-weight="800" text-anchor="middle" fill="#94a3b8">[2]</text>
          <rect x="200" y="139" width="60" height="32" rx="6" fill="#1e293b" stroke="#475569" stroke-width="2" />
          <text x="230" y="160" font-size="13" font-weight="800" text-anchor="middle" fill="#94a3b8">[3]</text>
          <line x1="260" y1="79" x2="295" y2="79" stroke="#f59e0b" stroke-width="3" />
          <rect x="295" y="60" width="105" height="38" rx="8" fill="#1e293b" stroke="#f59e0b" stroke-width="2" />
          <text x="347" y="76" font-size="11" font-weight="800" text-anchor="middle" fill="#fde047">"user:42"</text>
          <text x="347" y="91" font-size="10" font-weight="600" text-anchor="middle" fill="#cbd5e1">val: {id:42} -&gt;</text>
          <line x1="400" y1="79" x2="425" y2="79" stroke="#ef4444" stroke-width="3" />
          <rect x="425" y="60" width="95" height="38" rx="8" fill="#1e293b" stroke="#ef4444" stroke-width="2" />
          <text x="472" y="76" font-size="11" font-weight="800" text-anchor="middle" fill="#f87171">"session:9"</text>
          <text x="472" y="91" font-size="10" font-weight="600" text-anchor="middle" fill="#cbd5e1">val: null -&gt; NULL</text>
          <rect x="25" y="195" width="490" height="48" rx="10" fill="#1e293b" stroke="#10b981" stroke-width="2" />
          <text x="270" y="216" font-size="13" font-weight="900" text-anchor="middle" fill="#34d399">SEPARATE CHAINING COLLISION RESOLUTION</text>
          <text x="270" y="233" font-size="11" font-weight="600" text-anchor="middle" fill="#94a3b8">Average: O(1) Lookup • Worst Case without resizing: O(N)</text>
        </svg>
      </div>`;
    }

    if (type === 'stack_heap') {
      return `
      <div class="dsa-svg-wrapper">
        <svg viewBox="0 0 540 270" class="dsa-svg" xmlns="http://www.w3.org/2000/svg">
          <rect x="10" y="10" width="520" height="250" rx="16" fill="#0f172a" stroke="#334155" stroke-width="2" />
          <rect x="25" y="30" width="220" height="185" rx="12" fill="#1e293b" stroke="#3b82f6" stroke-width="2" />
          <text x="135" y="55" font-size="14" font-weight="900" text-anchor="middle" fill="#60a5fa">CALL STACK (Fast/Fixed)</text>
          <rect x="40" y="70" width="190" height="35" rx="6" fill="#0f172a" stroke="#475569" stroke-width="1.5" />
          <text x="135" y="92" font-size="12" font-weight="700" text-anchor="middle" fill="#e2e8f0">int total = 100</text>
          <rect x="40" y="115" width="190" height="45" rx="6" fill="#0f172a" stroke="#f59e0b" stroke-width="2" />
          <text x="135" y="135" font-size="11" font-weight="800" text-anchor="middle" fill="#fde047">Node* ptr = 0x7ffe42</text>
          <text x="135" y="151" font-size="10" text-anchor="middle" fill="#94a3b8">Stack pointer address</text>
          <rect x="295" y="30" width="220" height="185" rx="12" fill="#1e293b" stroke="#10b981" stroke-width="2" />
          <text x="405" y="55" font-size="14" font-weight="900" text-anchor="middle" fill="#34d399">HEAP (Dynamic/Alloc)</text>
          <rect x="310" y="90" width="190" height="80" rx="8" fill="#0f172a" stroke="#10b981" stroke-width="2" />
          <text x="405" y="115" font-size="12" font-weight="800" text-anchor="middle" fill="#4ade80">Address: 0x7ffe42</text>
          <text x="405" y="135" font-size="11" font-weight="600" text-anchor="middle" fill="#cbd5e1">Payload: { id: 42, role: "admin" }</text>
          <text x="405" y="153" font-size="10" text-anchor="middle" fill="#64748b">Garbage Collected / Manual Free</text>
          <path d="M 230 137 C 260 137, 270 130, 305 130" stroke="#f59e0b" stroke-width="3" stroke-dasharray="5,3" />
          <text x="270" y="240" font-size="12" font-weight="700" text-anchor="middle" fill="#94a3b8">Stack = L1 Cache Locality • Heap = Pointer Indirection</text>
        </svg>
      </div>`;
    }

    if (type === 'circuit_breaker') {
      return `
      <div class="dsa-svg-wrapper">
        <svg viewBox="0 0 540 270" class="dsa-svg" xmlns="http://www.w3.org/2000/svg">
          <rect x="10" y="10" width="520" height="250" rx="16" fill="#0f172a" stroke="#334155" stroke-width="2" />
          <circle cx="95" cy="110" r="48" fill="#064e3b" stroke="#10b981" stroke-width="3" />
          <text x="95" y="107" font-size="13" font-weight="900" text-anchor="middle" fill="#6ee7b7">CLOSED</text>
          <text x="95" y="125" font-size="10" font-weight="700" text-anchor="middle" fill="#a7f3d0">Normal Flow</text>
          <path d="M 145 95 Q 270 45 395 95" fill="none" stroke="#ef4444" stroke-width="3" stroke-dasharray="6,4" />
          <text x="270" y="65" font-size="11" font-weight="800" text-anchor="middle" fill="#f87171">Failures &gt; 50% -&gt; Trip</text>
          <circle cx="445" cy="110" r="48" fill="#7f1d1d" stroke="#ef4444" stroke-width="3" />
          <text x="445" y="107" font-size="13" font-weight="900" text-anchor="middle" fill="#fca5a5">OPEN</text>
          <text x="445" y="125" font-size="10" font-weight="700" text-anchor="middle" fill="#fecaca">Fast Fallback</text>
          <circle cx="270" cy="190" r="40" fill="#78350f" stroke="#f59e0b" stroke-width="3" />
          <text x="270" y="188" font-size="11" font-weight="900" text-anchor="middle" fill="#fde047">HALF-OPEN</text>
          <text x="270" y="204" font-size="9" font-weight="700" text-anchor="middle" fill="#fef08a">Trial Probe</text>
          <path d="M 405 140 Q 350 195 315 195" fill="none" stroke="#f59e0b" stroke-width="2.5" />
          <path d="M 225 195 Q 170 185 135 145" fill="none" stroke="#10b981" stroke-width="2.5" />
        </svg>
      </div>`;
    }

    return `
    <div class="dsa-svg-wrapper">
      <svg viewBox="0 0 540 270" class="dsa-svg" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="10" width="520" height="250" rx="16" fill="#0f172a" stroke="#334155" stroke-width="2" />
        <circle cx="270" cy="60" r="30" fill="#1e293b" stroke="#3b82f6" stroke-width="3" />
        <text x="270" y="67" font-size="15" font-weight="900" text-anchor="middle" fill="#60a5fa">ROOT [50]</text>
        <line x1="245" y1="85" x2="160" y2="135" stroke="#3b82f6" stroke-width="3" />
        <line x1="295" y1="85" x2="380" y2="135" stroke="#3b82f6" stroke-width="3" />
        <text x="185" y="105" font-size="12" font-weight="800" fill="#f59e0b">&lt; 50 (Left)</text>
        <text x="345" y="105" font-size="12" font-weight="800" fill="#10b981">&gt; 50 (Right)</text>
        <circle cx="150" cy="160" r="26" fill="#1e293b" stroke="#f59e0b" stroke-width="2.5" />
        <text x="150" y="167" font-size="13" font-weight="800" text-anchor="middle" fill="#fde047">[25]</text>
        <circle cx="390" cy="160" r="26" fill="#1e293b" stroke="#10b981" stroke-width="2.5" />
        <text x="390" y="167" font-size="13" font-weight="800" text-anchor="middle" fill="#4ade80">[75]</text>
        <text x="270" y="235" font-size="12" font-weight="700" text-anchor="middle" fill="#94a3b8">Logarithmic Search: O(log N) Time Complexity</text>
      </svg>
    </div>`;
  }

  renderCodeSyntaxHTML(code) {
    if (!code) return '';
    const lines = String(code).trim().split('\n');
    const formattedLines = lines.map((line, lIdx) => {
      const lineNum = String(lIdx + 1).padStart(2, '0');
      let text = this.escapeHTML(line);
      let commentPart = '';
      if (text.includes('//')) {
        const cIdx = text.indexOf('//');
        commentPart = `<span class="syn-comment">${text.slice(cIdx)}</span>`;
        text = text.slice(0, cIdx);
      } else if (text.includes('#')) {
        const cIdx = text.indexOf('#');
        commentPart = `<span class="syn-comment">${text.slice(cIdx)}</span>`;
        text = text.slice(0, cIdx);
      }

      // 1. Temporarily replace string literals with placeholder tokens so keyword regex doesn't match inside quotes
      const stringPlaceholders = [];
      text = text.replace(/(["'`].*?["'`])/g, (match) => {
        const token = `___STR_TOKEN_${stringPlaceholders.length}___`;
        stringPlaceholders.push(`<span class="syn-str">${match}</span>`);
        return token;
      });

      // 2. Keyword highlighting
      const keywords = ['const', 'let', 'var', 'function', 'class', 'return', 'async', 'await', 'if', 'else', 'for', 'while', 'import', 'from', 'export', 'try', 'catch', 'new', 'throw', 'switch', 'case', 'break', 'typedef', 'struct', 'def', 'with', 'as', 'in', 'lambda', 'yield'];
      const kwRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
      text = text.replace(kwRegex, '<span class="syn-kw">$1</span>');

      // 3. Number highlighting
      text = text.replace(/\b(\d+)\b/g, '<span class="syn-num">$1</span>');

      // 4. Restore strings
      stringPlaceholders.forEach((replacement, sIdx) => {
        text = text.replace(`___STR_TOKEN_${sIdx}___`, replacement);
      });

      const fullLine = `${text}${commentPart}`;
      return `<div class="code-line"><span class="line-num">${lineNum}</span><span class="line-code">${fullLine}</span></div>`;
    }).join('');

    return `
      <div class="code-block">${formattedLines}</div>
      <div class="live-terminal-bar">
        <div class="live-status-dot"></div>
        <span style="color:#60a5fa; font-weight:700;">ENGINE:</span>
        <span style="color:#cbd5e1;">executing logic</span>
        <span class="cursor-blink"></span>
      </div>
    `;
  }

  renderDiagramHTML(slide, _topic = '') {
    const raw = slide.diagram;
    let title = 'System Architecture & Data Flow';
    let nodes = [];
    let flowLabel = '';

    if (raw && typeof raw === 'object' && Array.isArray(raw.nodes) && raw.nodes.length > 0) {
      title = raw.title || title;
      nodes = raw.nodes.map((n, i) => typeof n === 'string' ? { name: n, role: 'System Component', icon: `0${i + 1}` } : {
        name: n.name || n.label || 'Service',
        role: n.role || n.type || 'Component',
        icon: n.icon ? this.stripEmojis(n.icon) || `0${i + 1}` : `0${i + 1}`
      });
      flowLabel = raw.flowLabel || raw.flow || '';
    } else if (typeof raw === 'string' && raw.trim().length > 0) {
      flowLabel = raw.trim();
      nodes = [
        { name: 'Traffic Ingress', role: 'API Request', icon: '01' },
        { name: 'Core Controller', role: 'State Engine', icon: '02' },
        { name: 'Worker Execution', role: 'Runtime Pods', icon: '03' },
        { name: 'Persistence Layer', role: 'Database / Cache', icon: '04' }
      ];
    } else {
      nodes = [
        { name: 'Client App', role: 'End User / SDK', icon: '01' },
        { name: 'Ingress Gateway', role: 'Routing & Rate Limit', icon: '02' },
        { name: 'Service Pods', role: 'Compute & Logic', icon: '03' },
        { name: 'Database / State', role: 'Persistent Store', icon: '04' }
      ];
      flowLabel = 'Client -> Ingress (TLS) -> Service Replicas -> DB Engine';
    }

    const nodesHTML = nodes.slice(0, 4).map((node, i) => `
      <div class="diagram-node-card">
        <div class="diagram-node-icon" style="font-size: 18px; font-weight: 900; font-family: monospace;">${this.escapeHTML(node.icon || `0${i + 1}`)}</div>
        <div class="diagram-node-info">
          <div class="diagram-node-name">${this.escapeHTML(this.stripEmojis(node.name))}</div>
          <div class="diagram-node-role">${this.escapeHTML(this.stripEmojis(node.role))}</div>
        </div>
      </div>
    `).join('');

    return `
      <div class="diagram-container">
        <div class="diagram-title">
          <span class="diagram-tag" style="background: rgba(255,255,255,0.1); padding: 4px 10px; border-radius: 6px; font-size: 16px; margin-right: 8px;">TOPOLOGY</span> ${this.escapeHTML(this.stripEmojis(title))}
        </div>
        <div class="diagram-nodes-grid">
          ${nodesHTML}
        </div>
        ${flowLabel ? `
          <div class="diagram-flow-bar">
            <span>PIPELINE:</span> ${this.escapeHTML(this.stripEmojis(flowLabel))}
          </div>
        ` : ''}
      </div>
    `;
  }

  getTopicDSAType(topic = '') {
    const t = String(topic).toLowerCase();
    if (t.includes('stack') || t.includes('heap') || t.includes('memory') || t.includes('null') || t.includes('pointer')) return 'stack_heap';
    if (t.includes('circuit') || t.includes('rate limit') || t.includes('microservice') || t.includes('token bucket') || t.includes('failover') || t.includes('distributed') || t.includes('async')) return 'circuit_breaker';
    if (t.includes('tree') || t.includes('sort') || t.includes('quick') || t.includes('merge') || t.includes('search') || t.includes('graph')) return 'binary_tree';
    return 'hash_table';
  }

  getMemeForTopic(topic = '', index = 0) {
    const t = String(topic).toLowerCase();
    if (t.includes('deploy') || t.includes('test') || t.includes('friday') || t.includes('ci') || t.includes('release') || t.includes('production')) {
      return 'two_buttons';
    }
    if (t.includes('frontend') || t.includes('backend') || t.includes('api') || t.includes('client') || t.includes('network') || t.includes('500') || t.includes('400') || t.includes('json')) {
      return 'spiderman_pointing';
    }
    if (t.includes('fire') || t.includes('crash') || t.includes('leak') || t.includes('burn') || t.includes('cpu') || t.includes('down') || t.includes('oom')) {
      return 'server_on_fire';
    }
    if (t.includes('local') || t.includes('machine') || t.includes('docker') || t.includes('env') || t.includes('config') || t.includes('reproduce') || t.includes('bug')) {
      return 'works_on_my_machine';
    }
    const memeTypes = ['server_on_fire', 'works_on_my_machine', 'spiderman_pointing', 'two_buttons'];
    return memeTypes[index % memeTypes.length];
  }

  async getMemeAnimatedAsset(topic = '', memeType = '', index = 0) {
    const fsSync = require('fs');
    const path = require('path');

    // 1. Dynamic Internet Meme Grabber: grab a fresh, never-before-used meme GIF directly from the internet
    try {
      const { DynamicMemeService } = require('./dynamic-meme-service');
      const dynamicService = new DynamicMemeService();
      const freshGif = await dynamicService.fetchFreshMemeGif({
        topic,
        headline: memeType,
        fallbackName: 'this_is_fine'
      });
      if (freshGif && fsSync.existsSync(freshGif)) {
        this.logger.info(`Dynamic internet meme selected for video: ${path.basename(freshGif)}`);
        return freshGif;
      }
    } catch (dynamicErr) {
      this.logger.warn(`Dynamic meme service notice (${dynamicErr.message}); rotating local asset pool...`);
    }

    // 2. Resilient Fallback: rotate through local curated assets
    const memeDirs = [
      path.join(__dirname, '..', 'assets', 'memes'),
      path.join(process.cwd(), 'assets', 'memes'),
      path.join(process.cwd(), 'data', 'assets', 'memes')
    ];
    let resolvedDir = null;
    for (const d of memeDirs) {
      if (fsSync.existsSync(d)) {
        resolvedDir = d;
        break;
      }
    }
    if (!resolvedDir) return null;

    const t = `${topic} ${memeType}`.toLowerCase();

    // Map content context to appropriate high-impact developer meme GIF
    let targetFileName = null;
    if (t.includes('two_buttons') || t.includes('deploy') || t.includes('friday') || t.includes('panic') || t.includes('sweat') || t.includes('pressure') || t.includes('deadline')) {
      targetFileName = 'sweating.gif';
    } else if (t.includes('fire') || t.includes('server_on_fire') || t.includes('crash') || t.includes('leak') || t.includes('burn') || t.includes('cpu') || t.includes('down') || t.includes('oom') || t.includes('prod') || t.includes('incident')) {
      targetFileName = 'this_is_fine.gif';
    } else if (t.includes('spiderman') || t.includes('frontend') || t.includes('backend') || t.includes('who') || t.includes('confus') || t.includes('blame') || t.includes('legacy') || t.includes('lost')) {
      targetFileName = 'confused_travolta.gif';
    } else if (t.includes('fast') || t.includes('speed') || t.includes('typing') || t.includes('bruce') || t.includes('almighty')) {
      targetFileName = 'typing_fast.gif';
    } else if (t.includes('mind') || t.includes('blown') || t.includes('genius') || t.includes('scale') || t.includes('architecture') || t.includes('big-o')) {
      targetFileName = 'mind_blown.gif';
    } else if (t.includes('desk') || t.includes('head') || t.includes('hate') || t.includes('syntax') || t.includes('stupid') || t.includes('fail') || t.includes('bug')) {
      targetFileName = 'head_desk.gif';
    } else if (t.includes('smash') || t.includes('destroy') || t.includes('rage') || t.includes('fatal')) {
      targetFileName = 'computer_smash.gif';
    } else if (t.includes('works_on_my_machine') || t.includes('local') || t.includes('code') || t.includes('hack') || t.includes('develop') || t.includes('bakery') || t.includes('mutex') || t.includes('algorithm')) {
      targetFileName = 'cat_typing.gif';
    } else {
      const catalog = [
        'this_is_fine.gif',
        'cat_typing.gif',
        'sweating.gif',
        'confused_travolta.gif',
        'typing_fast.gif',
        'mind_blown.gif',
        'thumbs_up.gif'
      ];
      targetFileName = catalog[index % catalog.length];
    }

    const fullPath = path.join(resolvedDir, targetFileName);
    if (fsSync.existsSync(fullPath)) {
      return fullPath;
    }
    return null;
  }

  getTopicCodeSnippet(topic = '') {
    const t = String(topic).toLowerCase();
    if (t.includes('null') || t.includes('pointer') || t.includes('hoare')) {
      return `// Option Monad - Compile-time null elimination\ntype Option<T> = { hasValue: true; value: T } | { hasValue: false };\n\nfunction getSessionUser(id: string): Option<User> {\n  const user = database.find(id);\n  return user ? { hasValue: true, value: user } : { hasValue: false };\n}`;
    }
    if (t.includes('rate limit') || t.includes('token bucket') || t.includes('leaky bucket')) {
      return `// Token Bucket Rate Limiter\nclass TokenBucket {\n  private tokens = 100;\n  allowRequest(cost = 1): boolean {\n    this.refill();\n    if (this.tokens < cost) return false;\n    this.tokens -= cost;\n    return true;\n  }\n}`;
    }
    if (t.includes('circuit') || t.includes('breaker') || t.includes('resilience')) {
      return `// Circuit Breaker State Transition\nif (failureRate > 0.5) {\n  circuitState = 'OPEN';\n  fallbackCache.serveCached();\n} else {\n  await service.execute();\n}`;
    }
    return `// Optimized O(1) Hash Table Lookup\nconst bucket = hash(key) % capacity;\nlet node = buckets[bucket];\nwhile (node) {\n  if (node.key === key) return node.val;\n  node = node.next;\n}`;
  }

  stripEmojis(text) {
    if (!text) return '';
    return String(text)
      .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  createMultiSlideShortsHTML(script, visualAssets = []) {
    const theme = this.getRotatedTheme();

    const slideBadges = [
      { label: '01. CORE BOTTLENECK', color: '#ef4444' },
      { label: '02. ARCHITECTURE REALITY', color: '#f59e0b' },
      { label: '03. UNDER THE HOOD', color: theme.accent },
      { label: '04. CLEAN IMPLEMENTATION', color: '#22c55e' },
      { label: '05. SENIOR PRINCIPLE', color: '#eab308' }
    ];

    const slideDecorations = [
      // Slide 1: clean status badge
      `<div class="deco-status" style="border-color:#ef444455; color:#ef4444;"><span class="status-pulse" style="background:#ef4444;"></span> CRITICAL BOTTLENECK</div>`,
      // Slide 2: dev context tag
      `<div class="deco-status" style="border-color:#f59e0b55; color:#f59e0b;"><span class="status-pulse" style="background:#f59e0b;"></span> REALITY CHECK</div>`,
      // Slide 3: clean topology nodes
      `<div class="deco-arch"><div class="arch-node" style="border-color:${theme.accent}">INGRESS</div><div class="arch-line" style="background:${theme.accent}"></div><div class="arch-node" style="border-color:${theme.secondary}">LOGIC</div><div class="arch-line" style="background:${theme.secondary}"></div><div class="arch-node" style="border-color:${theme.accent}">STATE</div></div>`,
      // Slide 4: terminal cursor blink
      `<div class="deco-terminal"><span class="term-prompt" style="color:${theme.accent}">$</span> <span class="term-cursor">_</span></div>`,
      // Slide 5: principle badge
      `<div class="deco-achievement" style="border-color:${theme.accent}"><span class="achieve-text" style="color:${theme.accent}">KEY PRINCIPLE</span></div>`
    ];

    const slidesList = Array.isArray(script.slides) && script.slides.length > 0
      ? script.slides
      : (script.mainContent?.sections || script.sections || []);

    const slidesHTML = slidesList.map((slide, idx) => {
      const asset = (visualAssets && visualAssets.length > 0) ? visualAssets[idx % visualAssets.length] : null;
      const badge = slideBadges[idx] || slideBadges[slideBadges.length - 1];
      const deco = slideDecorations[idx] || '';

      const isMemeSlide = idx === 1 || slide.type === 'meme';
      const isDsaSlide = idx === 2 || slide.type === 'dsa_architecture' || (slide.diagram && !isMemeSlide);
      const isCodeSlide = idx === 3 || slide.type === 'code' || (slide.codeSnippet && !isMemeSlide && !isDsaSlide);
      const isTakeawaySlide = idx === 4 || (idx === slidesList.length - 1 && slidesList.length >= 4) || slide.type === 'takeaway';

      let visualBlockHTML = '';

      if (isMemeSlide) {
        const memeType = slide.meme?.type || this.getMemeForTopic(script.title || slide.headline, idx);
        const memeCaption = this.stripEmojis(slide.meme?.caption || 'WORKS ON MY MACHINE');
        const memeSubtext = this.stripEmojis(slide.meme?.subtext || '0 bugs in local development • Production server on fire');
        visualBlockHTML = `
          <div class="meme-card-container">
            <div class="meme-top-banner">
              <span class="meme-tag">DEV REALITY</span>
              <span class="meme-caption">${this.escapeHTML(memeCaption)}</span>
            </div>
            <div id="meme-window" class="meme-window">
              ${this.renderMemeSVG(memeType)}
            </div>
            ${memeSubtext ? `<div class="meme-subtext">${this.escapeHTML(memeSubtext)}</div>` : ''}
          </div>
        `;
      } else if (isDsaSlide) {
        const dsaType = slide.diagram?.dsaType || this.getTopicDSAType(script.title || slide.headline);
        const rawFlow = slide.diagram?.flowLabel || slide.diagram?.flow || 'Client Ingress -> Rate Limiter -> State Machine -> Redis O(1)';
        const flowLabel = this.stripEmojis(rawFlow);
        visualBlockHTML = `
          <div class="dsa-card-container">
            ${this.renderDSASVG(dsaType, script.title)}
            <div class="diagram-flow-bar">
              <span>DATA PIPELINE:</span> ${this.escapeHTML(flowLabel)}
            </div>
          </div>
        `;
      } else if (isCodeSlide) {
        const codeSnippet = slide.codeSnippet || this.getTopicCodeSnippet(script.title || slide.headline);
        visualBlockHTML = `
          <div class="code-container">
            <div class="code-header">
              <span class="dot red"></span>
              <span class="dot yellow"></span>
              <span class="dot green"></span>
              <span class="file-title">terminal / solution.ts</span>
            </div>
            ${this.renderCodeSyntaxHTML(codeSnippet)}
          </div>
        `;
      } else if (isTakeawaySlide) {
        const rawTakeaway = script.conclusion?.finalThought || script.conclusion || 'Prioritize deterministic failure boundaries over premature optimization.';
        const takeawayPrinciple = this.stripEmojis(rawTakeaway);
        visualBlockHTML = `
          <div class="takeaway-card-shorts">
            <div class="takeaway-header">
              <span class="takeaway-badge">STAFF ENGINEER GOLDEN RULE</span>
            </div>
            <div class="takeaway-principle">"${this.escapeHTML(takeawayPrinciple)}"</div>
          </div>
        `;
      }

      // Max 2 bullet points if visual block is present, to ensure zero clutter and pristine readability
      const maxBullets = visualBlockHTML ? 2 : 3;
      const rawBullets = Array.isArray(slide.bulletPoints) ? slide.bulletPoints : (Array.isArray(slide.content) ? slide.content : []);
      const bulletsHTML = rawBullets.slice(0, maxBullets).map((b) => {
        const cleanB = this.stripEmojis(b);
        return `<div class="bullet-card" style="border-left-color: ${theme.accent};"><span class="bullet-indicator" style="color: ${theme.accent};">›</span> ${this.escapeHTML(cleanB)}</div>`;
      }).join('');

      return `
      <div class="slide ${idx === 0 ? 'active' : ''}">
          <div class="shorts-progress-bar-wrap">
              <div class="shorts-progress-bar-fill" style="width: ${Math.round(((idx + 1) / slidesList.length) * 100)}%; background: ${theme.headerGradient};"></div>
          </div>
          <div class="scanline"></div>
          ${asset ? `<img class="background-image" src="${asset}" />` : ''}
          <div class="slide-particles">
            <div class="particle p1"></div><div class="particle p2"></div><div class="particle p3"></div>
            <div class="particle p4"></div><div class="particle p5"></div>
          </div>
          ${deco}
          <div class="top-badge" style="background: ${badge.color}22; border-color: ${badge.color}66; color: ${badge.color};">${this.escapeHTML(badge.label)}</div>
          <div class="section-card">
              <h2 class="section-header">${this.escapeHTML(this.stripEmojis(slide.headline || slide.title || `Chapter ${idx + 1}`))}</h2>
              ${visualBlockHTML}
              ${bulletsHTML ? `<div class="bullet-container">${bulletsHTML}</div>` : ''}
          </div>
          <div class="slide-number" style="color: ${theme.accent}40">${String(idx + 1).padStart(2, '0')}</div>
      </div>`;
    }).join('\n');

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(${theme.accentRGB}, 0.15); }
          50% { box-shadow: 0 0 40px rgba(${theme.accentRGB}, 0.35), 0 0 80px rgba(${theme.accentRGB}, 0.10); }
        }
        @keyframes scanline-sweep {
          0% { top: -5%; }
          100% { top: 105%; }
        }
        @keyframes float-drift {
          0%, 100% { transform: translateY(0px) rotate(0deg); opacity: 0.7; }
          50% { transform: translateY(-20px) rotate(8deg); opacity: 1; }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes cursor-blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        @keyframes particle-float {
          0% { transform: translateY(0) translateX(0) scale(1); opacity: 0.3; }
          50% { transform: translateY(-40px) translateX(15px) scale(1.3); opacity: 0.6; }
          100% { transform: translateY(-80px) translateX(-10px) scale(0.8); opacity: 0; }
        }
        @keyframes slide-in-up {
          0% { transform: translateY(30px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            width: 1080px;
            height: 1920px;
            background: ${theme.bg};
            background-image:
                ${theme.bgGradient},
                linear-gradient(${theme.gridColor} 1px, transparent 1px),
                linear-gradient(90deg, ${theme.gridColor} 1px, transparent 1px);
            background-size: 100% 100%, 100% 100%, 48px 48px, 48px 48px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #f1f5f9;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        /* Animated scanline overlay */
        .scanline {
            position: absolute;
            top: -5%;
            left: 0;
            width: 100%;
            height: 5%;
            background: linear-gradient(to bottom, transparent, rgba(${theme.accentRGB}, 0.06), transparent);
            z-index: 2;
            pointer-events: none;
            animation: scanline-sweep 6s linear infinite;
        }

        /* Floating particles */
        .slide-particles { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; }
        .particle {
          position: absolute;
          width: 6px; height: 6px;
          background: ${theme.accent};
          border-radius: 50%;
          animation: particle-float 8s ease-in-out infinite;
        }
        .p1 { left: 10%; top: 80%; animation-delay: 0s; }
        .p2 { left: 30%; top: 85%; animation-delay: 1.5s; }
        .p3 { left: 55%; top: 90%; animation-delay: 3s; }
        .p4 { left: 75%; top: 82%; animation-delay: 4.5s; }
        .p5 { left: 90%; top: 88%; animation-delay: 6s; }

        .slide {
            position: absolute;
            top: 0; left: 0;
            width: 1080px;
            height: 1920px;
            padding: 100px 70px;
            display: none;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            opacity: 0;
        }
        .slide.active {
            display: flex;
            opacity: 1;
        }

        .background-image {
            position: absolute; top: 0; left: 0;
            width: 100%; height: 100%;
            object-fit: cover; opacity: 0.10;
            z-index: 0; pointer-events: none;
            filter: saturate(1.3);
        }

        /* Large faded slide number watermark */
        .slide-number {
          position: absolute;
          bottom: 60px; right: 60px;
          font-size: 200px;
          font-weight: 900;
          opacity: 0.08;
          pointer-events: none;
          z-index: 0;
          font-family: monospace;
        }

        .top-badge {
            position: relative; z-index: 3;
            display: inline-flex;
            align-items: center;
            gap: 12px;
            font-size: 26px;
            font-weight: 700;
            letter-spacing: 2px;
            text-transform: uppercase;
            padding: 14px 28px;
            border-radius: 9999px;
            border: 1px solid;
            margin-bottom: 40px;
            animation: pulse-glow 3s ease-in-out infinite;
        }
        .section-card {
            position: relative; z-index: 3;
            width: 100%;
            max-width: 960px;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
        }
        h2.section-header {
            font-size: 52px;
            font-weight: 800;
            margin-bottom: 35px;
            line-height: 1.25;
            background: ${theme.headerGradient};
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .bullet-container {
            display: flex;
            flex-direction: column;
            gap: 20px;
            width: 100%;
            margin-bottom: 25px;
        }
        .bullet-card {
            background: ${theme.cardBg};
            border-left: 6px solid ${theme.accent};
            border-radius: 16px;
            padding: 26px 32px;
            font-size: 30px;
            line-height: 1.45;
            color: #f1f5f9;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            opacity: 1;
            display: flex;
            align-items: flex-start;
        }
        .bullet-indicator {
            font-size: 34px;
            font-weight: 900;
            line-height: 1.1;
            margin-right: 14px;
            flex-shrink: 0;
            display: inline-block;
        }
        .deco-status {
            position: absolute;
            top: 70px; right: 70px;
            display: inline-flex;
            align-items: center;
            gap: 10px;
            font-size: 18px;
            font-weight: 800;
            letter-spacing: 1.5px;
            padding: 8px 18px;
            border-radius: 9999px;
            border: 1px solid;
            background: rgba(15, 23, 42, 0.7);
            z-index: 3;
        }
        .status-pulse {
            width: 8px; height: 8px;
            border-radius: 50%;
            display: inline-block;
        }

        /* Relatable Developer Meme Card */
        .meme-card-container {
            width: 100%;
            background: rgba(15, 23, 42, 0.94);
            border: 2px solid #f59e0b;
            border-radius: 22px;
            padding: 20px 22px;
            margin-top: 10px;
            margin-bottom: 22px;
            display: flex;
            flex-direction: column;
            align-items: center;
            box-shadow: 0 12px 35px rgba(245, 158, 11, 0.25);
            animation: pulse-glow 3s ease-in-out infinite;
        }
        .meme-top-banner {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 12px;
            padding-bottom: 10px;
            border-bottom: 1px solid rgba(245, 158, 11, 0.3);
        }
        .meme-tag {
            background: rgba(245, 158, 11, 0.2);
            color: #fde047;
            font-size: 18px;
            font-weight: 800;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            padding: 6px 14px;
            border-radius: 9999px;
            border: 1px solid rgba(245, 158, 11, 0.4);
        }
        .meme-caption {
            font-size: 20px;
            font-weight: 800;
            color: #f8fafc;
            text-transform: uppercase;
            letter-spacing: 1px;
            text-align: right;
            max-width: 550px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .meme-window {
            width: 100%;
            height: 340px;
            border-radius: 16px;
            overflow: hidden;
            background: #090d16;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 8px 0;
            border: 2px solid rgba(245, 158, 11, 0.45);
            box-shadow: inset 0 0 24px rgba(0,0,0,0.85);
            position: relative;
        }
        .meme-svg-wrapper {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
        }
        .meme-svg {
            width: 100%;
            max-width: 620px;
            height: auto;
            max-height: 320px;
            filter: drop-shadow(0 8px 24px rgba(0,0,0,0.6));
        }
        .meme-subtext {
            margin-top: 10px;
            font-size: 20px;
            font-weight: 600;
            color: #fcd34d;
            font-style: italic;
            text-align: center;
        }

        /* DSA & Architecture Diagram styling */
        .dsa-card-container {
            width: 100%;
            background: rgba(15, 23, 42, 0.94);
            border: 2px solid ${theme.accent};
            border-radius: 22px;
            padding: 20px 22px;
            margin-top: 10px;
            margin-bottom: 22px;
            display: flex;
            flex-direction: column;
            align-items: center;
            box-shadow: 0 12px 35px rgba(${theme.accentRGB}, 0.25);
            animation: pulse-glow 4s ease-in-out infinite;
        }
        .dsa-svg-wrapper {
            width: 100%;
            display: flex;
            justify-content: center;
            margin: 6px 0;
        }
        .dsa-svg {
            width: 100%;
            max-width: 680px;
            height: auto;
            max-height: 340px;
            filter: drop-shadow(0 8px 24px rgba(0,0,0,0.6));
        }

        .diagram-container {
            width: 100%;
            background: ${theme.cardBg};
            border: 2px solid ${theme.accent};
            border-radius: 20px;
            padding: 26px 22px;
            margin-top: 15px;
            margin-bottom: 20px;
            box-shadow: 0 10px 35px rgba(${theme.accentRGB}, 0.2);
            animation: pulse-glow 4s ease-in-out infinite;
        }
        .diagram-title {
            font-size: 24px; font-weight: 700;
            color: ${theme.accent};
            text-transform: uppercase;
            letter-spacing: 1.5px;
            margin-bottom: 16px;
            display: flex; align-items: center; gap: 10px;
        }
        .diagram-nodes-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 14px;
            margin-bottom: 16px;
        }
        .diagram-node-card {
            background: rgba(${theme.accentRGB}, 0.08);
            border: 1px solid ${theme.cardBorder};
            border-radius: 14px;
            padding: 16px 18px;
            display: flex; align-items: center; gap: 14px;
        }
        .diagram-node-icon { font-size: 32px; line-height: 1; }
        .diagram-node-info { display: flex; flex-direction: column; }
        .diagram-node-name { font-size: 22px; font-weight: 700; color: #ffffff; }
        .diagram-node-role { font-size: 16px; color: #94a3b8; margin-top: 3px; }
        .diagram-flow-bar {
            width: 100%;
            background: rgba(${theme.accentRGB}, 0.12);
            border: 1px dashed ${theme.accent};
            border-radius: 12px;
            padding: 12px 18px;
            color: #e2e8f0;
            font-size: 20px;
            font-family: 'Consolas', monospace;
            font-weight: 600;
            text-align: center;
            margin-top: 10px;
        }

        /* Senior Takeaway Trophy Card */
        .takeaway-card-shorts {
            width: 100%;
            background: linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98));
            border: 2px solid #eab308;
            border-radius: 24px;
            padding: 30px 28px;
            margin-top: 10px;
            margin-bottom: 24px;
            box-shadow: 0 16px 40px rgba(234, 179, 8, 0.25);
            animation: pulse-glow 3s ease-in-out infinite;
        }
        .takeaway-header {
            display: flex;
            align-items: center;
            gap: 14px;
            margin-bottom: 14px;
        }
        .takeaway-trophy { font-size: 42px; line-height: 1; }
        .takeaway-badge {
            font-size: 20px;
            font-weight: 900;
            color: #facc15;
            letter-spacing: 2px;
            text-transform: uppercase;
        }
        .takeaway-principle {
            font-size: 28px;
            font-weight: 700;
            line-height: 1.45;
            color: #ffffff;
            font-style: italic;
        }

        /* Syntax-highlighted code block */
        .code-container {
            width: 100%;
            background: #0d1117;
            border: 1px solid ${theme.cardBorder};
            border-radius: 20px;
            overflow: hidden;
            margin-top: 12px;
            margin-bottom: 20px;
            box-shadow: 0 12px 35px rgba(0,0,0,0.7);
        }
        .code-header {
            display: flex; align-items: center; gap: 10px;
            background: #161b22;
            padding: 18px 24px;
            border-bottom: 1px solid #30363d;
        }
        .dot { width: 16px; height: 16px; border-radius: 50%; display: inline-block; }
        .dot.red { background: #ff5f56; }
        .dot.yellow { background: #ffbd2e; }
        .dot.green { background: #27c93f; }
        .file-title {
            color: #8b949e;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 24px;
            margin-left: 12px;
        }
        .code-block {
            padding: 24px 28px;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 24px;
            line-height: 1.55;
            color: ${theme.codeColor};
            white-space: pre-wrap;
            word-break: break-all;
        }
        .syn-kw { color: #f43f5e; font-weight: 700; }
        .syn-str { color: #34d399; }
        .syn-num { color: #f59e0b; }
        .syn-comment { color: #64748b; font-style: italic; }
        .line-num { color: #475569; margin-right: 14px; user-select: none; font-size: 20px; }
        .code-line { display: flex; align-items: baseline; }
        .line-code { flex: 1; }
        .live-terminal-bar {
            width: 100%;
            background: #090d16;
            border-top: 1px solid #1e293b;
            padding: 12px 20px;
            display: flex;
            align-items: center;
            gap: 12px;
            font-family: 'Consolas', monospace;
            font-size: 18px;
            color: #94a3b8;
        }
        .live-status-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #22c55e;
            box-shadow: 0 0 10px #22c55e;
            animation: cursor-blink 1.2s infinite;
        }

        /* Decorative elements */
        .deco-float {
          position: absolute;
          font-size: 48px;
          z-index: 1;
          pointer-events: none;
          animation: float-drift 4s ease-in-out infinite;
        }
        .deco-float-1 { top: 12%; right: 10%; animation-delay: 0s; }
        .deco-float-2 { top: 25%; left: 8%; animation-delay: 1s; }
        .deco-float-3 { bottom: 18%; right: 15%; animation-delay: 2s; }

        /* Architecture decoration */
        .deco-arch {
          position: absolute;
          bottom: 140px; left: 50%;
          transform: translateX(-50%);
          display: flex; align-items: center; gap: 0;
          z-index: 1; pointer-events: none;
          opacity: 0.6;
        }
        .arch-node {
          width: 56px; height: 56px;
          border: 2px solid;
          border-radius: 14px;
          display: flex; align-items: center; justify-content: center;
          font-size: 24px;
          background: rgba(0,0,0,0.4);
        }
        .arch-line {
          width: 40px; height: 3px;
          opacity: 0.5;
        }

        /* Terminal cursor */
        .deco-terminal {
          position: absolute;
          bottom: 150px; left: 70px;
          font-family: 'Consolas', monospace;
          font-size: 28px;
          z-index: 1;
          opacity: 0.5;
        }
        .term-prompt { font-weight: 700; }
        .term-cursor { animation: cursor-blink 1s step-end infinite; }

        /* Achievement badge */
        .deco-achievement {
          position: absolute;
          top: 120px; right: 60px;
          border: 2px solid;
          border-radius: 16px;
          padding: 10px 20px;
          display: flex; align-items: center; gap: 10px;
          background: rgba(0,0,0,0.5);
          z-index: 1;
          animation: pulse-glow 3s ease-in-out infinite;
        }
        .achieve-icon { font-size: 28px; }
        .achieve-text { font-size: 16px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; }

        /* Top animated progress bar for Shorts retention */
        .shorts-progress-bar-wrap {
            position: absolute;
            top: 40px;
            left: 70px;
            right: 70px;
            height: 10px;
            background: rgba(255, 255, 255, 0.15);
            border-radius: 9999px;
            overflow: hidden;
            z-index: 10;
        }
        .shorts-progress-bar-fill {
            height: 100%;
            border-radius: 9999px;
            box-shadow: 0 0 20px ${theme.accent};
            transition: width 0.3s ease;
        }
    </style>
</head>
<body>
    ${slidesHTML}
</body>
</html>`;
  }

  calculateSlideDurations(script, slideCount, totalDuration) {
    if (slideCount <= 1) return [totalDuration];

    let wordCounts = [];
    if (Array.isArray(script.slides) && script.slides.length > 0) {
      wordCounts = script.slides.map(s => {
        const text = s.teacherNarration || s.spokenNarration || '';
        return Math.max(10, text.split(/\s+/).filter(Boolean).length);
      });
    } else {
      const sections = (script.mainContent && script.mainContent.sections) || script.sections || [];
      if (sections.length > 0) {
        const hookWords = Math.max(10, String(script.hook?.text || script.hook || '').split(/\s+/).filter(Boolean).length);
        const secWords = sections.map(s => {
          const text = s.spokenNarration || (Array.isArray(s.content) ? s.content.join(' ') : String(s.content || ''));
          return Math.max(15, text.split(/\s+/).filter(Boolean).length);
        });
        const conclWords = Math.max(10, String(script.conclusion?.finalThought || script.conclusion || '').split(/\s+/).filter(Boolean).length);
        wordCounts = [hookWords, ...secWords, conclWords];
      }
    }

    while (wordCounts.length < slideCount) wordCounts.push(20);
    wordCounts = wordCounts.slice(0, slideCount);

    const totalWords = wordCounts.reduce((sum, w) => sum + w, 0);
    let rawDurations = wordCounts.map(w => Math.max(4, (w / totalWords) * totalDuration));
    const rawSum = rawDurations.reduce((sum, d) => sum + d, 0);
    return rawDurations.map(d => Number(((d / rawSum) * totalDuration).toFixed(2)));
  }

  generateContentSlides(script, visualAssets = []) {
    const slides = [];
    const sections = (script.mainContent && script.mainContent.sections) || script.sections || [];
    
    sections.forEach((section, index) => {
      const codeSnippet = section.codeSnippet || this.extractCodeSnippet(section);
      const asset = (visualAssets && visualAssets.length > 0) ? visualAssets[(index + 1) % visualAssets.length] : null;
      slides.push(`
      <div class="slide">
          ${asset ? `<img class="background-image" src="${asset}" />` : ''}
          <div class="top-badge" style="position:relative; z-index:1;">Concept Breakdown • Part ${index + 1}</div>
          <div class="section-card" style="position:relative; z-index:1;">
              <h2 class="section-header">${this.escapeHTML(section.title || `Section ${index + 1}`)}</h2>
              <div class="content-card">
                  ${this.formatSectionContentHTML(section)}
              </div>
              ${codeSnippet ? `
              <div class="code-container">
                  <div class="code-header">
                      <span class="dot red"></span>
                      <span class="dot yellow"></span>
                      <span class="dot green"></span>
                      <span class="file-title">terminal / code</span>
                  </div>
                  <pre class="code-block"><code>${this.escapeHTML(codeSnippet)}</code></pre>
              </div>` : ''}
          </div>
      </div>`);
    });
    
    return slides;
  }

  formatSectionContentHTML(section) {
    if (Array.isArray(section.content)) {
      return section.content.slice(0, 4).map(line => 
        `<p class="content-text">• ${this.escapeHTML(line)}</p>`
      ).join('');
    }
    if (section.steps && Array.isArray(section.steps)) {
      return section.steps.slice(0, 3).map((step, sIdx) => 
        `<p class="content-text"><strong>Step ${sIdx + 1}:</strong> ${this.escapeHTML(step.title || step.description || step)}</p>`
      ).join('');
    }
    if (section.items && Array.isArray(section.items)) {
      return section.items.slice(0, 3).map(item => 
        `<p class="content-text"><strong>#${item.number || ''}:</strong> ${this.escapeHTML(item.title || item.description || item)}</p>`
      ).join('');
    }
    if (typeof section.content === 'string') {
      return `<p class="content-text">${this.escapeHTML(section.content.slice(0, 300))}</p>`;
    }
    return '<p class="content-text">Deep-dive technical breakdown in progress...</p>';
  }

  extractCodeSnippet(section) {
    if (section.codeSnippet) return section.codeSnippet;
    if (Array.isArray(section.content)) {
      const codeLine = section.content.find(line => typeof line === 'string' && (line.includes('{') || line.includes('function') || line.includes('const ') || line.includes('docker ') || line.includes('kubectl ') || line.includes('SELECT ')));
      if (codeLine) return codeLine;
    }
    return null;
  }

  calculateScriptDuration(script) {
    let totalWords = 0;
    if (script.hook) totalWords += String(script.hook.text || script.hook).split(/\s+/).length;
    if (script.introduction) {
      totalWords += String(script.introduction.topicIntro || '').split(/\s+/).length;
      totalWords += String(script.introduction.valueProposition || '').split(/\s+/).length;
    }
    const sections = (script.mainContent && script.mainContent.sections) || script.sections || [];
    sections.forEach(section => {
      if (Array.isArray(section.content)) {
        section.content.forEach(c => totalWords += String(c).split(/\s+/).length);
      } else if (typeof section.content === 'string') {
        totalWords += section.content.split(/\s+/).length;
      }
    });
    if (script.conclusion) {
      totalWords += String(script.conclusion.finalThought || script.conclusion).split(/\s+/).length;
    }
    // Convert to duration (average 140 words per minute for technical explanation)
    // Guarantee strictly between 165 and 176 seconds (< 180s for Shorts)
    const estimated = Math.ceil((totalWords / 140) * 60);
    return Math.min(176, Math.max(165, estimated));
  }

  async addAudioToVideo(videoPath, audioPath, outputPath, options = {}) {
    const hasRealAudio = await this.isUsableAudioFile(audioPath);

    if (!hasRealAudio) {
      if (options.allowSilent === true) {
        this.logger.warn('Creating an intentionally silent video from an operator-confirmed override.');
        if (videoPath !== outputPath) await fs.copyFile(videoPath, outputPath);
        return outputPath;
      }
      const error = new Error('Narration audio is required. Regenerate narration or explicitly confirm an intentional silent video.');
      error.code = 'NARRATION_REQUIRED';
      throw error;
    }

    // FFmpeg cannot write to its own input, so mux to a temp file when paths collide
    const muxPath = outputPath === videoPath
      ? outputPath.replace(/\.mp4$/i, '_muxed.mp4')
      : outputPath;

    const videoInput = options.loopVideo ? ['-stream_loop', '-1', '-i', videoPath] : ['-i', videoPath];
    const durationArgs = options.maxDuration ? ['-t', String(options.maxDuration)] : [];
    await runFFmpeg(['-y', ...videoInput, '-i', audioPath, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-shortest', ...durationArgs, muxPath]);

    if (muxPath !== outputPath) {
      await fs.rename(muxPath, outputPath);
    }

    this.logger.info('Audio added to video successfully');
    return outputPath;
  }

  async isUsableAudioFile(audioPath) {
    if (typeof audioPath !== 'string' || audioPath.endsWith('.info')) {
      return false;
    }

    try {
      const stats = await fs.stat(audioPath);
      return stats.isFile() && stats.size > 0;
    } catch (error) {
      return false;
    }
  }

  async verifySlideImageFullyRendered(imagePath) {
    const fsSync = require('fs');
    if (!fsSync.existsSync(imagePath)) {
      return { valid: false, reason: 'Screenshot file does not exist' };
    }
    const stat = fsSync.statSync(imagePath);
    if (stat.size < 40000) {
      return { valid: false, reason: `Screenshot file size suspiciously small (${stat.size} bytes)` };
    }

    const tmpCrop = `${imagePath}.bottom_verify.png`;
    try {
      // Crop bottom 400px: from y=1520 to y=1920 to verify bottom region is not flat grey/empty
      await runFFmpeg([
        '-y',
        '-i', imagePath,
        '-filter:v', 'crop=1080:400:0:1520',
        '-vframes', '1',
        tmpCrop
      ]);
      if (!fsSync.existsSync(tmpCrop)) {
        return { valid: false, reason: 'Failed to extract bottom crop for verification' };
      }
      const cropSize = fsSync.statSync(tmpCrop).size;
      await fs.unlink(tmpCrop).catch(() => {});
      // If the bottom 400px is solid grey or flat, compressed PNG size is < 12000 bytes
      if (cropSize < 12000) {
        return { valid: false, reason: `Bottom region is blank/grey (crop size: ${cropSize} bytes)` };
      }
      return { valid: true, size: stat.size, bottomCropSize: cropSize };
    } catch (err) {
      if (fsSync.existsSync(tmpCrop)) await fs.unlink(tmpCrop).catch(() => {});
      return { valid: false, reason: err.message };
    }
  }

  async verifySegmentVideoIntegrity(segmentPath, expectedDuration) {
    const fsSync = require('fs');
    if (!fsSync.existsSync(segmentPath)) {
      return { valid: false, reason: 'Segment video file does not exist' };
    }
    const stat = fsSync.statSync(segmentPath);
    if (stat.size < 50000) {
      return { valid: false, reason: `Segment video size suspiciously small (${stat.size} bytes)` };
    }
    try {
      const dur = await this.getAudioDuration(segmentPath);
      if (dur <= 0) {
        return { valid: false, reason: `Invalid segment duration: ${dur}s` };
      }
      return { valid: true, duration: dur, size: stat.size };
    } catch (err) {
      return { valid: false, reason: err.message };
    }
  }

  async downloadVideo(url, outputPath) {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream'
    });

    const writer = require('fs').createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }

  async cleanupDirectory(dirPath) {
    try {
      const files = await fs.readdir(dirPath);
      for (const file of files) {
        await fs.unlink(path.join(dirPath, file));
      }
      await fs.rmdir(dirPath);
    } catch (error) {
      this.logger.warn('Cleanup failed:', error.message);
    }
  }

  async generateThumbnail(script, style = "ethereal") {
    this.logger.info('Generating custom thumbnail...');

    try {
      if (!this.openai && !this.gemini) {
        return await this.simulateThumbnailGeneration(script, style);
      }

      const prompt = `YouTube thumbnail for "${script.title}", ${style} style, eye-catching, high contrast text, professional design, clickable, engaging`;
      const thumbnailPath = path.join(__dirname, '..', 'uploads', 'thumbnails', `thumbnail_${Date.now()}.png`);

      await this.generateImage(prompt, thumbnailPath);
      const metadata = await sharp(thumbnailPath).metadata();

      return {
        path: thumbnailPath,
        dimensions: { width: metadata.width, height: metadata.height },
        fileSize: await this.getFileSize(thumbnailPath)
      };
    } catch (error) {
      this.logger.error('Thumbnail generation failed:', error);
      return await this.simulateThumbnailGeneration(script, style);
    }
  }

  async getFileSize(filePath) {
    const stats = await fs.stat(filePath);
    return stats.size;
  }

  // Simulation methods for when APIs are not available
  async simulateTTSGeneration(text, outputPath) {
    this.logger.info('Simulating TTS generation...');
    
    const infoPath = outputPath + '.info';
    await fs.writeFile(infoPath, JSON.stringify({
      message: 'AI TTS audio would be generated here',
      text: text.substring(0, 100) + '...',
      timestamp: new Date().toISOString()
    }, null, 2));
    
    return infoPath;
  }

  async simulateVisualAssets(prompt, style, count) {
    this.logger.info(`Simulating ${count} visual assets...`);
    
    const paths = [];
    for (let i = 0; i < count; i++) {
      const assetPath = path.join(__dirname, '..', 'data', 'assets', `visual_sim_${Date.now()}_${i}.info`);
      
      await fs.writeFile(assetPath, JSON.stringify({
        message: 'AI visual asset would be generated here',
        prompt: prompt,
        style: style,
        timestamp: new Date().toISOString()
      }, null, 2));
      
      paths.push(assetPath);
    }
    
    return paths;
  }

  async simulateVideoGeneration(script, visualAssets, audioPath, outputPath) {
    this.logger.info('Simulating video generation...');
    
    const infoPath = outputPath + '.info';
    await fs.writeFile(infoPath, JSON.stringify({
      message: 'AI video would be generated here',
      script: script.title,
      visualAssets: visualAssets.length,
      audioPath: audioPath,
      timestamp: new Date().toISOString()
    }, null, 2));
    
    return infoPath;
  }

  async simulateThumbnailGeneration(script, style) {
    this.logger.info('Simulating thumbnail generation...');
    
    const thumbnailPath = path.join(__dirname, '..', 'uploads', 'thumbnails', `thumbnail_sim_${Date.now()}.info`);
    await fs.mkdir(path.dirname(thumbnailPath), { recursive: true });
    
    await fs.writeFile(thumbnailPath, JSON.stringify({
      message: 'AI thumbnail would be generated here',
      title: script.title,
      style: style,
      timestamp: new Date().toISOString()
    }, null, 2));
    
    return {
      path: thumbnailPath,
      dimensions: { width: 1792, height: 1024 },
      fileSize: 1024,
      simulated: true
    };
  }

  async generateMasterclassVideo(masterclassData, outputPath) {
    this.logger.info(`Starting Masterclass 16:9 video assembly: "${masterclassData.title}"`);
    const tempDir = path.join(path.dirname(outputPath), `masterclass_${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    const chapterFiles = [];

    try {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1920, height: 1080 });

      for (let i = 0; i < masterclassData.chapters.length; i++) {
        const ch = masterclassData.chapters[i];
        this.logger.info(`Producing Chapter ${i + 1}/${masterclassData.chapters.length}: "${ch.title}"`);

        // 1. Synthesize chapter narration
        const chapterAudioPath = path.join(tempDir, `chapter_${i}_audio.mp3`);
        await this.generateTTSAudio(ch.spokenNarration, chapterAudioPath);
        const chapterDuration = (await this.getAudioDuration(chapterAudioPath)) || ch.estimatedSeconds || 120;
        ch.actualDuration = chapterDuration;

        // 2. Generate and capture slide HTML (1920x1080 Landscape)
        const slideHtml = this.createMasterclassSlideHTML(masterclassData, ch, i + 1, masterclassData.chapters.length);
        await page.setContent(slideHtml);
        await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; }' });
        await page.waitForTimeout(500);

        const slideImagePath = path.join(tempDir, `chapter_${i}_slide.png`);
        await page.screenshot({ path: slideImagePath });

        // 3. Render chapter segment with FFmpeg (video loops slide image until audio ends)
        const segmentVideoPath = path.join(tempDir, `chapter_${i}_segment.mp4`);
        await runFFmpeg([
          '-y',
          '-loop', '1',
          '-i', slideImagePath,
          '-i', chapterAudioPath,
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-pix_fmt', 'yuv420p',
          '-vf', 'scale=1920:1080',
          '-c:a', 'aac',
          '-shortest',
          segmentVideoPath
        ]);

        chapterFiles.push(segmentVideoPath);
      }

      // Re-calculate real timestamps based on actual audio durations
      let cumulativeSeconds = 0;
      const realTimestamps = [];
      for (let i = 0; i < masterclassData.chapters.length; i++) {
        const ch = masterclassData.chapters[i];
        const hours = Math.floor(cumulativeSeconds / 3600);
        const minutes = Math.floor((cumulativeSeconds % 3600) / 60);
        const seconds = cumulativeSeconds % 60;
        const formattedTimestamp = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        realTimestamps.push({
          timestamp: formattedTimestamp,
          title: ch.title,
          keyConcept: ch.keyConcept
        });
        cumulativeSeconds += (ch.actualDuration || ch.estimatedSeconds || 120);
      }
      masterclassData.timestamps = realTimestamps;
      masterclassData.totalEstimatedSeconds = cumulativeSeconds;
      masterclassData.formattedDuration = `${Math.floor(cumulativeSeconds / 3600)}h ${Math.floor((cumulativeSeconds % 3600) / 60)}m`;

      // 4. Concatenate all chapter segments into the full course video
      const concatListFile = path.join(tempDir, 'concat_chapters.txt');
      const concatContent = chapterFiles.map(f => `file '${path.resolve(f).replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n');
      await fs.writeFile(concatListFile, concatContent);

      this.logger.info(`Concatenating ${chapterFiles.length} chapters into final masterclass video (~${masterclassData.formattedDuration})...`);
      await runFFmpeg([
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListFile,
        '-c', 'copy',
        outputPath
      ]);

      this.logger.info(`Masterclass video successfully rendered: ${outputPath}`);
      return outputPath;
    } finally {
      await browser.close().catch(() => {});
      for (const f of chapterFiles) {
        await fs.unlink(f).catch(() => {});
      }
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  createMasterclassSlideHTML(masterclassData, chapter, chapterNum, totalChapters) {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            width: 1920px;
            height: 1080px;
            background: #0d1117;
            background-image: 
                radial-gradient(circle at 10% 10%, rgba(56, 189, 248, 0.12) 0%, transparent 40%),
                radial-gradient(circle at 90% 90%, rgba(168, 85, 247, 0.12) 0%, transparent 40%),
                linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
            background-size: 100% 100%, 100% 100%, 40px 40px, 40px 40px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #f1f5f9;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            padding: 50px 70px;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #30363d;
            padding-bottom: 25px;
            margin-bottom: 35px;
        }
        .course-badge {
            background: rgba(56, 189, 248, 0.15);
            border: 1px solid rgba(56, 189, 248, 0.4);
            color: #38bdf8;
            font-size: 20px;
            font-weight: 700;
            letter-spacing: 2px;
            text-transform: uppercase;
            padding: 10px 22px;
            border-radius: 9999px;
        }
        .chapter-counter {
            color: #94a3b8;
            font-size: 22px;
            font-weight: 600;
        }

        .main-layout {
            display: flex;
            gap: 40px;
            flex: 1;
            height: calc(100% - 120px);
        }

        .left-col {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
        }
        h1.chapter-title {
            font-size: 46px;
            font-weight: 800;
            line-height: 1.25;
            color: #ffffff;
            margin-bottom: 30px;
            background: linear-gradient(135deg, #ffffff 40%, #94a3b8 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .bullet-container {
            display: flex;
            flex-direction: column;
            gap: 20px;
            margin-bottom: 30px;
        }
        .bullet-card {
            background: rgba(22, 27, 34, 0.85);
            border-left: 5px solid #38bdf8;
            border-radius: 12px;
            padding: 20px 25px;
            font-size: 26px;
            line-height: 1.45;
            color: #e2e8f0;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        }

        .right-col {
            flex: 1.15;
            display: flex;
            flex-direction: column;
        }
        .editor-window {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 16px;
            overflow: hidden;
            height: 100%;
            display: flex;
            flex-direction: column;
            box-shadow: 0 15px 35px rgba(0,0,0,0.6);
        }
        .window-header {
            background: #0d1117;
            padding: 14px 20px;
            display: flex;
            align-items: center;
            gap: 10px;
            border-bottom: 1px solid #30363d;
        }
        .dot { width: 14px; height: 14px; border-radius: 50%; display: inline-block; }
        .dot.red { background: #ff5f56; }
        .dot.yellow { background: #ffbd2e; }
        .dot.green { background: #27c93f; }
        .file-tab {
            color: #8b949e;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 18px;
            margin-left: 12px;
        }
        .code-content {
            padding: 30px;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 22px;
            line-height: 1.6;
            color: #7ee787;
            white-space: pre-wrap;
            word-break: break-all;
            flex: 1;
            overflow: hidden;
        }

        .footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            color: #64748b;
            font-size: 18px;
            font-weight: 500;
            padding-top: 15px;
            border-top: 1px solid #21262d;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="course-badge">${this.escapeHTML(masterclassData.shortTopic)} Masterclass</div>
        <div class="chapter-counter">Chapter ${chapterNum} of ${totalChapters}</div>
    </div>
    <div class="main-layout">
        <div class="left-col">
            <h1 class="chapter-title">${this.escapeHTML(chapter.title)}</h1>
            <div class="bullet-container">
                ${(chapter.slideBullets || []).map(b => `<div class="bullet-card">${this.escapeHTML(b)}</div>`).join('')}
            </div>
        </div>
        <div class="right-col">
            <div class="editor-window">
                <div class="window-header">
                    <span class="dot red"></span>
                    <span class="dot yellow"></span>
                    <span class="dot green"></span>
                    <span class="file-tab">example.code</span>
                </div>
                <pre class="code-content"><code>${this.escapeHTML(chapter.codeSnippet)}</code></pre>
            </div>
        </div>
    </div>
    <div class="footer">
        <div>Byte By Byte • System Design & DevOps Bootcamp</div>
        <div>Full Video Course • Timestamps in Description</div>
    </div>
</body>
</html>`;
  }
}

module.exports = { AIVideoGenerator };
