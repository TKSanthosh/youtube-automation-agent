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

      // Pull latest evolutionary quality directives from the previously uploaded video
      if (!strategy.qualityDirectives && this.db) {
        try {
          const { QualityEvolutionService } = require('../utils/quality-evolution-service');
          const qualityEvolution = new QualityEvolutionService(this.db, { credentials: this.credentials });
          const evoRecord = await qualityEvolution.getDirectivesForNextVideo();
          if (evoRecord && evoRecord.enhancement_directives) {
            strategy.qualityDirectives = evoRecord.enhancement_directives;
            strategy.qualityIteration = evoRecord.iteration_number || 1;
            strategy.previousQualityScore = evoRecord.quality_score || 8.0;
            this.logger.info(`📈 [Continuous Quality Evolution] Active Iteration #${strategy.qualityIteration} (Target Score > ${strategy.previousQualityScore})`);
          }
        } catch (_evoErr) {
          // Non-fatal, continue with standard generation
        }
      }

      if (this.pipeline && this.aiTextService.isAvailable()) {
        this.logger.info(`Running 10-Agent Collaborative Script Pipeline for: "${strategy.topic}"`);
        const pipelineScript = await this.pipeline.runPipeline(strategy, { isExtendedForm });
        if (pipelineScript) {
          pipelineScript.isExtendedForm = isExtendedForm;
          if (isExtendedForm && pipelineScript.duration < 1200) {
            pipelineScript.duration = 1500;
          }
          pipelineScript.sections = pipelineScript.sections || [];
          pipelineScript.mainContent = pipelineScript.mainContent || { sections: pipelineScript.sections };
          pipelineScript.keywords = pipelineScript.keywords || strategy.keywords || [];
          pipelineScript.duration = '2:55';
          pipelineScript.slides = this.normalizeAISlides(
            { slides: pipelineScript.slides, sections: pipelineScript.sections },
            strategy
          );
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

      // Ensure 4 progressive slides with rich narration are always generated
      if (!Array.isArray(script.slides) || script.slides.length === 0) {
        script.slides = this.normalizeAISlides({ sections: mainContent.sections }, strategy);
      }

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

    const evoBlock = strategy.qualityDirectives ? `
MANDATORY CONTINUOUS QUALITY EVOLUTION DIRECTIVES (Iteration #${strategy.qualityIteration || 1}):
Our channel rule: THIS video MUST surpass our previous upload (previous quality benchmark: ${strategy.previousQualityScore || 8.0}/10).
- Hook Rule: ${strategy.qualityDirectives.hookRule || 'Start immediately with the high-stakes problem in under 1.5 seconds.'}
- Audio-Text Synchronization: ${strategy.qualityDirectives.audioTextSyncRule || 'Ensure spoken words sync directly with screen text.'}
- Pedagogical Density: ${strategy.qualityDirectives.pedagogicalDensity || 'Include concrete, real-world code snippets and visual diagrams.'}
- Mandatory Upgrades: ${Array.isArray(strategy.qualityDirectives.mandatoryUpgrades) ? strategy.qualityDirectives.mandatoryUpgrades.join('; ') : 'Tighter pacing, zero delay in hook.'}
` : '';

    const prompt = `You are a renowned computer science educator creating a captivating 3-minute YouTube Short on: "${strategy.topic}".
Channel Style: A brilliant blend of FIRESHIP (fast-paced developer wit, programming history/lore & hilarious relatable dev memes), BYTEBYTEGO (crystal-clear visual diagrams & DSA/architecture mental models), and JAVASCRIPT MASTERY (sleek syntax-highlighted code walkthroughs).
Your goal is to make this video captivating, deeply educational, and free of generic corporate buzzwords. Junior engineers will love the humor and clarity, while staff engineers will respect the depth.
${evoBlock}
CRITICAL CONSTRAINTS FOR 3-MINUTE YOUTUBE SHORTS (2:45 to 3:00 MINUTES):
- Video duration MUST be strictly between 2:45 and 3:00 minutes (165 to 178 seconds).
- Total narration across all 5 slides MUST be 360 to 385 words (~70-80 words per slide at ~130-135 wpm speech pacing).
- Zero fluff, zero generic boilerplate, zero throat-clearing greetings.
- STRICT EMOJI BAN: Do NOT include any emojis anywhere in headlines, captions, subtexts, or bullet points. Use clean, professional engineering typography only.

THE 5 PROGRESSIVE SLIDES (Total: 360-385 words):
1. Slide 1 (type: "history_lore"): Programming History / Lore & High-Stakes Hook (~70-75 words)
   - Story hook: When was this discovered, created, or broken? (e.g., Bell Labs 1972, Netscape 1995, Apollo 11 1969, Tony Hoare 1965, or the historical origin of the problem).
   - Talk like Fireship: fast, punchy, cynical, fascinating.
2. Slide 2 (type: "meme"): Developer Comedy Meme & The Relatable Pain Point (~60-65 words)
   - Relatable developer struggle: Debugging at 2 AM, burning production servers, "works on my machine", junior vs senior dev.
   - Include a meme object with type ("server_on_fire" | "works_on_my_machine" | "spiderman_pointing" | "two_buttons" | "doge_cheems"), comic uppercase caption, and subtext.
3. Slide 3 (type: "dsa_architecture"): Under-The-Hood DSA & Architecture Mental Model (~80-85 words)
   - ByteByteGo style: Explain the core mechanics (memory layout, Big-O, bucket arrays, cache lines, state machine transitions) without hand-waving.
   - Include a diagram object with dsaType ("hash_table" | "binary_tree" | "stack_heap" | "circuit_breaker" | "cache_hierarchy") and flowLabel.
4. Slide 4 (type: "code"): Clean Code Implementation Walkthrough (~80-85 words)
   - JavaScript Mastery style: Real, clean syntax (TypeScript, Python, C, or Go).
   - Narration walks through the code on screen line-by-line ("Notice on line 3...", "Instead of a naive loop...").
5. Slide 5 (type: "takeaway"): Senior Staff Engineer Golden Rule of Thumb (~70-75 words)
   - One actionable golden rule that separates tutorial hell from senior architecture.
   - Smooth loop anchor back to the start.

Return ONLY valid JSON matching this exact structure:
{
  "title": "Compelling CS title under 70 characters",
  "hook": "Opening statement capturing the singular, specific real-world problem or lore milestone (no greetings)",
  "slides": [
    {
      "slideNumber": 1,
      "type": "history_lore",
      "headline": "01. Origin & Computing Lore",
      "historicMilestone": "BELL LABS • 1972",
      "bulletPoints": [
        "Historical origin and discovery",
        "Why naive approaches broke early computing"
      ],
      "codeSnippet": "",
      "teacherNarration": "Conversational, witty, energetic history/lore explanation hook (70-75 words)."
    },
    {
      "slideNumber": 2,
      "type": "meme",
      "headline": "02. The 2 AM Developer Reality",
      "meme": {
        "type": "server_on_fire",
        "caption": "WHEN YOUR NAIVE CODE HITS PRODUCTION TRAFFIC",
        "subtext": "Everything worked perfectly on localhost"
      },
      "bulletPoints": [
        "The painful developer struggle",
        "Why localhost tests deceive you"
      ],
      "codeSnippet": "",
      "teacherNarration": "Relatable developer comedy narration explaining the pain and nightmare (60-65 words)."
    },
    {
      "slideNumber": 3,
      "type": "dsa_architecture",
      "headline": "03. Under The Hood: Mental Model",
      "bulletPoints": [
        "Memory layout and data pointers",
        "Time & Space complexity mechanics"
      ],
      "diagram": {
        "title": "Data Flow & Memory Mechanics",
        "dsaType": "hash_table",
        "nodes": [
          {"name": "Hash Function", "role": "Key -> Hash Code", "icon": "01"},
          {"name": "Bucket Array", "role": "Index Modulo", "icon": "02"},
          {"name": "Collision Chain", "role": "Linked List / Tree", "icon": "03"},
          {"name": "Memory Buffer", "role": "Heap Allocation", "icon": "04"}
        ],
        "flowLabel": "Key -> Hash Function -> Bucket Index -> Collision Chain"
      },
      "codeSnippet": "",
      "teacherNarration": "ByteByteGo-style clear explanation of the mechanics and Big-O reality (80-85 words)."
    },
    {
      "slideNumber": 4,
      "type": "code",
      "headline": "04. Clean Implementation",
      "bulletPoints": [
        "Idiomatic pattern implementation",
        "Edge-case and collision handling"
      ],
      "codeSnippet": "// 8-12 lines of clean code",
      "teacherNarration": "Teacher walks through the code shown on screen line by line explaining why each line matters (80-85 words)."
    },
    {
      "slideNumber": 5,
      "type": "takeaway",
      "headline": "05. Staff Engineer Golden Rule",
      "bulletPoints": [
        "Core production gotcha to avoid",
        "Key architectural rule of thumb"
      ],
      "codeSnippet": "",
      "teacherNarration": "Memorable concluding rule of thumb providing complete pedagogical closure and resolution without generic subscribe begging (70-75 words)."
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
        duration: '2:55',
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

  generateAuthenticCSNarration(slide, topic, idx) {
    const t = String(topic || '').toLowerCase();
    const topicClean = topic || 'this concept';

    if (t.includes('hash') || t.includes('collision')) {
      if (idx === 0) {
        return `In 1953, Hans Peter Luhn at IBM invented hash tables to search text records in constant time O(1). But a mathematical reality quickly emerged: the Birthday Paradox guarantees that with just twenty-three elements, hash collisions become statistically inevitable. When two completely different keys produce the exact same bucket address, naive systems crash or overwrite memory. Let's break down how modern high-performance runtimes resolve this collision bottleneck and maintain lightning-fast lookups.`;
      } else if (idx === 1) {
        return `Here is the classic developer comedy nightmare: your code runs in two milliseconds during local staging tests, but the moment real users flood production, lookups mysteriously crawl to a dead halt. Every engineer cries when their textbook constant-time hash table secretly degrades into a bloated, slow O(N) linked list. It worked on my machine, so why is the server CPU pinned at one hundred percent? Welcome to the reality of unhandled collisions.`;
      } else if (idx === 2) {
        return `Let's trace the memory mechanics displayed directly on your screen. When a key is hashed, its 64-bit hash code is modulo-divided by the bucket array length. When two keys map to the exact same bucket index, Separate Chaining allocates a pointer on the heap, linking nodes sequentially. But notice what happens at scale: if a chain exceeds eight elements, modern runtimes like Java and V8 automatically transform the linked list into a self-balancing red-black tree, maintaining O(log N) retrieval speed.`;
      } else if (idx === 3) {
        return `Now examine the clean production implementation on your screen. Notice how we calculate the bucket index: instead of using expensive modulo arithmetic, we perform a bitwise AND mask with capacity minus one, executing in a single CPU clock cycle. When reading or writing, we traverse the bucket head pointer, checking cached 32-bit hash codes before running full key equality comparisons, guaranteeing true O(1) retrieval speed while shielding your CPU from redundant memory dereferencing.`;
      } else {
        return `Here is the golden rule of thumb senior staff engineers live by: always monitor your load factor. The moment your entry count breaches seventy-five percent of bucket capacity, trigger a dynamic array resize immediately. Never allow unmonitored collision chains to exhaust your CPU cache lines and murder database lookup throughput. Master memory-aware data structures and you will build rock-solid systems that scale effortlessly under heavy production traffic.`;
      }
    }

    if (t.includes('quick') || t.includes('sort') || t.includes('merge') || t.includes('cache line')) {
      if (idx === 0) {
        return `In 1960, British computer scientist Tony Hoare invented Quicksort while working on machine translation. On paper, Mergesort and Quicksort both run in O(N log N) time, yet Quicksort consistently outperforms Mergesort by three times in real-world benchmarks. The mathematical complexity is identical, but the physical hardware tells an entirely different story. Let's uncover the computer science secret hidden inside your CPU memory caches.`;
      } else if (idx === 1) {
        return `The relatable developer struggle: junior engineers spend months memorizing asymptotic Big-O formulas, only to deploy to production and watch their textbook optimal algorithm get absolutely destroyed by physical hardware realities. You brag about O(N log N) in your pull request, but production latency spikes through the roof. Welcome to the brutal world of CPU L1 cache line misses, pipeline stalls, and memory latency penalty.`;
      } else if (idx === 2) {
        return `Look at the architecture diagram on your screen. Mergesort requires allocating an auxiliary array on the heap, thrashing memory buses and forcing continuous pointer dereferences. Quicksort sorts strictly in-place. Because contiguous array elements fit directly into sixty-four-byte CPU cache lines, hardware prefetchers predict every pivot partition with near zero latency penalty, keeping processor execution cores completely saturated without memory wait states.`;
      } else if (idx === 3) {
        return `Now trace the live code implementation on your screen. Look at our partition function: we select the pivot using the median-of-three heuristic, avoiding worst-case quadratic degradation on pre-sorted arrays. As the pointers scan inward, elements swap directly within contiguous memory blocks, maintaining sequential cache locality throughout execution and preventing catastrophic branch prediction failures on modern superscalar CPU architectures.`;
      } else {
        return `Here is the staff engineer rule of thumb: never trust algorithmic Big-O without profiling physical memory access patterns. Cache locality beats theoretical instruction counts every single day. Master hardware-aware algorithms, understand cache line boundaries, and you will write high-performance code that leaves naive textbook implementations completely in the dust. Bookmark this breakdown for your next system design interview.`;
      }
    }

    if (t.includes('javascript') || t.includes('brendan') || t.includes('eich') || t.includes('web')) {
      if (idx === 0) {
        return `In May 1995, Netscape engineer Brendan Eich was given an impossible ultimatum: create a scripting language for the browser in just ten days. That feverish hackathon birthed JavaScript, a language that powers ninety-eight percent of the web today despite legendary lore like typeof null being an object. What was built as a prototype ended up running global finance, enterprise backends, and cloud infrastructure.`;
      } else if (idx === 1) {
        return `Every single web developer has suffered through JavaScript's hilarious meme moments: when adding an empty array plus an empty object outputs zero, or when NaN strictly does not equal NaN. It works flawlessly on your local machine, but completely breaks in production Chrome. You stare at your terminal at two in the morning questioning your entire career. Let's see how the engine actually evaluates code under the hood.`;
      } else if (idx === 2) {
        return `Let's examine the runtime architecture on your screen. JavaScript is single-threaded, powered by the V8 call stack, libuv thread pool, and the event loop. When asynchronous tasks complete, they enqueue into microtask and macrotask queues. Microtasks from Promises always execute before timers, maintaining non-blocking high throughput across single CPU cores without requiring thread locks or causing race condition deadlocks.`;
      } else if (idx === 3) {
        return `Look at the code on your screen. Notice how we handle asynchronous tasks cleanly with async await and Promise allSettled rather than unhandled callback hell. By executing concurrent I/O operations simultaneously without blocking the main event thread, our service delivers sub-millisecond response latency while shielding your runtime from unhandled rejection crashes that knock down Node.js container pods.`;
      } else {
        return `The senior engineer golden rule for JavaScript: always master microtask queue execution order. Never starve the event loop with synchronous heavy computation, always avoid type-coercing loose equality operators, and strictly validate external payloads with schemas to prevent silent runtime type errors from corrupting your production state. Follow this rule and your services will stay rock-solid under high traffic load.`;
      }
    }

    if (t.includes('null') || t.includes('hoare') || t.includes('pointer') || t.includes('stack') || t.includes('heap') || t.includes('memory')) {
      if (idx === 0) {
        return `In 1965, computer scientist Tony Hoare invented the null reference for the ALGOL W programming language simply because it was easy to implement. Decades later at an international software engineering conference, he publicly apologized, christening it his billion-dollar mistake due to countless software crashes, security vulnerabilities, and system outages worldwide. Here is why modern language designers have completely eliminated it.`;
      } else if (idx === 1) {
        return `Every single software engineer has had their weekend ruined by a production NullPointerException at two in the morning. You write fifty comprehensive unit tests, everything passes locally, and then a rogue null payload sails straight past your guard rails into the database. The client app crashes, the on-call pager screams, and you realize Tony Hoare's billion-dollar mistake just cost your team a night of sleep.`;
      } else if (idx === 2) {
        return `Let's trace the memory layout displayed on your screen. The Stack manages fixed-size execution frames with instant pointer offsets, while the dynamic Heap allocates variable-sized objects. When a pointer variable contains zero, dereferencing it causes the operating system memory management unit to trigger a segmentation fault or runtime panic immediately, killing worker threads and terminating active request contexts.`;
      } else if (idx === 3) {
        return `Look at the clean implementation on your screen. Modern software architecture eliminates null entirely through Optional and Result wrapper monads. Notice how we guard every access with safe pattern matching, making impossible states completely unrepresentable at compile time before code ever reaches staging, shielding your core domain logic from unexpected missing values.`;
      } else {
        return `Here is the staff engineer rule of thumb: ban raw nullable references from your production domain models permanently. Adopt Option types, compile-time non-null assertions, and strict boundary validation, and you will eliminate eighty percent of preventable application crashes across your tech stack. Implement this pattern in your mission-critical codebase today and sleep peacefully on Friday nights.`;
      }
    }

    // Default Computer Science Masterclass (Fireship / ByteByteGo style)
    if (idx === 0) {
      return `Computing history is defined by how engineers conquer complexity. When ${topicClean} was first conceptualized, early computer scientists were constrained by tight hardware registers, forcing pioneers to invent clean architectural abstractions that still govern modern software today. Understanding these fundamental origins is the difference between blindly copy-pasting code and truly designing resilient production systems that withstand real-world scale.`;
    } else if (idx === 1) {
      return `The two in the morning developer reality: textbook solutions look flawless in local development environments, but the instant real production traffic hits, race conditions and subtle bottlenecks emerge. It worked on my machine, so why is the production server currently on fire? Every engineer has experienced the panic of watching staging-tested code crumble under live user load. Let's see what is actually happening.`;
    } else if (idx === 2) {
      return `Let's examine the under-the-hood mental model displayed on your screen. Notice the flow of data across system boundaries. Instead of tight synchronous coupling, modern architecture isolates state transitions, managing state changes through deterministic state boundaries, memory barriers, and explicit invariant verification to guarantee that failures in one component never cascade across your distributed topology.`;
    } else if (idx === 3) {
      return `Now let's walk through the clean production implementation on your screen. Notice on line one how we declare explicit type safety and boundary guards. As we trace through the execution handler, every state mutation is isolated, preventing unintended side effects, handling timeout edge cases gracefully, and guaranteeing thread-safe, predictable execution across concurrent worker threads.`;
    } else {
      return `Here is the golden rule senior staff engineers live by: prioritize maintainable, predictable architecture over clever premature optimizations. Design systems around failure-tolerant boundaries, enforce explicit invariants, and profile physical memory before guessing. Master these core computer science principles and your software will scale effortlessly under high-throughput production load.`;
    }
  }

  ensurePedagogicalNarrationDepth(slide, topic, idx) {
    const narration = String(slide.teacherNarration || slide.spokenNarration || slide.narration || '').trim();
    const wordCount = narration.split(/\s+/).filter(Boolean).length;

    // If narration is already well-paced for YouTube Shorts (65 to 92 words), preserve it!
    if (wordCount >= 65 && wordCount <= 92) return narration;

    if (wordCount > 92) {
      return narration.split(/\s+/).slice(0, 85).join(' ') + '.';
    }

    // Generate authentic, topic-tailored explanation for the specific slide role
    return this.generateAuthenticCSNarration(slide, topic, idx);
  }

  getTopicDSAType(topic = '') {
    const t = String(topic).toLowerCase();
    if (t.includes('stack') || t.includes('heap') || t.includes('memory') || t.includes('null') || t.includes('pointer')) return 'stack_heap';
    if (t.includes('circuit') || t.includes('rate limit') || t.includes('microservice') || t.includes('token bucket') || t.includes('failover') || t.includes('distributed') || t.includes('async')) return 'circuit_breaker';
    if (t.includes('tree') || t.includes('sort') || t.includes('quick') || t.includes('merge') || t.includes('search') || t.includes('graph')) return 'binary_tree';
    return 'hash_table';
  }

  getTopicCodeSnippet(topic = '') {
    const t = String(topic).toLowerCase();
    if (t.includes('null') || t.includes('pointer') || t.includes('hoare')) {
      return `// Option Monad - Compile-time null elimination\ntype Option<T> = { hasValue: true; value: T } | { hasValue: false };\n\nfunction getSessionUser(id: string): Option<User> {\n  const user = database.find(id);\n  return user ? { hasValue: true, value: user } : { hasValue: false };\n}`;
    }
    if (t.includes('rate limit') || t.includes('token bucket') || t.includes('leaky bucket')) {
      return `// Token Bucket Rate Limiter\nclass TokenBucket {\n  private tokens = 100;\n  allowRequest(cost = 1): boolean {\n    this.refill();\n    if (this.tokens < cost) return false;\n    this.tokens -= cost;\n    return true;\n  }\n}`;
    }
    if (t.includes('hash') || t.includes('collision')) {
      return `// Separate Chaining Hash Indexing\nfunction getBucketIndex(key: string, capacity: number): number {\n  const hash = murmur3(key);\n  // Single-cycle bitwise AND replaces expensive modulo\n  return hash & (capacity - 1);\n}`;
    }
    if (t.includes('vector') || t.includes('distributed') || t.includes('causality') || t.includes('clock')) {
      return `// Vector Clock Causality Resolution\nclass VectorClock {\n  private clock = new Map<string, number>();\n  increment(node: string): void {\n    this.clock.set(node, (this.clock.get(node) || 0) + 1);\n  }\n}`;
    }
    if (t.includes('async') || t.includes('event loop') || t.includes('javascript') || t.includes('thread')) {
      return `// Non-blocking concurrency pipeline\nasync function processJobBatch(jobs: Job[]): Promise<Result[]> {\n  return Promise.allSettled(\n    jobs.map(job => executeWithTimeout(job, 3000))\n  );\n}`;
    }
    return `// Optimized Production Architecture\nfunction handleExecution(input: RequestPayload): Response {\n  const validated = validateInputSchema(input);\n  return processIsolatedBoundary(validated);\n}`;
  }

  getTopicMeme(topic = '') {
    const t = String(topic).toLowerCase();
    if (t.includes('null') || t.includes('pointer') || t.includes('hoare')) {
      return {
        type: 'server_on_fire',
        caption: 'UNHANDLED NULLPOINTEREXCEPTION IN PRODUCTION',
        subtext: 'Client apps crashing globally at 3 AM'
      };
    }
    if (t.includes('rate limit') || t.includes('traffic') || t.includes('bucket')) {
      return {
        type: 'server_on_fire',
        caption: 'WHEN TRAFFIC BURSTS 500X WITHOUT A RATE LIMITER',
        subtext: 'Database connection pool instantly starved'
      };
    }
    if (t.includes('distributed') || t.includes('clock') || t.includes('consensus')) {
      return {
        type: 'spiderman_pointing',
        caption: 'SERVERS ARGUING OVER WHICH TRANSACTION CAME FIRST',
        subtext: 'Physical clock drift has entered the chat'
      };
    }
    return {
      type: 'works_on_my_machine',
      caption: 'TESTED ONCE ON LOCALHOST:3000 WITH ZERO LOAD',
      subtext: 'Now running across 50 production Kubernetes pods'
    };
  }

  normalizeAISlides(parsed, strategy) {
    const topic = strategy?.topic || '';
    let rawSlides = [];
    if (Array.isArray(parsed.slides) && parsed.slides.length > 0) {
      rawSlides = parsed.slides.slice(0, 5);
    } else if (Array.isArray(parsed.sections) && parsed.sections.length > 0) {
      rawSlides = parsed.sections.slice(0, 5);
    }

    const defaultTypes = ['history_lore', 'meme', 'dsa_architecture', 'code', 'takeaway'];
    const defaultHeadlines = [
      '01. Origin & Computing Lore',
      '02. The 2 AM Developer Reality',
      '03. Under The Hood: Mental Model',
      '04. Clean Implementation',
      '05. Staff Engineer Golden Rule'
    ];

    // Ensure we always have 5 progressive slides
    while (rawSlides.length < 5) {
      const idx = rawSlides.length;
      rawSlides.push({
        slideNumber: idx + 1,
        type: defaultTypes[idx],
        headline: defaultHeadlines[idx],
        bulletPoints: [`Key engineering insight for ${topic}`, 'Production architectural principle']
      });
    }

    const dsaType = this.getTopicDSAType(topic);
    const codeSnippet = this.getTopicCodeSnippet(topic);
    const memeData = this.getTopicMeme(topic);

    return rawSlides.slice(0, 5).map((slide, idx) => ({
      slideNumber: idx + 1,
      type: defaultTypes[idx],
      headline: (slide.headline && !['question', 'background', 'explanation', 'examples', 'implications'].includes(String(slide.headline).toLowerCase()))
        ? String(slide.headline).trim()
        : (slide.title && !['question', 'background', 'explanation', 'examples', 'implications', 'deep dive', 'real-world examples', 'what this means'].includes(String(slide.title).toLowerCase()))
          ? String(slide.title).trim()
          : defaultHeadlines[idx],
      historicMilestone: slide.historicMilestone || (idx === 0 ? 'COMPUTER SCIENCE LORE' : null),
      meme: (idx === 1) ? (slide.meme && slide.meme.caption ? slide.meme : memeData) : null,
      bulletPoints: Array.isArray(slide.bulletPoints)
        ? slide.bulletPoints.map(b => String(b).trim()).filter(Boolean)
        : (Array.isArray(slide.content) ? slide.content.slice(0, 3).map(c => String(c).trim()) : [String(slide.headline || slide.title || '')]),
      diagram: (idx === 2) ? (slide.diagram && slide.diagram.dsaType ? slide.diagram : {
        title: 'System Mechanics & Data Flow',
        dsaType,
        flowLabel: 'Input -> State Machine -> Execution Engine'
      }) : null,
      codeSnippet: (idx === 3) ? String(slide.codeSnippet && slide.codeSnippet.length > 20 ? slide.codeSnippet : codeSnippet).trim() : '',
      question: slide.question ? String(slide.question).trim() : null,
      teacherNarration: this.ensurePedagogicalNarrationDepth(slide, topic, idx)
    }));
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

  async generateCTA(_strategy) {
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
    if (script.hook) {
      const hookDur = script.hook.duration || '10s';
      const hookText = script.hook.text || script.hook;
      fullScript += `[${hookDur}] HOOK\n${hookText}\n\n`;
    }
    
    // Introduction
    if (script.introduction) {
      const introDur = script.introduction.duration || '15s';
      fullScript += `[${introDur}] INTRODUCTION\n`;
      if (script.introduction.greeting) fullScript += `${script.introduction.greeting}\n`;
      if (script.introduction.topicIntro) fullScript += `${script.introduction.topicIntro}\n`;
      if (script.introduction.valueProposition) fullScript += `${script.introduction.valueProposition}\n`;
      if (script.introduction.credibility) fullScript += `${script.introduction.credibility}\n\n`;
    }
    
    // Main Content
    const sections = (script.mainContent && script.mainContent.sections) || script.sections || [];
    if (sections.length > 0) {
      fullScript += 'MAIN CONTENT\n';
      fullScript += '─'.repeat(30) + '\n\n';
      
      for (const section of sections) {
        const secDuration = section.duration ? this.formatDuration(section.duration) : '30s';
        fullScript += `[${secDuration}] ${(section.title || 'SECTION').toUpperCase()}\n`;
        
        if (Array.isArray(section.content)) {
          section.content.forEach(line => {
            fullScript += `${line}\n`;
          });
        } else if (section.spokenNarration) {
          fullScript += `${section.spokenNarration}\n`;
        } else if (section.steps) {
          section.steps.forEach(step => {
            fullScript += `\n${step.title}\n`;
            fullScript += `${step.description}\n`;
            fullScript += `Tip: ${step.tip}\n`;
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
        } else if (section.content) {
          fullScript += `${section.content}\n`;
        }
        
        if (section.visuals) {
          fullScript += `\n[VISUALS: ${section.visuals.join(', ')}]\n`;
        }
        
        fullScript += '\n';
      }
    }
    
    // Conclusion
    if (script.conclusion) {
      const conclDuration = script.conclusion.duration || '15s';
      fullScript += `[${conclDuration}] CONCLUSION\n`;
      if (Array.isArray(script.conclusion.recap)) {
        script.conclusion.recap.forEach(line => {
          fullScript += `${line}\n`;
        });
      }
      if (script.conclusion.finalThought) {
        fullScript += `\n${script.conclusion.finalThought}\n\n`;
      }
    }
    
    // Call to Action
    if (script.callToAction) {
      const ctaDuration = script.callToAction.duration || '5s';
      fullScript += `[${ctaDuration}] CALL TO ACTION\n`;
      if (script.callToAction.subscribe) fullScript += `${script.callToAction.subscribe}\n`;
      if (script.callToAction.like) fullScript += `${script.callToAction.like}\n`;
      if (script.callToAction.comment) fullScript += `${script.callToAction.comment}\n`;
      if (script.callToAction.nextVideo) fullScript += `${script.callToAction.nextVideo}\n\n`;
    }
    
    // Metadata
    fullScript += '═'.repeat(50) + '\n';
    if (script.duration) fullScript += `ESTIMATED DURATION: ${script.duration}\n`;
    if (script.tone) fullScript += `TONE: ${script.tone}\n`;
    if (script.pacing) fullScript += `PACING: ${script.pacing}\n`;
    if (Array.isArray(script.keywords)) fullScript += `KEYWORDS: ${script.keywords.join(', ')}\n`;
    
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
