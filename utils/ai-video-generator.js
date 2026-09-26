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
    this.logger.info('Generating TTS audio...');
    this.lastNarrationResult = null;
    let provider = 'simulation';
    let model = null;

    try {
      let generatedPath = null;
      if (this.elevenLabsApiKey && this.elevenLabsVoiceId) {
        try {
          provider = 'elevenlabs';
          model = this.elevenLabsModel;
          generatedPath = await this.generateElevenLabsTTS(text, outputPath);
        } catch (e) {
          this.logger.warn(`ElevenLabs TTS failed: ${e.message}`);
        }
      }
      if (!generatedPath) {
        try {
          provider = 'msedge-neural';
          const { voice: rotatedVoice, gender } = this.getRotatedVoice(options);
          model = rotatedVoice;
          this.logger.info(`Synthesizing narration with ${model} (${gender === 'ladies' ? 'Female/Lady' : 'Male/Gent'} instructor)...`);
          generatedPath = await this.generateMsEdgeTTS(text, outputPath, model);
        } catch (e) {
          this.logger.warn(`MsEdge Neural TTS failed: ${e.message}`);
        }
      }
      if (!generatedPath && this.gemini) {
        try {
          provider = 'gemini';
          model = process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview';
          generatedPath = await this.generateGeminiTTS(text, outputPath);
        } catch (e) {
          this.logger.warn(`Gemini TTS failed: ${e.message}; using universal speech engine`);
        }
      }
      if (!generatedPath) {
        provider = 'free-tts';
        model = 'google-speech';
        generatedPath = await this.generateFreeTTS(text, outputPath);
      }

      const usable = await this.isUsableAudioFile(generatedPath);
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

  getRotatedVoice(options = {}) {
    if (process.env.MSEDGE_TTS_VOICE) {
      return { voice: process.env.MSEDGE_TTS_VOICE, gender: 'custom' };
    }

    const fsSync = require('fs');
    const path = require('path');
    const stateFile = path.join(__dirname, '..', 'data', 'voice_state.json');

    const gentsVoices = [
      'en-US-ChristopherNeural', // Authoritative, warm senior male engineer
      'en-US-GuyNeural',         // Dynamic, conversational male presenter
      'en-US-AndrewNeural',      // Analytical, sharp tech lead
      'en-US-BrianNeural'        // Approachable, engaging male educator
    ];
    const ladiesVoices = [
      'en-US-AriaNeural',        // Clear, professional female tech instructor
      'en-US-JennyNeural',       // Warm, natural conversational female mentor
      'en-US-AvaNeural',         // Crisp, energetic modern female presenter
      'en-US-EmmaNeural'         // Articulate, expressive female teacher
    ];

    let lastGender = 'gents';
    let gentIndex = 0;
    let ladyIndex = 0;

    try {
      if (fsSync.existsSync(stateFile)) {
        const raw = JSON.parse(fsSync.readFileSync(stateFile, 'utf8'));
        lastGender = raw.lastGender || 'gents';
        gentIndex = Number.isInteger(raw.gentIndex) ? raw.gentIndex : 0;
        ladyIndex = Number.isInteger(raw.ladyIndex) ? raw.ladyIndex : 0;
      }
    } catch (_e) {
      // Ignore read error
    }

    // Toggle gender between ladies and gents across different videos
    let nextGender = options.gender || (lastGender === 'gents' ? 'ladies' : 'gents');
    let selectedVoice = '';

    if (nextGender === 'ladies') {
      const idx = ladyIndex % ladiesVoices.length;
      selectedVoice = ladiesVoices[idx];
      ladyIndex = (idx + 1) % ladiesVoices.length;
    } else {
      nextGender = 'gents';
      const idx = gentIndex % gentsVoices.length;
      selectedVoice = gentsVoices[idx];
      gentIndex = (idx + 1) % gentsVoices.length;
    }

    try {
      fsSync.mkdirSync(path.dirname(stateFile), { recursive: true });
      fsSync.writeFileSync(stateFile, JSON.stringify({
        lastGender: nextGender,
        lastVoice: selectedVoice,
        gentIndex,
        ladyIndex,
        updatedAt: new Date().toISOString()
      }, null, 2));
    } catch (_e) {
      // Ignore write error
    }

    return { voice: selectedVoice, gender: nextGender };
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
        headerGradient: 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 50%, #ffffff 100%)',
        emoji: '⚡'
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
        headerGradient: 'linear-gradient(135deg, #10b981 0%, #34d399 50%, #ffffff 100%)',
        emoji: '🌿'
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
        headerGradient: 'linear-gradient(135deg, #c084fc 0%, #a78bfa 50%, #ffffff 100%)',
        emoji: '🔮'
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
        headerGradient: 'linear-gradient(135deg, #f97316 0%, #fb923c 50%, #ffffff 100%)',
        emoji: '🔥'
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
        headerGradient: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 50%, #ffffff 100%)',
        emoji: '💎'
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

    this.logger.info(`Visual theme selected: ${selected.name} (${selected.emoji})`);
    return selected;
  }

  async generateMsEdgeTTS(text, outputPath, voiceName = 'en-US-ChristopherNeural') {
    this.logger.info(`Synthesizing neural voice via MsEdgeTTS (${voiceName})...`);
    const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const cleanText = (text || '').replace(/\s+/g, ' ').trim();
    if (!cleanText) throw new Error('Cannot synthesize empty text');

    const fsSync = require('fs');
    const { audioStream } = tts.toStream(cleanText);
    const out = fsSync.createWriteStream(outputPath);
    audioStream.pipe(out);

    await new Promise((resolve, reject) => {
      out.on('finish', resolve);
      out.on('error', reject);
      audioStream.on('error', reject);
    });

    tts.close();

    if (fsSync.existsSync(outputPath) && fsSync.statSync(outputPath).size > 1000) {
      this.logger.info(`Neural audio generated successfully: ${outputPath} (${(fsSync.statSync(outputPath).size / 1024).toFixed(1)} KB)`);
      return outputPath;
    }
    throw new Error('Generated neural audio file was missing or empty');
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

  async generateOpenAITTS(text, outputPath) {
    const response = await this.openai.audio.speech.create({
      model: process.env.OPENAI_TTS_MODEL || "tts-1",
      voice: "coral",
      input: text,
      speed: 1.0
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(outputPath, buffer);

    this.logger.info('OpenAI TTS generation complete');
    return outputPath;
  }

  async generateGeminiTTS(text, outputPath) {
    const model = process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview';
    const voiceName = process.env.GEMINI_TTS_VOICE || 'Kore';

    const response = await this.gemini.models.generateContent({
      model,
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName }
          }
        }
      }
    });

    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) {
      throw new Error('Gemini TTS returned no audio data');
    }

    // Gemini returns raw PCM (24kHz, mono, 16-bit); encode to the requested container via FFmpeg
    const pcmPath = outputPath + '.pcm';
    await fs.writeFile(pcmPath, Buffer.from(audioData, 'base64'));
    await runFFmpeg(['-y', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', pcmPath, outputPath]);
    await fs.unlink(pcmPath).catch(() => {});

    this.logger.info('Gemini TTS generation complete');
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

      const produced = await this.generateSlideshowVideo(script, visualAssets, audioPath, outputPath);
      this.lastVideoResult = { requestedProvider: 'slideshow', actualProvider: 'slideshow', model: 'local-ffmpeg', mode: 'slideshow', generatedSeconds: 0, tasks: [], scenes: [] };
      return produced;
    } catch (error) {
      // The Logger's console line only shows the message string, so put the real
      // reason inline. Previously the stack alone went to the file transport and
      // the console printed "Video generation failed:" with no detail.
      const reason = error && error.message ? error.message : String(error);
      this.logger.error(`Video provider generation failed; using the local slideshow: ${reason}`, error);
      try {
        const produced = await this.generateSlideshowVideo(script, visualAssets, audioPath, outputPath);
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

  async generateSlideshowVideo(script, visualAssets, audioPath, outputPath) {
    this.logger.info('Creating slideshow video...');

    if (!(await checkFFmpeg())) {
      throw new Error(ffmpegInstallHint());
    }

    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    const slidesDir = path.join(path.dirname(outputPath), 'slides');

    try {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1080, height: 1920 });

      // Create HTML for slideshow
      const imageAssets = await this.filterImageAssets(visualAssets);
      await page.setContent(this.createSlideshowHTML(script, imageAssets));

      // Freeze CSS transitions/animations so each still is captured fully rendered
      await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; }' });
      await page.waitForTimeout(1000); // Wait for assets to load

      // Capture ONE still per slide
      const slideCount = await page.evaluate(() => document.querySelectorAll('.slide').length);
      await fs.mkdir(slidesDir, { recursive: true });

      const stills = [];
      for (let i = 0; i < slideCount; i++) {
        await page.evaluate((index) => {
          document.querySelectorAll('.slide').forEach((slide, s) => {
            slide.classList.toggle('active', s === index);
          });
        }, i);

        const stillPath = path.join(slidesDir, `slide_${String(i).padStart(3, '0')}.png`);
        await page.screenshot({ path: stillPath });
        stills.push(stillPath);
      }

      const videoPath = outputPath.replace('.mp4', '_visual.mp4');
      const audioDuration = await this.getAudioDuration(audioPath, { shortsMode: true });
      const scriptDuration = this.calculateScriptDuration(script);
      let duration = audioDuration > 10 ? audioDuration : scriptDuration;
      // Guarantee strictly between 150s (2m30s) and 175s (<180s) for YouTube Shorts qualification
      if (duration > 175) duration = 175;
      if (duration < 150) duration = 150;

      // Compute exact per-slide duration array based on the narration word count of each slide
      const slideDurations = this.calculateSlideDurations(script, slideCount, duration);
      this.logger.info(`Rendering ${stills.length} slides with synchronized durations: ${slideDurations.join(', ')}s (total: ${duration}s)`);
      await this.renderSlidesToVideo(stills, slideDurations, videoPath);

      // Add audio with strict Shorts cutoff (175s max, strictly < 180s)
      await this.addAudioToVideo(videoPath, audioPath, outputPath, { loopVideo: true, maxDuration: 175 });

      return outputPath;
    } finally {
      await browser.close().catch(() => {});
      await this.cleanupDirectory(slidesDir);
    }
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
    if (!audioPath) return options.shortsMode ? 170 : 0;
    try {
      const { exec } = require('child_process');
      const util = require('util');
      const execPromise = util.promisify(exec);
      const { stdout } = await execPromise(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`);
      const dur = parseFloat(String(stdout).trim());
      if (Number.isFinite(dur) && dur > 0) {
        if (options.shortsMode) {
          return Math.min(176, Math.max(30, Math.ceil(dur)));
        }
        return Math.ceil(dur);
      }
    } catch (_err) {
      // ffprobe unavailable or errored
    }
    return options.shortsMode ? 170 : 0;
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
        <div class="top-badge" style="position:relative; z-index:1;">⚡ 3-Minute Technical Deep Dive</div>
        <div class="title-card" style="position:relative; z-index:1;">
            <h1 class="main-title">${this.escapeHTML(script.title)}</h1>
            <p class="subtitle">${this.escapeHTML(script.hook?.text || script.hook || 'Start to End IT Concept & Practical Code Example')}</p>
            <div class="hero-feature-box">
                <div class="feature-item"><span class="feature-icon">🔍</span> Architectural Overview</div>
                <div class="feature-item"><span class="feature-icon">⚙️</span> Under-The-Hood Mechanics</div>
                <div class="feature-item"><span class="feature-icon">💻</span> Working Code / CLI Walkthrough</div>
                <div class="feature-item"><span class="feature-icon">🚀</span> Production Best Practices</div>
            </div>
        </div>
    </div>
    
    ${this.generateContentSlides(script, visualAssets).join('')}
    
    <!-- Final Slide: Engineering Takeaway -->
    <div class="slide">
        ${visualAssets && visualAssets.length > 1 ? `<img class="background-image" src="${visualAssets[visualAssets.length - 1]}" />` : ''}
        <div class="takeaway-card" style="position:relative; z-index:1;">
            <div class="top-badge">💡 Senior Engineer Takeaway</div>
            <div class="takeaway-title">Production Rule of Thumb</div>
            <p class="takeaway-text">${this.escapeHTML(script.conclusion?.finalThought || 'Master this pattern to build resilient, scalable production infrastructure.')}</p>
            <div class="takeaway-footer">📌 Save for System Design & Coding Interviews</div>
        </div>
    </div>
</body>
</html>`;
  }

  renderDiagramHTML(slide, _topic = '') {
    const raw = slide.diagram;
    let title = 'System Architecture & Data Flow';
    let nodes = [];
    let flowLabel = '';

    if (raw && typeof raw === 'object' && Array.isArray(raw.nodes) && raw.nodes.length > 0) {
      title = raw.title || title;
      nodes = raw.nodes.map(n => typeof n === 'string' ? { name: n, role: 'System Component', icon: '⚙️' } : {
        name: n.name || n.label || 'Service',
        role: n.role || n.type || 'Component',
        icon: n.icon || '⚙️'
      });
      flowLabel = raw.flowLabel || raw.flow || '';
    } else if (typeof raw === 'string' && raw.trim().length > 0) {
      flowLabel = raw.trim();
      nodes = [
        { name: 'Traffic Ingress', role: 'API Request', icon: '🌐' },
        { name: 'Core Controller', role: 'State Engine', icon: '⚙️' },
        { name: 'Worker Execution', role: 'Runtime Pods', icon: '📦' },
        { name: 'Persistence Layer', role: 'Database / Cache', icon: '💾' }
      ];
    } else {
      nodes = [
        { name: 'Client App', role: 'End User / SDK', icon: '📱' },
        { name: 'Ingress / Gateway', role: 'Routing & Rate Limit', icon: '🛡️' },
        { name: 'Service Pods', role: 'Compute & Logic', icon: '⚙️' },
        { name: 'Database / State', role: 'Persistent Store', icon: '💾' }
      ];
      flowLabel = 'Client ➔ Ingress (TLS) ➔ Service Replicas ➔ DB Engine';
    }

    const nodesHTML = nodes.slice(0, 4).map(node => `
      <div class="diagram-node-card">
        <div class="diagram-node-icon">${node.icon || '⚙️'}</div>
        <div class="diagram-node-info">
          <div class="diagram-node-name">${this.escapeHTML(node.name)}</div>
          <div class="diagram-node-role">${this.escapeHTML(node.role)}</div>
        </div>
      </div>
    `).join('');

    return `
      <div class="diagram-container">
        <div class="diagram-title">
          <span style="font-size: 26px;">📐</span> ${this.escapeHTML(title)}
        </div>
        <div class="diagram-nodes-grid">
          ${nodesHTML}
        </div>
        ${flowLabel ? `
          <div class="diagram-flow-bar">
            <span>⚡</span> ${this.escapeHTML(flowLabel)}
          </div>
        ` : ''}
      </div>
    `;
  }

  createMultiSlideShortsHTML(script, visualAssets = []) {
    const theme = this.getRotatedTheme();

    const slideBadges = [
      { icon: '🔥', label: '01. The Problem', color: '#ef4444' },
      { icon: '⚙️', label: '02. The Architecture', color: theme.accent },
      { icon: '💻', label: '03. Live Code', color: '#22c55e' },
      { icon: '💡', label: '04. Senior Rule of Thumb', color: '#eab308' },
      { icon: '🚀', label: '05. Deep Dive', color: theme.secondary }
    ];

    const slideDecorations = [
      // Slide 1: floating alert icons
      `<div class="deco-float deco-float-1">⚠️</div><div class="deco-float deco-float-2">🐛</div><div class="deco-float deco-float-3">💥</div>`,
      // Slide 2: mini architecture nodes
      `<div class="deco-arch"><div class="arch-node" style="border-color:${theme.accent}">📡</div><div class="arch-line" style="background:${theme.accent}"></div><div class="arch-node" style="border-color:${theme.secondary}">⚙️</div><div class="arch-line" style="background:${theme.secondary}"></div><div class="arch-node" style="border-color:${theme.accent}">💾</div></div>`,
      // Slide 3: terminal cursor blink
      `<div class="deco-terminal"><span class="term-prompt" style="color:${theme.accent}">$</span> <span class="term-cursor">_</span></div>`,
      // Slide 4: achievement badge
      `<div class="deco-achievement" style="border-color:${theme.accent}"><span class="achieve-icon">🏆</span><span class="achieve-text" style="color:${theme.accent}">KEY TAKEAWAY</span></div>`,
      // Slide 5 fallback
      `<div class="deco-float deco-float-1">🚀</div>`
    ];

    const slidesHTML = script.slides.map((slide, idx) => {
      const asset = (visualAssets && visualAssets.length > 0) ? visualAssets[idx % visualAssets.length] : null;
      const badge = slideBadges[idx] || slideBadges[0];
      const deco = slideDecorations[idx] || '';

      const bulletsHTML = (slide.bulletPoints || []).map((b, bIdx) => {
        const bulletIcons = ['💡', '⚡', '🔑', '📌', '✨'];
        const icon = bulletIcons[bIdx % bulletIcons.length];
        return `<div class="bullet-card" style="border-left-color: ${theme.accent}; animation-delay: ${bIdx * 0.15}s">${icon} ${this.escapeHTML(b)}</div>`;
      }).join('');

      const diagramHTML = (idx === 1 || slide.diagram) ? this.renderDiagramHTML(slide, script.title) : '';

      const codeHTML = slide.codeSnippet ? `
        <div class="code-container">
            <div class="code-header">
                <span class="dot red"></span>
                <span class="dot yellow"></span>
                <span class="dot green"></span>
                <span class="file-title">terminal / code</span>
            </div>
            <pre class="code-block"><code>${this.escapeHTML(slide.codeSnippet)}</code></pre>
        </div>` : '';

      return `
      <div class="slide ${idx === 0 ? 'active' : ''}">
          <div class="scanline"></div>
          ${asset ? `<img class="background-image" src="${asset}" />` : ''}
          <div class="slide-particles">
            <div class="particle p1"></div><div class="particle p2"></div><div class="particle p3"></div>
            <div class="particle p4"></div><div class="particle p5"></div>
          </div>
          ${deco}
          <div class="top-badge" style="background: ${badge.color}22; border-color: ${badge.color}66; color: ${badge.color};">${badge.icon} ${badge.label}</div>
          <div class="section-card">
              <h2 class="section-header">${this.escapeHTML(slide.headline)}</h2>
              ${bulletsHTML ? `<div class="bullet-container">${bulletsHTML}</div>` : ''}
              ${diagramHTML}
              ${codeHTML}
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
        .slide.active { opacity: 1; }

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
            padding: 28px 34px;
            font-size: 32px;
            line-height: 1.5;
            color: #e2e8f0;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            animation: slide-in-up 0.6s ease-out both;
        }

        /* Diagram styling */
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
            background: rgba(${theme.accentRGB}, 0.12);
            border: 1px dashed ${theme.accent};
            border-radius: 12px;
            padding: 12px 18px;
            color: #e2e8f0;
            font-size: 20px;
            font-family: 'Consolas', monospace;
            font-weight: 600;
            text-align: center;
        }

        /* Code block */
        .code-container {
            width: 100%;
            background: #0d1117;
            border: 1px solid ${theme.cardBorder};
            border-radius: 20px;
            overflow: hidden;
            margin-top: 15px;
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
            padding: 28px 32px;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 26px;
            line-height: 1.55;
            color: ${theme.codeColor};
            white-space: pre-wrap;
            word-break: break-all;
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
          <div class="top-badge" style="position:relative; z-index:1;">⚙️ Concept Breakdown • Part ${index + 1}</div>
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
        <div class="course-badge">🎓 ${this.escapeHTML(masterclassData.shortTopic)} Masterclass</div>
        <div class="chapter-counter">Chapter ${chapterNum} of ${totalChapters}</div>
    </div>
    <div class="main-layout">
        <div class="left-col">
            <h1 class="chapter-title">${this.escapeHTML(chapter.title)}</h1>
            <div class="bullet-container">
                ${(chapter.slideBullets || []).map(b => `<div class="bullet-card">💡 ${this.escapeHTML(b)}</div>`).join('')}
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
