const { Logger } = require('../utils/logger');
const { AITextService } = require('../utils/ai-text-service');

class MasterclassGeneratorAgent {
  constructor(db, credentials) {
    this.db = db;
    this.credentials = credentials;
    this.logger = new Logger('MasterclassGenerator');
    this.aiTextService = new AITextService(credentials?.credentials || credentials || {});
  }

  async initialize() {
    this.logger.info('Initializing Masterclass Generator Agent...');
    return true;
  }

  getMasterclassCatalog() {
    return [
      {
        topic: 'Master Docker from Scratch: Complete 2-Hour Container & DevOps Bootcamp',
        shortTopic: 'Docker & Containers',
        targetAudience: 'Software engineers, DevOps engineers, cloud architects',
        chapters: [
          { title: '01. Why Containers Exist & Linux Cgroups/Namespaces', keyConcept: 'Isolation without VMs' },
          { title: '02. Docker Architecture: Daemon, CLI, containerd & runc', keyConcept: 'Internal runtime flow' },
          { title: '03. Writing Production Dockerfiles & Multi-Stage Builds', keyConcept: 'Minimizing image size' },
          { title: '04. Container Networking: Bridge, Host & Overlay Networks', keyConcept: 'Inter-container communication' },
          { title: '05. Persistent Data & Docker Volumes Deep Dive', keyConcept: 'Managing database state' },
          { title: '06. Multi-Container Orchestration with Docker Compose', keyConcept: 'Microservices on local dev' },
          { title: '07. Container Security & Rootless Execution', keyConcept: 'Hardening production containers' },
          { title: '08. Production Deployment & Kubernetes Handoff', keyConcept: 'Moving from Docker to K8s' }
        ]
      },
      {
        topic: 'Master Java: Core JVM, OOP, Concurrency & Spring Boot Bootcamp',
        shortTopic: 'Java & JVM Internals',
        targetAudience: 'Java developers, backend engineers, computer science students',
        chapters: [
          { title: '01. Java Execution Engine & JVM Memory Architecture', keyConcept: 'Stack, Heap, Metaspace & JIT' },
          { title: '02. Object-Oriented Design Patterns in Practice', keyConcept: 'Polymorphism, SOLID & composition' },
          { title: '03. Java Collections Framework & Big-O Internals', keyConcept: 'HashMap buckets & treeification' },
          { title: '04. Modern Multithreading & Virtual Threads (Project Loom)', keyConcept: 'Lightweight concurrency' },
          { title: '05. Garbage Collection Algorithms: G1, ZGC & Shenandoah', keyConcept: 'Zero-pause GC tuning' },
          { title: '06. Functional Programming & Stream API Under the Hood', keyConcept: 'Lazy evaluation & pipelines' },
          { title: '07. Building Microservices with Spring Boot & Dependency Injection', keyConcept: 'Inversion of Control' },
          { title: '08. Production Profiling: JFR, Memory Leaks & Thread Dumps', keyConcept: 'Diagnosing production latency' }
        ]
      },
      {
        topic: 'Master Computer Science: Operating Systems, Networks, DBs & Architecture',
        shortTopic: 'Core Computer Science',
        targetAudience: 'Engineers preparing for top tech interviews, self-taught developers',
        chapters: [
          { title: '01. Computer Architecture: CPU Cache Lines & Instruction Pipelining', keyConcept: 'L1/L2/L3 cache misses' },
          { title: '02. Operating Systems: Virtual Memory & Page Tables', keyConcept: 'Page faults & TLB buffers' },
          { title: '03. Concurrency: Mutexes, Semaphores & Deadlock Detection', keyConcept: 'Race conditions & locks' },
          { title: '04. Networking: The TCP/IP Stack, Handshakes & Flow Control', keyConcept: 'Sliding windows & congestion' },
          { title: '05. Database Internals: B-Tree Indexing vs LSM Trees', keyConcept: 'Write amplification & reads' },
          { title: '06. Distributed Systems: Consensus & Raft Algorithm', keyConcept: 'Leader election & log replication' },
          { title: '07. System Design: Caching, Sharding & Consistent Hashing', keyConcept: 'Horizontal scalability' },
          { title: '08. Compilers & Interpreters: Lexing, Parsing & ASTs', keyConcept: 'How code turns to machine code' }
        ]
      },
      {
        topic: 'Master Kubernetes: Pods, Services, Ingress & Helm Production Guide',
        shortTopic: 'Kubernetes Production Engineering',
        targetAudience: 'DevOps engineers, cloud platform engineers, site reliability engineers',
        chapters: [
          { title: '01. Kubernetes Control Plane & Etcd Raft Consensus', keyConcept: 'Declarative reconciliation loop' },
          { title: '02. Pod Lifecycle, Container Runtimes & Health Probes', keyConcept: 'Startup, liveness & readiness' },
          { title: '03. Kubernetes Networking: CNI Plugins & ClusterIP Routing', keyConcept: 'Iptables & IPVS packet flow' },
          { title: '04. Ingress Controllers & Service Meshes (Istio / Envoy)', keyConcept: 'Traffic routing & mTLS' },
          { title: '05. Storage: StorageClasses, PVs & StatefulSets', keyConcept: 'Managing stateful workloads' },
          { title: '06. Zero-Downtime Deployments & HPA Autoscaling', keyConcept: 'Rolling updates & metrics server' },
          { title: '07. Packaging Microservices with Helm Charts', keyConcept: 'Templating production manifests' },
          { title: '08. Cluster Observability, Prometheus & Disaster Recovery', keyConcept: 'Monitoring & backup strategies' }
        ]
      },
      {
        topic: 'Master System Design: High-Scale Distributed Architecture Bootcamp',
        shortTopic: 'Distributed Systems & Architecture',
        targetAudience: 'Senior developers, staff engineers, system architects',
        chapters: [
          { title: '01. High-Availability Principles & Load Balancing Algorithms', keyConcept: 'L4 vs L7 load balancing' },
          { title: '02. Caching Strategies: Write-Through, Write-Behind & Cache Stampedes', keyConcept: 'Redis clustering & invalidation' },
          { title: '03. Message Queues vs Event Streams: Kafka vs RabbitMQ', keyConcept: 'Partitioning & consumer groups' },
          { title: '04. Database Partitioning, Sharding & Global Secondary Indexes', keyConcept: 'Cross-shard queries & rebalancing' },
          { title: '05. ACID Transactions, 2-Phase Commit & Saga Pattern', keyConcept: 'Distributed transaction management' },
          { title: '06. Rate Limiting, API Gateways & Token Bucket Algorithms', keyConcept: 'Protecting downstream microservices' },
          { title: '07. Observability: Distributed Tracing with OpenTelemetry', keyConcept: 'Trace IDs & span propagation' },
          { title: '08. Designing a Real-World Distributed System (Uber/Netflix Scale)', keyConcept: 'End-to-end architecture diagram' }
        ]
      }
    ];
  }

  async generateMasterclass(requestedTopic = null) {
    this.logger.info(`Starting Masterclass curriculum generation...`);
    const catalog = this.getMasterclassCatalog();
    let courseMeta = null;

    if (requestedTopic) {
      courseMeta = catalog.find(c => c.topic.toLowerCase().includes(requestedTopic.toLowerCase()) || c.shortTopic.toLowerCase().includes(requestedTopic.toLowerCase()));
    }

    if (!courseMeta) {
      courseMeta = catalog[Math.floor(Math.random() * catalog.length)];
    }

    this.logger.info(`Selected Masterclass: "${courseMeta.topic}"`);

    const chapters = [];
    let cumulativeSeconds = 0;
    const timestamps = [];

    for (let i = 0; i < courseMeta.chapters.length; i++) {
      const ch = courseMeta.chapters[i];
      const hours = Math.floor(cumulativeSeconds / 3600);
      const minutes = Math.floor((cumulativeSeconds % 3600) / 60);
      const seconds = cumulativeSeconds % 60;
      const formattedTimestamp = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      
      timestamps.push({
        timestamp: formattedTimestamp,
        title: ch.title,
        keyConcept: ch.keyConcept
      });

      this.logger.info(`Generating Chapter ${i + 1}/${courseMeta.chapters.length}: "${ch.title}" [${formattedTimestamp}]`);
      const chapterData = await this.generateChapterContent(courseMeta.topic, ch, i + 1, courseMeta.chapters.length);
      chapters.push(chapterData);
      cumulativeSeconds += chapterData.estimatedSeconds;
    }

    const totalHours = (cumulativeSeconds / 3600).toFixed(1);
    this.logger.info(`Masterclass complete: ${chapters.length} chapters, estimated runtime ~${totalHours} hours`);

    return {
      title: courseMeta.topic,
      shortTopic: courseMeta.shortTopic,
      targetAudience: courseMeta.targetAudience,
      chapters,
      timestamps,
      totalEstimatedSeconds: cumulativeSeconds,
      formattedDuration: `${Math.floor(cumulativeSeconds / 3600)}h ${Math.floor((cumulativeSeconds % 3600) / 60)}m`,
      createdAt: new Date().toISOString()
    };
  }

  async generateChapterContent(courseTitle, chapterMeta, chapterNumber, totalChapters) {
    if (this.aiTextService.isAvailable()) {
      try {
        const prompt = `You are a Principal Software Architect and renowned university CS professor teaching a masterclass titled: "${courseTitle}".
You are writing CHAPTER ${chapterNumber} of ${totalChapters}: "${chapterMeta.title}" (Core Concept: ${chapterMeta.keyConcept}).

CRITICAL INSTRUCTIONS FOR NATURAL TEACHER NARRATION:
1. SPEAK LIKE A REAL HUMAN INSTRUCTOR: Speak warmly, conversationally, and authoritatively to the student.
2. REFER DIRECTLY TO THE SLIDE: Explicitly guide the viewer's eyes: "As you can see highlighted in the first section of your screen...", "Take a look at line 4 of this code snippet...", "Notice the arrow pointing from the client to the proxy..."
3. DO NOT JUST READ THE SLIDE VERBATIM: Expand on the intuition! Give real-world engineering analogies (e.g. comparing cache invalidation to updating printed restaurant menus).
4. EXPLAIN WHY & GOTCHAS: Explain why this concept was designed this way, and warn about common senior-level production bugs.

Return ONLY valid JSON with this exact shape:
{
  "chapterTitle": "${chapterMeta.title}",
  "slideHeadline": "clear slide header under 60 chars",
  "slideBullets": [
    "Key architectural takeaway 1",
    "Key architectural takeaway 2",
    "Key architectural takeaway 3"
  ],
  "codeSnippet": "realistic code, command, or config block (10-18 lines)",
  "spokenNarration": "Comprehensive 350-500 word spoken lecture delivered naturally by a human teacher explaining the points and code shown on screen."
}`;

        const raw = await this.aiTextService.generateText(prompt, { maxTokens: 2500, temperature: 0.65 });
        const parsed = JSON.parse(raw.replace(/^```json/i, '').replace(/```$/, '').trim());

        const words = (parsed.spokenNarration || '').split(/\s+/).length;
        const estimatedSeconds = Math.max(120, Math.ceil((words / 130) * 60));

        return {
          chapterNumber,
          title: parsed.chapterTitle || chapterMeta.title,
          slideHeadline: parsed.slideHeadline || chapterMeta.title,
          slideBullets: parsed.slideBullets || [chapterMeta.keyConcept],
          codeSnippet: parsed.codeSnippet || '// Production Implementation Code',
          spokenNarration: parsed.spokenNarration,
          estimatedSeconds
        };
      } catch (err) {
        this.logger.warn(`AI chapter generation error for "${chapterMeta.title}": ${err.message}. Using structured pedagogical fallback.`);
      }
    }

    // High quality pedagogical fallback
    const narration = `Welcome to chapter ${chapterNumber}. Today we are diving into ${chapterMeta.title}. If you take a look at the slide on your screen, our core focus is understanding ${chapterMeta.keyConcept}. Now, why is this so critical in production systems? When you are building software at scale, standard naive implementations quickly encounter bottlenecks. Notice the code example shown on the right side of your screen. Notice how we decouple the state transition so that threads do not enter contention. In real-world enterprise infrastructure, this single design choice prevents cascading failures during traffic surges. Remember: write code that fails gracefully, measure your benchmarks, and keep your abstractions clean. Let's move on to the next section.`;
    const words = narration.split(/\s+/).length;
    return {
      chapterNumber,
      title: chapterMeta.title,
      slideHeadline: chapterMeta.title,
      slideBullets: [
        `Under-the-hood mechanism: ${chapterMeta.keyConcept}`,
        'Decoupling state transitions to eliminate contention',
        'Production benchmarking and graceful failure modes'
      ],
      codeSnippet: `// Production Pattern: ${chapterMeta.keyConcept}\npublic class ArchitectureModule {\n    private final MetricsRegistry registry;\n\n    public void executeStep() {\n        // Optimized non-blocking execution path\n        processConcurrently();\n    }\n}`,
      spokenNarration: narration,
      estimatedSeconds: Math.ceil((words / 130) * 60)
    };
  }

  formatYouTubeDescription(course) {
    let desc = `Master ${course.shortTopic} in this comprehensive, production-grade masterclass! 🎓\n\n`;
    desc += `Designed for software engineers, DevOps professionals, and computer science students. Learn end-to-end architectural concepts, live code walkthroughs, and production best practices explained naturally with clear diagrams and code snippets.\n\n`;
    desc += `⏱️ CHAPTER TIMESTAMPS:\n`;
    for (const item of course.timestamps) {
      desc += `${item.timestamp} - ${item.title}\n`;
    }
    desc += `\n💡 What you'll learn:\n`;
    for (const ch of course.chapters.slice(0, 5)) {
      desc += `• ${ch.title}\n`;
    }
    desc += `\n#${course.shortTopic.replace(/[^a-zA-Z0-9]/g, '')} #Programming #ComputerScience #SoftwareEngineering #DevOps #Masterclass #Tutorial`;
    return desc;
  }
}

module.exports = { MasterclassGeneratorAgent };
