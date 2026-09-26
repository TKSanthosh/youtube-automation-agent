const { Logger } = require('../utils/logger');
const { AITextService } = require('../utils/ai-text-service');

class ScriptWriterAgent {
  constructor(db, credentials) {
    this.db = db;
    this.credentials = credentials;
    this.logger = new Logger('ScriptWriter');
    this.templates = this.loadTemplates();
    this.aiTextService = new AITextService(credentials?.credentials || credentials || {});
    try {
      const { MultiAgentScriptPipeline } = require('../utils/script-pipeline');
      this.pipeline = new MultiAgentScriptPipeline(this.aiTextService);
    } catch (_e) {
      this.pipeline = null;
    }
  }

  async initialize() {
    this.logger.info('Initializing Script Writer Agent...');
    return true;
  }

  loadTemplates() {
    return {
      tutorial: {
        structure: ['hook', 'introduction', 'problem', 'solution_steps', 'demonstration', 'recap', 'cta'],
        tone: 'educational',
        pacing: 'moderate'
      },
      explainer: {
        structure: ['hook', 'question', 'background', 'explanation', 'examples', 'implications', 'summary', 'cta'],
        tone: 'informative',
        pacing: 'steady'
      },
      list: {
        structure: ['hook', 'introduction', 'list_items', 'bonus_item', 'summary', 'cta'],
        tone: 'engaging',
        pacing: 'quick'
      },
      review: {
        structure: ['hook', 'introduction', 'overview', 'pros', 'cons', 'comparison', 'verdict', 'cta'],
        tone: 'analytical',
        pacing: 'detailed'
      },
      story: {
        structure: ['hook', 'setup', 'conflict', 'journey', 'climax', 'resolution', 'lesson', 'cta'],
        tone: 'narrative',
        pacing: 'dynamic'
      }
    };
  }

  async generateScript(strategy) {
    try {
      this.logger.info(`Generating script for: ${strategy.topic}`);
      const isExtendedForm = strategy.requestedLengthKey === 'extended' || strategy.requestedLength === '20-30 minutes';

      if (this.pipeline && this.aiTextService.isAvailable()) {
        this.logger.info(`Running 10-Agent Collaborative Script Pipeline for: "${strategy.topic}"`);
        const pipelineScript = await this.pipeline.runPipeline(strategy, { isExtendedForm });
        if (pipelineScript) {
          pipelineScript.isExtendedForm = isExtendedForm;
          if (isExtendedForm && pipelineScript.duration < 1200) {
            pipelineScript.duration = 1500;
          }
          pipelineScript.fullScript = this.formatFullScript(pipelineScript);
          await this.db.saveScript(pipelineScript);
          this.logger.info(`10-Agent Pipeline Script APPROVED & saved: "${pipelineScript.title}"`);
          return pipelineScript;
        }
      }
      
      const template = this.templates[strategy.contentType?.toLowerCase()] || this.templates.explainer;
      const aiScript = await this.generateScriptWithAI(strategy, template);
      if (aiScript) {
        aiScript.isExtendedForm = isExtendedForm;
        aiScript.fullScript = this.formatFullScript(aiScript);
        await this.db.saveScript(aiScript);
        this.logger.info(`Script generated with AI provider: ${aiScript.title}`);
        return aiScript;
      }
      
      this.logger.info('Using template script generation');
      // Generate script components
      const hook = await this.generateHook(strategy);
      const introduction = await this.generateIntroduction(strategy);
      const mainContent = await this.generateMainContent(strategy, template, isExtendedForm);
      const conclusion = await this.generateConclusion(strategy);
      const cta = await this.generateCTA(strategy);

      // Assemble complete script
      const script = {
        title: await this.generateTitle(strategy),
        hook,
        introduction,
        mainContent,
        conclusion,
        callToAction: cta,
        duration: isExtendedForm ? 1500 : this.estimateDuration(mainContent),
        isExtendedForm,
        tone: template.tone,
        pacing: template.pacing,
        keywords: strategy.keywords,
        claims: [],
        metadata: {
          strategy: strategy,
          generatedAt: new Date().toISOString(),
          version: '1.0'
        }
      };

      // Format for readability
      script.fullScript = this.formatFullScript(script);
      
      // Save to database
      await this.db.saveScript(script);
      
      this.logger.info(`Script generated: ${script.title}`);
      return script;
    } catch (error) {
      this.logger.error('Failed to generate script:', error);
      throw error;
    }
  }

  async generateScriptWithAI(strategy, template) {
    if (!this.aiTextService.isAvailable()) {
      this.logger.info('Using template script generation because no AI text provider is configured');
      return null;
    }

    const prompt = `You are a renowned principal software architect and passionate tech educator creating a 3-Minute YouTube Short on: "${strategy.topic}".
Your goal is to teach this technical concept clearly and practically so that even junior developers immediately get it, while senior engineers appreciate the depth.

CRITICAL INSTRUCTIONS FOR VOICE, HUMOR & PEDAGOGY:
1. TALK LIKE A REAL HUMAN TEACHER:
   - Speak conversationally, warmly, and with high energy.
   - Use funny, relatable real-world analogies (e.g., comparing database locks to two polite people refusing to walk through a door first, or cache invalidation to updating restaurant menus during a rush).
   - Reference relatable developer struggles (e.g., getting paged at 3 AM on a Friday, containers eating all local disk space, memory leaks crashing production).
   - Keep explanations simple and intuitive before showing code.

2. NEVER READ THE SLIDE VERBATIM:
   - The slide displays concise bullet points and sleek code as visual anchors.
   - The teacher's voice MUST NOT read the bullet points word-for-word! Instead, talk directly to the student and refer to the screen: "Take a look at line 3 on your screen...", "Notice what happens when this flag is toggled...", "As you can see in the diagram..."

3. ZERO REPETITION & ZERO GREETINGS:
   - NEVER say "Hey everyone", "Hello folks", or "Welcome back". Dive straight into the core engineering problem.
   - DO NOT repeat what you just explained in previous sections. Every slide must advance the explanation with fresh intuition.

4. 4 DISTINCT PROGRESSIVE SLIDES (Total Narration: 270-310 words across all 4 slides combined, ~140-160s, strictly under 175s for YouTube Shorts):
   - Slide 1: The Problem & Real-Life Nightmare (The painful or funny failure mode; 60-70 words)
   - Slide 2: Under-The-Hood Architecture & The Analogy (Intuitive mental model; 70-80 words)
   - Slide 3: Practical Code / CLI Implementation (Walk through the code shown on screen line by line; 80-90 words)
   - Slide 4: Senior Dev Rule of Thumb & Gotchas (Memorable takeaway and gotcha to avoid; 45-55 words)

Return ONLY valid JSON matching this exact structure:
{
  "title": "Compelling technical title under 80 characters",
  "hook": "Opening statement capturing the real-world engineering problem (no greetings)",
  "slides": [
    {
      "slideNumber": 1,
      "type": "problem",
      "headline": "01. The Production Nightmare",
      "bulletPoints": [
        "Why standard naive implementations fail",
        "The hidden bottleneck devs miss in code review"
      ],
      "codeSnippet": "",
      "teacherNarration": "Conversational, witty, energetic teacher explanation of the problem with a relatable developer struggle (60-70 words). Does NOT read the slide bullets."
    },
    {
      "slideNumber": 2,
      "type": "architecture",
      "headline": "02. Under The Hood: The Mental Model",
      "bulletPoints": [
        "Core architectural mechanism",
        "State transitions & memory layout"
      ],
      "codeSnippet": "",
      "teacherNarration": "Conversational teacher explanation with a brilliant real-world analogy and zero slide reading (70-80 words)."
    },
    {
      "slideNumber": 3,
      "type": "code",
      "headline": "03. Practical Implementation",
      "bulletPoints": [
        "Thread-safe execution pattern",
        "Graceful fallback on timeout"
      ],
      "codeSnippet": "10-14 lines of clean practical code or config",
      "teacherNarration": "Teacher walks through the code shown on screen line by line explaining why each line matters (80-90 words)."
    },
    {
      "slideNumber": 4,
      "type": "takeaway",
      "headline": "04. Senior Dev Rule of Thumb",
      "bulletPoints": [
        "Production gotcha to avoid",
        "Key benchmark to monitor"
      ],
      "codeSnippet": "",
      "teacherNarration": "Memorable concluding rule of thumb without generic subscribe begging (45-55 words)."
    }
  ],
  "conclusion": "One-line golden rule of thumb for senior engineers"
}`;

    try {
      const response = await this.aiTextService.generateText(prompt, {
        maxTokens: 2500,
        temperature: 0.65
      });
      const parsed = this.parseAIJsonResponse(response);
      const slides = this.normalizeAISlides(parsed, strategy);
      const sections = slides.map(s => ({
        type: 'ai_generated',
        title: s.headline,
        content: s.bulletPoints,
        codeSnippet: s.codeSnippet,
        spokenNarration: s.teacherNarration,
        duration: Math.ceil(((s.teacherNarration || '').split(/\s+/).filter(Boolean).length / 135) * 60)
      }));

      if (!parsed.title || slides.length === 0) {
        throw new Error('AI script response missing required fields');
      }

      this.logger.info(`Using AI script generation via ${this.aiTextService.providerName}`);
      return {
        title: String(parsed.title).slice(0, 100),
        hook: this.normalizeAIHook(parsed.hook || slides[0]?.teacherNarration?.slice(0, 100) || strategy.topic),
        slides,
        introduction: {
          greeting: "",
          topicIntro: "",
          valueProposition: "",
          credibility: "",
          duration: '0:00'
        },
        mainContent: {
          sections,
          totalDuration: this.calculateSectionsDuration(sections)
        },
        conclusion: {
          type: 'conclusion',
          title: 'Key Takeaway',
          recap: [],
          finalThought: String(parsed.conclusion || slides[slides.length - 1]?.headline || '').trim(),
          duration: '10 seconds'
        },
        callToAction: {
          type: 'call_to_action',
          subscribe: "",
          like: "",
          comment: "",
          nextVideo: "",
          duration: '0 seconds'
        },
        duration: '2:40',
        tone: template.tone,
        pacing: template.pacing,
        keywords: strategy.keywords || [],
        claims: this.normalizeAIClaims(parsed.claims, strategy.researchSources || []),
        metadata: {
          strategy,
          generatedAt: new Date().toISOString(),
          version: '2.0',
          generationSource: 'ai'
        }
      };
    } catch (error) {
      this.logger.warn(`AI script generation failed; using template fallback: ${error.message}`);
      return null;
    }
  }

  normalizeAISlides(parsed, strategy) {
    if (Array.isArray(parsed.slides) && parsed.slides.length > 0) {
      return parsed.slides.slice(0, 5).map((slide, idx) => ({
        slideNumber: idx + 1,
        type: slide.type || (idx === 0 ? 'problem' : idx === 2 ? 'code' : idx === 3 ? 'takeaway' : 'architecture'),
        headline: String(slide.headline || `Part ${idx + 1}`).trim(),
        bulletPoints: Array.isArray(slide.bulletPoints) ? slide.bulletPoints.map(b => String(b).trim()).filter(Boolean) : [String(slide.headline || '')],
        codeSnippet: String(slide.codeSnippet || '').trim(),
        teacherNarration: String(slide.teacherNarration || slide.narration || '').trim()
      }));
    }

    // Fallback if AI returned legacy sections
    if (Array.isArray(parsed.sections) && parsed.sections.length > 0) {
      return parsed.sections.slice(0, 4).map((sec, idx) => {
        const rawContent = Array.isArray(sec.content) ? sec.content : [sec.content];
        return {
          slideNumber: idx + 1,
          type: idx === 2 ? 'code' : 'architecture',
          headline: String(sec.title || `0${idx + 1}. Concept`).trim(),
          bulletPoints: rawContent.slice(0, 3).map(c => String(c).trim()),
          codeSnippet: String(sec.codeSnippet || '').trim(),
          teacherNarration: rawContent.join(' ')
        };
      });
    }

    return [];
  }

  normalizeAISections(sections, strategy) {
    if (!Array.isArray(sections)) {
      return [];
    }

    return sections
      .slice(0, 8)
      .map((section, index) => {
        const rawContent = Array.isArray(section.content)
          ? section.content
          : [section.content || section.summary || section.description];
        const content = rawContent
          .filter(Boolean)
          .map(line => String(line).trim())
          .filter(Boolean);

        return {
          type: 'ai_generated',
          title: String(section.title || `${strategy.topic} Part ${index + 1}`).trim(),
          content,
          codeSnippet: String(section.codeSnippet || '').trim(),
          spokenNarration: section.spokenNarration || String(section.teacherNarration || content.join(' ')).trim(),
          duration: parseInt(section.duration, 10) || 40
        };
      })
      .filter(section => section.title && (section.content.length > 0 || section.spokenNarration));
  }

  normalizeAIClaims(claims, sources) {
    if (!Array.isArray(claims)) return [];
    const allowedUrls = new Set((sources || []).map(source => source.url));
    return claims.slice(0, 25).map(item => ({
      text: String(item?.text || item?.claim || '').trim().slice(0, 1000),
      riskLevel: item?.riskLevel === 'high' ? 'high' : 'standard',
      sourceUrls: [...new Set((Array.isArray(item?.sourceUrls) ? item.sourceUrls : [])
        .map(url => String(url))
        .filter(url => allowedUrls.has(url)))]
    })).filter(item => item.text);
  }

  normalizeAICTA(cta, strategy) {
    if (cta && typeof cta === 'object') {
      return {
        type: 'call_to_action',
        subscribe: String(cta.subscribe || cta.text || `Subscribe for more on ${strategy.topic}.`),
        like: String(cta.like || 'Like this video if it helped.'),
        comment: String(cta.comment || `Share your experience with ${strategy.topic} in the comments.`),
        nextVideo: String(cta.nextVideo || 'Watch the next related video for more context.'),
        duration: '15 seconds'
      };
    }

    return {
      type: 'call_to_action',
      subscribe: String(cta || `Subscribe for more practical videos about ${strategy.topic}.`),
      like: 'Like this video if it helped.',
      comment: `Share your experience with ${strategy.topic} in the comments.`,
      nextVideo: 'Watch the next related video for more context.',
      duration: '15 seconds'
    };
  }
  async generateTitle(strategy) {
    if (strategy.requestedLengthKey === 'extended' || strategy.requestedLength === '20-30 minutes') {
      return `Mastering ${strategy.topic}: Complete Architecture Masterclass`;
    }

    const templates = [
      strategy.angle || `${strategy.topic}: Full Architectural Guide`,
      `${strategy.topic}: The Complete Guide`,
      `Everything You Need to Know About ${strategy.topic}`,
      `${strategy.topic} in ${new Date().getFullYear()}: What's Changed?`,
      `The Truth About ${strategy.topic} (Shocking Results)`,
      `How to Master ${strategy.topic} in 30 Days`,
      `${strategy.topic}: Beginner to Expert Guide`
    ];

    // Select based on content type
    if (String(strategy.contentType).toLowerCase() === 'tutorial') {
      return `How to Master ${strategy.topic}: Step-by-Step Guide`;
    } else if (String(strategy.contentType).toLowerCase() === 'list') {
      return `Top 10 ${strategy.topic} Tips You Need to Know`;
    } else if (String(strategy.contentType).toLowerCase() === 'review') {
      return `${strategy.topic} Review: Is It Worth It?`;
    }

    return templates[Math.floor(Math.random() * templates.length)];
  }

  async generateHook(strategy) {
    const hooks = [
      {
        type: 'question',
        text: `Have you ever wondered ${this.generateQuestionAbout(strategy.topic)}?`
      },
      {
        type: 'statistic',
        text: `Did you know that ${this.generateStatistic(strategy.topic)}?`
      },
      {
        type: 'statement',
        text: `${strategy.topic} is about to change everything, and here's why...`
      },
      {
        type: 'challenge',
        text: `Most people think they understand ${strategy.topic}, but they're completely wrong.`
      },
      {
        type: 'promise',
        text: `In the next few minutes, you'll learn exactly how to master ${strategy.topic}.`
      }
    ];

    const selected = hooks[Math.floor(Math.random() * hooks.length)];
    
    return {
      type: selected.type,
      text: selected.text,
      duration: '0:00-0:05'
    };
  }

  generateQuestionAbout(topic) {
    const questions = [
      `why ${topic} is becoming so important`,
      `how ${topic} actually works`,
      `what makes ${topic} different from everything else`,
      `why experts are talking about ${topic}`,
      `how ${topic} could change your life`
    ];
    
    return questions[Math.floor(Math.random() * questions.length)];
  }

  generateStatistic(topic) {
    const stats = [
      `many people are still figuring out how ${topic} works`,
      `the conversation around ${topic} keeps expanding`,
      `experts continue to debate where ${topic} is headed`,
      `people often miss the practical side of ${topic}`,
      `${topic} can be easier to approach with a clear framework`
    ];
    
    return stats[Math.floor(Math.random() * stats.length)];
  }

  async generateIntroduction(strategy) {
    return {
      greeting: "",
      topicIntro: `Today we are breaking down ${strategy.topic}.`,
      valueProposition: `Here is exactly how it works under the hood and how to implement it in production.`,
      credibility: "",
      duration: '0:05-0:15'
    };
  }

  getValueProposition(strategy) {
    const propositions = {
      'Tutorial': `how to implement ${strategy.topic} step by step`,
      'Explainer': `what ${strategy.topic} is and why it matters`,
      'List': `the most important things about ${strategy.topic}`,
      'Review': `whether ${strategy.topic} is right for you`,
      'Story': `the incredible journey of ${strategy.topic}`
    };
    
    return propositions[strategy.contentType] || `everything about ${strategy.topic}`;
  }

  getCredibilityStatement(_strategy) {
    const statements = [
      "I've spent months researching this topic",
      "After working with hundreds of people on this",
      "Based on the latest research and data",
      "Drawing from real-world experience",
      "Using proven methods and strategies"
    ];
    
    return statements[Math.floor(Math.random() * statements.length)];
  }

  async generateMainContent(strategy, template, isExtended = false) {
    const sections = [];
    
    if (isExtended) {
      const extendedTitles = [
        'The Production Bottleneck: Why This Problem Exists',
        'Mental Models & Core Architectural Foundations',
        'Under the Hood: Tracing State Transitions & Memory',
        'Fascinating Tech History & Evolution Trivia',
        'Step-by-Step Production Implementation Guide',
        'Live Code Walkthrough: Handling Edge Cases & Concurrency',
        'Interactive Quiz: Predict the Output and Pitfalls',
        'Benchmarking & Performance Profiling Under High Load',
        'Top 5 Senior Engineer Pro-Tips & Anti-Patterns to Avoid',
        'Complete Masterclass Summary & Architectural Cheatsheet'
      ];

      for (let i = 0; i < extendedTitles.length; i++) {
        sections.push({
          type: 'extended_chapter',
          title: `Chapter ${i + 1}: ${extendedTitles[i]}`,
          content: [
            `In this masterclass section, we explore ${extendedTitles[i].toLowerCase()} in the context of ${strategy.topic}.`,
            `Understanding this architectural nuance is critical for building resilient production-grade systems.`,
            `Notice how modern compilers and runtimes optimize this specific code path to prevent CPU cache misses and lock contention.`,
            `When deploying to production, always verify your benchmarks before assuming uniform performance across architectures.`
          ],
          duration: 150
        });
      }
    } else {
      for (const section of template.structure) {
        if (!['hook', 'introduction', 'cta'].includes(section)) {
          sections.push(await this.generateSection(section, strategy));
        }
      }
    }
    
    return {
      sections,
      totalDuration: isExtended ? 1500 : this.calculateSectionsDuration(sections)
    };
  }

  async generateSection(sectionType, strategy) {
    const sectionGenerators = {
      problem: () => this.generateProblemSection(strategy),
      solution_steps: () => this.generateSolutionSteps(strategy),
      demonstration: () => this.generateDemonstration(strategy),
      explanation: () => this.generateExplanation(strategy),
      examples: () => this.generateExamples(strategy),
      list_items: () => this.generateListItems(strategy),
      pros: () => this.generatePros(strategy),
      cons: () => this.generateCons(strategy),
      comparison: () => this.generateComparison(strategy),
      implications: () => this.generateImplications(strategy)
    };

    const generator = sectionGenerators[sectionType];
    
    if (generator) {
      return await generator();
    }
    
    return this.generateGenericSection(sectionType, strategy);
  }

  async generateProblemSection(strategy) {
    return {
      type: 'problem',
      title: 'The Challenge',
      content: [
        `Many people struggle with ${strategy.topic}.`,
        `The main issues are:`,
        `1. Lack of clear information`,
        `2. Complexity and confusion`,
        `3. Not knowing where to start`,
        `But don't worry, we're going to solve all of these today.`
      ],
      visuals: ['Problem illustration', 'Statistics graphic'],
      duration: 30
    };
  }

  async generateSolutionSteps(strategy) {
    const steps = [];
    const numSteps = 3 + Math.floor(Math.random() * 3); // 3-5 steps
    
    for (let i = 1; i <= numSteps; i++) {
      steps.push({
        number: i,
        title: `Step ${i}: ${this.generateStepTitle(strategy.topic, i)}`,
        description: this.generateStepDescription(strategy.topic, i),
        tip: this.generateProTip(strategy.topic)
      });
    }
    
    return {
      type: 'solution_steps',
      title: 'The Solution',
      steps,
      duration: steps.length * 45
    };
  }

  generateStepTitle(topic, stepNumber) {
    const titles = [
      'Research and Preparation',
      'Setting Up the Foundation',
      'Implementation and Execution',
      'Testing and Optimization',
      'Scaling and Automation'
    ];
    
    return titles[stepNumber - 1] || `Advanced ${topic} Techniques`;
  }

  generateStepDescription(topic, _stepNumber) {
    return `This step involves understanding the key aspects of ${topic} and how to apply them effectively. Pay special attention to the details here, as they make all the difference.`;
  }

  generateProTip(_topic) {
    const tips = [
      `Pro tip: Start small and scale gradually`,
      `Remember: Consistency is more important than perfection`,
      `Quick tip: Document everything as you go`,
      `Expert advice: Focus on one aspect at a time`,
      `Insider secret: This works best when combined with regular practice`
    ];
    
    return tips[Math.floor(Math.random() * tips.length)];
  }

  async generateDemonstration(_strategy) {
    return {
      type: 'demonstration',
      title: 'Live Demo',
      content: [
        `Now let me show you exactly how this works.`,
        `[Screen recording or visual demonstration]`,
        `As you can see, the process is straightforward once you understand the basics.`,
        `The key is to follow the steps exactly as shown.`
      ],
      visuals: ['Screen recording', 'Step-by-step graphics'],
      duration: 120
    };
  }

  async generateExplanation(strategy) {
    return {
      type: 'explanation',
      title: 'Deep Dive',
      content: [
        `Let's break down ${strategy.topic} into its core components.`,
        `First, we need to understand the fundamental principles.`,
        `The science behind this is fascinating...`,
        `[Detailed explanation with visuals]`,
        `This is why ${strategy.topic} works so effectively.`
      ],
      visuals: ['Diagrams', 'Infographics', 'Charts'],
      duration: 90
    };
  }

  async generateExamples(strategy) {
    return {
      type: 'examples',
      title: 'Real-World Examples',
      content: [
        `Let's look at some real examples of ${strategy.topic} in action.`,
        `Example 1: [Specific case study]`,
        `Example 2: [Another relevant example]`,
        `Example 3: [Third compelling example]`,
        `These examples show the versatility and power of ${strategy.topic}.`
      ],
      visuals: ['Case study graphics', 'Before/after comparisons'],
      duration: 75
    };
  }

  async generateListItems(strategy) {
    const items = [];
    const numItems = 5 + Math.floor(Math.random() * 6); // 5-10 items
    
    for (let i = 1; i <= numItems; i++) {
      items.push({
        number: numItems - i + 1, // Countdown for engagement
        title: this.generateListItemTitle(strategy.topic, i),
        description: this.generateListItemDescription(strategy.topic),
        impact: this.generateImpactStatement()
      });
    }
    
    return {
      type: 'list_items',
      title: `Top ${numItems} Things About ${strategy.topic}`,
      items,
      duration: items.length * 30
    };
  }

  generateListItemTitle(topic, index) {
    const titles = [
      `The Hidden Power of ${topic}`,
      `Why ${topic} Matters More Than You Think`,
      `The Surprising Truth About ${topic}`,
      `How ${topic} Can Transform Your Approach`,
      `The ${topic} Secret Nobody Talks About`,
      `Mastering ${topic} in Record Time`,
      `The Ultimate ${topic} Hack`,
      `${topic}: The Game Changer`,
      `Breaking Down ${topic} Myths`,
      `The Future of ${topic}`
    ];
    
    return titles[index - 1] || `Advanced ${topic} Technique #${index}`;
  }

  generateListItemDescription(topic) {
    return `This aspect of ${topic} is crucial because it fundamentally changes how we approach the subject. Understanding this will give you a significant advantage.`;
  }

  generateImpactStatement() {
    const impacts = [
      'This alone can save you hours',
      'Game-changing for beginners',
      'Essential for long-term success',
      'Often overlooked but critical',
      'The difference between success and failure'
    ];
    
    return impacts[Math.floor(Math.random() * impacts.length)];
  }

  async generatePros(_strategy) {
    return {
      type: 'pros',
      title: 'The Benefits',
      points: [
        'Easy to get started',
        'Cost-effective solution',
        'Proven results',
        'Scalable approach',
        'Community support'
      ],
      duration: 45
    };
  }

  async generateCons(_strategy) {
    return {
      type: 'cons',
      title: 'Things to Consider',
      points: [
        'Learning curve at the beginning',
        'Requires consistent effort',
        'Results may vary',
        'Some technical knowledge helpful'
      ],
      duration: 30
    };
  }

  async generateComparison(strategy) {
    return {
      type: 'comparison',
      title: 'How It Compares',
      content: `Compared to alternatives, ${strategy.topic} stands out because of its unique approach and proven effectiveness.`,
      comparisonPoints: [
        'More efficient than traditional methods',
        'Better ROI than competitors',
        'Easier to implement',
        'More sustainable long-term'
      ],
      duration: 60
    };
  }

  async generateImplications(strategy) {
    return {
      type: 'implications',
      title: 'What This Means',
      content: [
        `The implications of ${strategy.topic} are far-reaching.`,
        'This will change how we think about the industry.',
        'Early adopters will have a significant advantage.',
        'The potential for growth is enormous.'
      ],
      duration: 45
    };
  }

  generateGenericSection(sectionType, strategy) {
    return {
      type: sectionType,
      title: sectionType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      content: `This section covers important aspects of ${strategy.topic} that you need to know.`,
      duration: 60
    };
  }

  async generateConclusion(strategy) {
    return {
      type: 'conclusion',
      title: 'Wrapping Up',
      recap: [
        `So that's everything you need to know about ${strategy.topic}.`,
        'We covered the key points:',
        '- The fundamentals and why they matter',
        '- Practical steps to get started',
        '- Real-world applications and examples',
        '- Tips for long-term success'
      ],
      finalThought: `Remember, ${strategy.topic} is a journey, not a destination. Keep learning and improving!`,
      duration: '30 seconds'
    };
  }

  async generateCTA(strategy) {
    return {
      type: 'call_to_action',
      subscribe: "",
      like: "",
      comment: `Save this breakdown for your next system design interview or production architecture review.`,
      nextVideo: "",
      duration: '5 seconds'
    };
  }

  formatFullScript(script) {
    let fullScript = '';
    
    // Title
    fullScript += `TITLE: ${script.title}\n\n`;
    fullScript += '═'.repeat(50) + '\n\n';
    
    // Hook
    fullScript += `[${script.hook.duration}] HOOK\n`;
    fullScript += `${script.hook.text}\n\n`;
    
    // Introduction
    fullScript += `[${script.introduction.duration}] INTRODUCTION\n`;
    fullScript += `${script.introduction.greeting}\n`;
    fullScript += `${script.introduction.topicIntro}\n`;
    fullScript += `${script.introduction.valueProposition}\n`;
    fullScript += `${script.introduction.credibility}\n\n`;
    
    // Main Content
    fullScript += 'MAIN CONTENT\n';
    fullScript += '─'.repeat(30) + '\n\n';
    
    for (const section of script.mainContent.sections) {
      fullScript += `[${this.formatDuration(section.duration)}] ${section.title.toUpperCase()}\n`;
      
      if (Array.isArray(section.content)) {
        section.content.forEach(line => {
          fullScript += `${line}\n`;
        });
      } else if (section.steps) {
        section.steps.forEach(step => {
          fullScript += `\n${step.title}\n`;
          fullScript += `${step.description}\n`;
          fullScript += `💡 ${step.tip}\n`;
        });
      } else if (section.items) {
        section.items.forEach(item => {
          fullScript += `\n#${item.number}: ${item.title}\n`;
          fullScript += `${item.description}\n`;
          fullScript += `Impact: ${item.impact}\n`;
        });
      } else if (section.points) {
        section.points.forEach(point => {
          fullScript += `• ${point}\n`;
        });
      } else {
        fullScript += `${section.content}\n`;
      }
      
      if (section.visuals) {
        fullScript += `\n[VISUALS: ${section.visuals.join(', ')}]\n`;
      }
      
      fullScript += '\n';
    }
    
    // Conclusion
    fullScript += `[${script.conclusion.duration}] CONCLUSION\n`;
    script.conclusion.recap.forEach(line => {
      fullScript += `${line}\n`;
    });
    fullScript += `\n${script.conclusion.finalThought}\n\n`;
    
    // Call to Action
    fullScript += `[${script.callToAction.duration}] CALL TO ACTION\n`;
    fullScript += `${script.callToAction.subscribe}\n`;
    fullScript += `${script.callToAction.like}\n`;
    fullScript += `${script.callToAction.comment}\n`;
    fullScript += `${script.callToAction.nextVideo}\n\n`;
    
    // Metadata
    fullScript += '═'.repeat(50) + '\n';
    fullScript += `ESTIMATED DURATION: ${script.duration}\n`;
    fullScript += `TONE: ${script.tone}\n`;
    fullScript += `PACING: ${script.pacing}\n`;
    fullScript += `KEYWORDS: ${script.keywords.join(', ')}\n`;
    
    return fullScript;
  }

  estimateDuration(mainContent) {
    const totalSeconds = mainContent.sections.reduce((total, section) => {
      return total + (section.duration || 60);
    }, 0);
    
    // Add hook, intro, conclusion, CTA
    const fullDuration = totalSeconds + 5 + 15 + 30 + 15;
    
    return this.formatDuration(fullDuration);
  }

  formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  calculateSectionsDuration(sections) {
    return sections.reduce((total, section) => total + (section.duration || 60), 0);
  }
}

module.exports = { ScriptWriterAgent };
