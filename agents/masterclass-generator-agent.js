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
        topic: 'Master Docker & Containers from Scratch: Complete 1-to-2 Hour DevOps Bootcamp',
        shortTopic: 'Docker & Containers',
        targetAudience: 'Software engineers, DevOps engineers, cloud architects',
        chapters: [
          { title: '01. Why Containers Exist & Linux Cgroups/Namespaces', keyConcept: 'Process isolation without virtual machine overhead' },
          { title: '02. Docker Engine Architecture: Daemon, CLI, containerd & runc', keyConcept: 'Under the hood runtime and OCI bundle execution' },
          { title: '03. Writing Production Dockerfiles & Multi-Stage Builds', keyConcept: 'Minimizing layer cache and slashing image footprint' },
          { title: '04. Container Networking: Bridge, Host, None & Overlay Networks', keyConcept: 'Packet flow, virtual ethernet pairs & iptables routing' },
          { title: '05. Persistent Data, Docker Volumes & Bind Mounts Deep Dive', keyConcept: 'Stateful database persistence and volume drivers' },
          { title: '06. Multi-Container Orchestration with Docker Compose', keyConcept: 'Declarative microservices, dependencies & health checks' },
          { title: '07. Container Security, Non-Root Users & Read-Only Filesystems', keyConcept: 'Principle of least privilege and container hardening' },
          { title: '08. Logging Drivers, Container Metrics & Resource Limits', keyConcept: 'Preventing OOM killer and configuring log rotation' },
          { title: '09. Image Optimization, Distroless Containers & Vulnerability Scanning', keyConcept: 'Trivy scanning and stripping attack surface' },
          { title: '10. CI/CD Container Pipelines & Automated Registry Pushes', keyConcept: 'GitHub Actions buildx, multi-platform & caching' },
          { title: '11. Production Deployment & Kubernetes Handoff', keyConcept: 'Transitioning from Compose to Pods and Deployments' },
          { title: '12. Real-World Production Architecture Project & Capstone', keyConcept: 'Complete end-to-end multi-tier microservice deployment' }
        ]
      },
      {
        topic: 'Master Java: Core JVM, OOP, Concurrency & Spring Boot Bootcamp',
        shortTopic: 'Java & JVM Internals',
        targetAudience: 'Java developers, backend engineers, computer science students',
        chapters: [
          { title: '01. Java Execution Engine & JVM Memory Architecture', keyConcept: 'Stack, Heap, Metaspace & JIT compilation' },
          { title: '02. ClassLoaders, Bytecode Verification & Class Loading', keyConcept: 'Runtime class loading and class verification' },
          { title: '03. Object-Oriented Design Patterns in Practice: SOLID', keyConcept: 'Polymorphism, SOLID principles & composition' },
          { title: '04. Java Collections Framework & Big-O Internals', keyConcept: 'HashMap buckets, treeification & collision handling' },
          { title: '05. Modern Multithreading: Synchronized, Locks & Virtual Threads', keyConcept: 'Project Loom, carriers & unpinned execution' },
          { title: '06. Garbage Collection Algorithms: G1, ZGC & Shenandoah', keyConcept: 'Zero-pause concurrent marking and memory compaction' },
          { title: '07. Functional Programming & Stream API Under the Hood', keyConcept: 'Spliterators, lazy pipelines & parallel streams' },
          { title: '08. Java Modern I/O: Blocking vs Non-Blocking NIO Buffers', keyConcept: 'Selectors, channels & asynchronous file handling' },
          { title: '09. Building Microservices with Spring Boot & Inversion of Control', keyConcept: 'ApplicationContext, bean lifecycle & auto-configuration' },
          { title: '10. Database Access: Spring Data JPA, Hibernate & N+1 Fixes', keyConcept: 'Dirty checking, first-level cache & fetch strategies' },
          { title: '11. Production Profiling: JFR, Memory Leaks & Thread Dumps', keyConcept: 'Diagnosing latency spikes and thread contention' },
          { title: '12. Real-World Production Microservice Deployment Capstone', keyConcept: 'Containerized Spring Boot service with health metrics' }
        ]
      },
      {
        topic: 'Master Computer Science: Operating Systems, Networks, DBs & Architecture',
        shortTopic: 'Core Computer Science',
        targetAudience: 'Engineers preparing for top tech interviews, self-taught developers',
        chapters: [
          { title: '01. Computer Architecture: CPU Cache Lines & Pipelining', keyConcept: 'L1/L2/L3 cache misses and branch prediction' },
          { title: '02. Operating Systems: Virtual Memory, MMU & Page Tables', keyConcept: 'Page faults, TLB caches & memory translation' },
          { title: '03. Concurrency: Mutexes, Semaphores & Deadlock Detection', keyConcept: 'Race conditions, compare-and-swap & spinlocks' },
          { title: '04. Networking: The TCP/IP Stack, Three-Way Handshake & Flow Control', keyConcept: 'Sliding windows, congestion avoidance & sockets' },
          { title: '05. Web Protocols: HTTP/1.1 vs HTTP/2 vs HTTP/3 (QUIC)', keyConcept: 'Multiplexing, head-of-line blocking & UDP transport' },
          { title: '06. Database Storage Engines: B-Tree Indexing vs LSM Trees', keyConcept: 'Write amplification, SSTables & compaction' },
          { title: '07. Distributed Systems Fundamentals: CAP & PACELC Theorems', keyConcept: 'Network partitions, latency & consistency trade-offs' },
          { title: '08. Distributed Consensus: The Raft Consensus Algorithm', keyConcept: 'Leader election, log replication & heartbeat RPCs' },
          { title: '09. System Design Fundamentals: Consistent Hashing & Sharding', keyConcept: 'Virtual nodes, hash rings & data rebalancing' },
          { title: '10. Compilers & Interpreters: Lexing, Parsing & ASTs', keyConcept: 'Token streams, context-free grammars & bytecode' },
          { title: '11. Cryptography Basics: Asymmetric/Symmetric Keys & TLS', keyConcept: 'Public key exchange, digital certificates & AES' },
          { title: '12. Capstone Project: Building a High-Throughput Key-Value Store', keyConcept: 'End-to-end memory store with WAL persistence' }
        ]
      },
      {
        topic: 'Master Kubernetes: Pods, Services, Ingress & Helm Production Guide',
        shortTopic: 'Kubernetes Production Engineering',
        targetAudience: 'DevOps engineers, cloud platform engineers, site reliability engineers',
        chapters: [
          { title: '01. Kubernetes Control Plane Architecture & Etcd Raft Consensus', keyConcept: 'Declarative reconciliation loops & state store' },
          { title: '02. Pod Lifecycle, Container Runtimes & Worker Kubelets', keyConcept: 'Pod phases, init containers & lifecycle hooks' },
          { title: '03. Health Probes: Startup, Liveness & Readiness at Scale', keyConcept: 'Zero-downtime health probing & traffic redirection' },
          { title: '04. Kubernetes Networking: CNI Plugins & ClusterIP Routing', keyConcept: 'Iptables & IPVS packet flow across worker nodes' },
          { title: '05. Ingress Controllers, Reverse Proxies & Service Meshes', keyConcept: 'Envoy proxies, traffic routing & mTLS encryption' },
          { title: '06. Stateful Workloads: StorageClasses, PVs & StatefulSets', keyConcept: 'Persistent volume claims & stable network IDs' },
          { title: '07. Zero-Downtime Deployments & HPA Autoscaling', keyConcept: 'Rolling updates, maxSurge/maxUnavailable & metrics server' },
          { title: '08. RBAC, SecurityContext & NetworkPolicies Hardening', keyConcept: 'Least privilege service accounts & pod isolation' },
          { title: '09. ConfigMaps, Secrets & External HashiCorp Vault Integration', keyConcept: 'Dynamic secret injection & configuration decoupling' },
          { title: '10. Packaging Microservices with Helm Charts & Templates', keyConcept: 'Values files, DRY manifests & chart repositories' },
          { title: '11. Cluster Observability: Prometheus, Alertmanager & Grafana', keyConcept: 'PromQL queries, scrape configs & cluster alerting' },
          { title: '12. Production Cluster Disaster Recovery & Velero Backups', keyConcept: 'Snapshotting PVs, cluster restore & multi-cluster failover' }
        ]
      },
      {
        topic: 'Master System Design: High-Scale Distributed Architecture Bootcamp',
        shortTopic: 'Distributed Systems & Architecture',
        targetAudience: 'Senior developers, staff engineers, system architects',
        chapters: [
          { title: '01. High-Availability Principles & Load Balancing Algorithms', keyConcept: 'L4 vs L7 load balancing, health checks & sticky sessions' },
          { title: '02. Caching Strategies: Write-Through, Write-Behind & Stampedes', keyConcept: 'Redis clustering, eviction policies & mutex locks' },
          { title: '03. Message Queues vs Event Streams: Kafka vs RabbitMQ', keyConcept: 'Partitioning, consumer groups & offset tracking' },
          { title: '04. Database Partitioning, Sharding & Global Secondary Indexes', keyConcept: 'Cross-shard queries, routing keys & rebalancing' },
          { title: '05. Distributed Transactions: 2-Phase Commit vs Saga Pattern', keyConcept: 'Choreography vs orchestration & compensating events' },
          { title: '06. Rate Limiting, API Gateways & Token Bucket Algorithms', keyConcept: 'Protecting microservices from cascading cascading failures' },
          { title: '07. Distributed Tracing: OpenTelemetry & Trace Propagation', keyConcept: 'Trace IDs, span trees & latency bottleneck isolation' },
          { title: '08. Event-Driven Architecture: Event Sourcing & CQRS Pattern', keyConcept: 'Immutable event logs, materialized read views' },
          { title: '09. Distributed Locks, Leader Election & ZooKeeper/Consul', keyConcept: 'Fencing tokens, lease management & heartbeat TTLs' },
          { title: '10. Disaster Recovery, Multi-Region & Active-Active Failover', keyConcept: 'Cross-region replication, conflict resolution & DNS routing' },
          { title: '11. Zero-Trust Security, Mutual TLS & Distributed JWT Auth', keyConcept: 'Token revocation, cryptographic validation & service mesh' },
          { title: '12. Designing a Real-World Distributed System (Uber/Netflix Scale)', keyConcept: 'End-to-end architecture blueprint from client to datastore' }
        ]
      }
    ];
  }

  async generateMasterclass(requestedTopic = null, maxChapters = null) {
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

    let targetChapters = courseMeta.chapters;
    if (Number.isInteger(maxChapters) && maxChapters > 0) {
      targetChapters = targetChapters.slice(0, maxChapters);
      this.logger.info(`Chapter limit applied: generating ${targetChapters.length} chapters.`);
    }

    const chapters = [];
    let cumulativeSeconds = 0;
    const timestamps = [];

    for (let i = 0; i < targetChapters.length; i++) {
      const ch = targetChapters[i];
      const hours = Math.floor(cumulativeSeconds / 3600);
      const minutes = Math.floor((cumulativeSeconds % 3600) / 60);
      const seconds = cumulativeSeconds % 60;
      const formattedTimestamp = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      
      timestamps.push({
        timestamp: formattedTimestamp,
        title: ch.title,
        keyConcept: ch.keyConcept
      });

      this.logger.info(`Generating Chapter ${i + 1}/${targetChapters.length}: "${ch.title}" [${formattedTimestamp}]`);
      const chapterData = await this.generateChapterContent(courseMeta.topic, ch, i + 1, targetChapters.length);
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
1. SPEAK LIKE A PASSIONATE, REAL HUMAN TEACHER: Talk directly to the student naturally, using warmth, conversational flow, and witty relatable developer humor (e.g. debugging at 2 AM, caffeine-fueled refactors, production outages caused by a missing semicolon).
2. NEVER READ THE SLIDE VERBATIM: The slide text is just a high-level visual anchor. Your job as a teacher is to explain the underlying intuition, why it works, and provide vivid real-world analogies (e.g. comparing distributed locks to a single bathroom key in a busy coffee shop).
3. WALK THROUGH THE SLIDE AND CODE NATURALLY: Guide the viewer's eyes: "Look at the diagram on your screen...", "Notice what's happening right here in the code snippet on line 5...", "See how this variable changes state...".
4. ZERO REPETITION: Do not repeat previous chapter summaries or say the same points multiple times. Dive straight into teaching new insights, practical examples, and production gotchas.
5. REAL-LIFE SCENARIOS & PITFALLS: Walk through an actual production outage or edge-case scenario where engineers get bitten by this, and show how the pattern solves it.
6. IN-DEPTH LECTURE PACING: Deliver a comprehensive, deeply explanatory lecture of 600-800 spoken words for this chapter. Walk through the architectural problem, the code implementation line-by-line, and the senior gotchas to monitor.

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
  "spokenNarration": "Comprehensive 600-800 word spoken lecture delivered naturally by a human teacher explaining the points and code shown on screen."
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
    const narration = `Welcome to chapter ${chapterNumber}. Today we are diving deep into ${chapterMeta.title}. If you take a look at the slide on your screen, our core objective is mastering ${chapterMeta.keyConcept}. Now, why is this architectural concept so critical in modern high-throughput engineering? When junior developers build systems, they frequently assume ideal conditions where resources are abundant and network latencies are negligible. But in real-world production environments, bottlenecks cascade into total service degradation within milliseconds. Think of this mechanism like a traffic interchange in a major city during rush hour. If you don't regulate how packets or execution threads enter the junction, everything grinds to an absolute halt. Look closely at the code snippet on the right side of your screen. Notice on lines 4 through 8 how we decouple the state transition so that threads do not enter contention. Instead of locking shared memory across multiple execution contexts, we isolate the mutable state and use an asynchronous non-blocking pipeline. This single design decision is what separates fragile prototype code from resilient distributed architecture. In production, always monitor your p99 latencies, profile memory allocations before optimizing, and ensure your system fails gracefully under extreme load. Let us take these core insights and advance directly to the next chapter.`;
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
      estimatedSeconds: Math.max(180, Math.ceil((words / 130) * 60))
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
