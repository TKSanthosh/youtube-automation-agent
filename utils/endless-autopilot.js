const { Logger } = require('./logger');
const { StorageManager } = require('./storage-manager');
const { GoogleDriveService } = require('./google-drive-service');

class EndlessAutoPilot {
  constructor(options = {}, db = null) {
    this.options = options;
    this.db = db;
    this.logger = new Logger('EndlessAutoPilot');
    this.storageManager = new StorageManager(db);
    this.googleDrive = new GoogleDriveService();
    this.isRunning = false;
    this.isPausedForRateLimit = false;
    this.isPausedForUploadLimit = false;
    this.pingIntervalMs = options.pingIntervalMs || 30000;
    
    this.sessionStats = {
      videosGenerated: 0,
      extendedVideosGenerated: 0,
      longVideosGenerated: 0,
      shortsGenerated: 0,
      videosPublished: 0,
      storageFreedMb: 0,
      errorsEncountered: 0
    };

    // Massive curated topic catalog — 200+ unique topics across IT/DevOps/Cloud/System Design
    // Organized by category for balanced variety
    this.curatedTopics = [
      // === Docker & Containers ===
      { topic: "Docker Multi-Stage Builds: Slash Container Image Sizes by 90%", tech: 'docker', category: 'Docker' },
      { topic: "Docker Networking Deep Dive: Bridge, Host, Overlay and Macvlan", tech: 'docker', category: 'Docker' },
      { topic: "Docker Compose vs Docker Swarm vs Kubernetes: When To Use What", tech: 'docker', category: 'Docker' },
      { topic: "Docker Security: Running Containers as Non-Root and Seccomp Profiles", tech: 'docker', category: 'Docker' },
      { topic: "Docker BuildKit Caching Strategies That Cut CI/CD Time in Half", tech: 'docker', category: 'Docker' },
      { topic: "Docker Volumes vs Bind Mounts vs tmpfs: Storage Deep Dive", tech: 'docker', category: 'Docker' },
      { topic: "Dockerfile Best Practices: Layer Caching, .dockerignore and HEALTHCHECK", tech: 'docker', category: 'Docker' },
      { topic: "Docker Init Processes and Signal Handling: Why PID 1 Matters", tech: 'docker', category: 'Docker' },

      // === Kubernetes ===
      { topic: "Kubernetes Pod Lifecycle: Init Containers, Sidecars and Graceful Shutdown", tech: 'k8s', category: 'Kubernetes' },
      { topic: "Kubernetes Ingress vs Gateway API: The Future of Traffic Routing", tech: 'k8s', category: 'Kubernetes' },
      { topic: "Kubernetes RBAC: ClusterRoles, ServiceAccounts and Least Privilege", tech: 'k8s', category: 'Kubernetes' },
      { topic: "Kubernetes HPA vs VPA vs KEDA: Autoscaling Deep Dive", tech: 'k8s', category: 'Kubernetes' },
      { topic: "Kubernetes Network Policies: Zero Trust Pod-to-Pod Communication", tech: 'k8s', category: 'Kubernetes' },
      { topic: "Kubernetes ConfigMaps and Secrets Management Best Practices", tech: 'k8s', category: 'Kubernetes' },
      { topic: "Kubernetes StatefulSets: Running Databases and Stateful Apps", tech: 'k8s', category: 'Kubernetes' },
      { topic: "Kubernetes Service Mesh: Istio vs Linkerd Architecture Comparison", tech: 'k8s', category: 'Kubernetes' },
      { topic: "Kubernetes Resource Requests vs Limits: CPU Throttling Explained", tech: 'k8s', category: 'Kubernetes' },
      { topic: "Kubernetes Rolling Updates vs Blue-Green vs Canary Deployments", tech: 'k8s', category: 'Kubernetes' },
      { topic: "Helm Charts: Templating, Values Files and Chart Dependencies", tech: 'k8s', category: 'Kubernetes' },
      { topic: "Kubernetes CRDs and Operators: Extending the Control Plane", tech: 'k8s', category: 'Kubernetes' },

      // === System Design ===
      { topic: "CAP Theorem Explained: Consistency vs Availability in Distributed Systems", tech: 'sysdesign', category: 'System Design' },
      { topic: "Load Balancing Algorithms: Round Robin, Least Connections and Consistent Hashing", tech: 'sysdesign', category: 'System Design' },
      { topic: "Database Sharding Strategies: Range vs Hash vs Directory-Based", tech: 'sysdesign', category: 'System Design' },
      { topic: "Event Sourcing vs CQRS: When and How to Use Them Together", tech: 'sysdesign', category: 'System Design' },
      { topic: "Rate Limiting: Token Bucket, Leaky Bucket and Sliding Window Algorithms", tech: 'sysdesign', category: 'System Design' },
      { topic: "Circuit Breaker Pattern: Building Fault-Tolerant Microservices", tech: 'sysdesign', category: 'System Design' },
      { topic: "Saga Pattern: Managing Distributed Transactions Without 2PC", tech: 'sysdesign', category: 'System Design' },
      { topic: "API Gateway vs Reverse Proxy vs Load Balancer: The Differences", tech: 'sysdesign', category: 'System Design' },
      { topic: "Idempotency in APIs: Why It Matters and How to Implement It", tech: 'sysdesign', category: 'System Design' },
      { topic: "Back Pressure: Preventing Service Overload in Event-Driven Systems", tech: 'sysdesign', category: 'System Design' },
      { topic: "Distributed Consensus: Raft vs Paxos Explained Simply", tech: 'sysdesign', category: 'System Design' },
      { topic: "Bloom Filters: Probabilistic Data Structures for Massive Scale", tech: 'sysdesign', category: 'System Design' },

      // === Databases ===
      { topic: "PostgreSQL vs MySQL: Architecture Differences That Actually Matter", tech: 'database', category: 'Databases' },
      { topic: "SQL Indexing: B-Tree, Hash and GIN Indexes Under the Hood", tech: 'database', category: 'Databases' },
      { topic: "Database Connection Pooling: PgBouncer, HikariCP and Why It Matters", tech: 'database', category: 'Databases' },
      { topic: "Redis Data Structures: Sorted Sets, Streams and HyperLogLog", tech: 'database', category: 'Databases' },
      { topic: "MongoDB Aggregation Pipeline: Group, Lookup and Window Functions", tech: 'database', category: 'Databases' },
      { topic: "Database Transactions: ACID Properties and Isolation Levels Explained", tech: 'database', category: 'Databases' },
      { topic: "Write-Ahead Logging: How Databases Guarantee Durability", tech: 'database', category: 'Databases' },
      { topic: "SQL Query Optimization: EXPLAIN ANALYZE and Query Planning", tech: 'database', category: 'Databases' },
      { topic: "NoSQL vs SQL: When To Choose Document, Key-Value or Graph", tech: 'database', category: 'Databases' },
      { topic: "Database Replication: Master-Slave, Multi-Master and Quorum Writes", tech: 'database', category: 'Databases' },

      // === Messaging & Streaming ===
      { topic: "Apache Kafka Architecture: Partitions, Consumer Groups and Offset Management", tech: 'kafka', category: 'Messaging' },
      { topic: "RabbitMQ vs Kafka vs Redis Pub/Sub: Message Broker Comparison", tech: 'messaging', category: 'Messaging' },
      { topic: "Kafka Exactly-Once Semantics: Idempotent Producers and Transactions", tech: 'kafka', category: 'Messaging' },
      { topic: "Event-Driven Architecture: Choreography vs Orchestration", tech: 'architecture', category: 'Messaging' },
      { topic: "Apache Pulsar vs Kafka: Multi-Tenancy and Tiered Storage", tech: 'messaging', category: 'Messaging' },
      { topic: "Dead Letter Queues: Handling Failed Messages in Production", tech: 'messaging', category: 'Messaging' },

      // === CI/CD & DevOps ===
      { topic: "GitHub Actions: Building Production-Grade CI/CD Pipelines", tech: 'devops', category: 'CI/CD' },
      { topic: "GitOps with ArgoCD: Declarative Kubernetes Deployments", tech: 'devops', category: 'CI/CD' },
      { topic: "Terraform vs Pulumi vs CloudFormation: IaC Tool Comparison", tech: 'devops', category: 'CI/CD' },
      { topic: "Feature Flags: Trunk-Based Development and Progressive Rollouts", tech: 'devops', category: 'CI/CD' },
      { topic: "Trunk-Based Development vs GitFlow: Branching Strategies That Scale", tech: 'devops', category: 'CI/CD' },
      { topic: "Container Image Scanning: Trivy, Snyk and CVE Detection in CI", tech: 'devops', category: 'CI/CD' },
      { topic: "Ansible vs Terraform: Configuration Management vs Infrastructure as Code", tech: 'devops', category: 'CI/CD' },

      // === Monitoring & Observability ===
      { topic: "Prometheus Metrics: Counters, Gauges, Histograms and PromQL", tech: 'monitoring', category: 'Observability' },
      { topic: "Distributed Tracing with OpenTelemetry: Spans, Traces and Context Propagation", tech: 'monitoring', category: 'Observability' },
      { topic: "Grafana Dashboard Design: Best Practices for SRE Teams", tech: 'monitoring', category: 'Observability' },
      { topic: "ELK Stack vs Loki vs Datadog: Log Management Architecture", tech: 'monitoring', category: 'Observability' },
      { topic: "SLOs, SLIs and Error Budgets: Site Reliability Engineering Fundamentals", tech: 'monitoring', category: 'Observability' },
      { topic: "Alerting Best Practices: Reducing Alert Fatigue and On-Call Burnout", tech: 'monitoring', category: 'Observability' },

      // === Networking & Security ===
      { topic: "TLS Handshake Explained: How HTTPS Actually Works Step by Step", tech: 'networking', category: 'Networking' },
      { topic: "DNS Resolution: Recursive vs Iterative Queries and DNS Caching", tech: 'networking', category: 'Networking' },
      { topic: "OAuth 2.0 vs OpenID Connect: Authentication and Authorization Flows", tech: 'security', category: 'Security' },
      { topic: "JWT Tokens: Structure, Signing Algorithms and Common Vulnerabilities", tech: 'security', category: 'Security' },
      { topic: "CORS Explained: Why Browsers Block Requests and How to Fix It", tech: 'security', category: 'Security' },
      { topic: "Zero Trust Architecture: Never Trust, Always Verify", tech: 'security', category: 'Security' },
      { topic: "API Security: SQL Injection, XSS and CSRF Prevention Strategies", tech: 'security', category: 'Security' },
      { topic: "mTLS: Mutual TLS Authentication in Microservices", tech: 'security', category: 'Security' },
      { topic: "HTTP/2 vs HTTP/3 vs WebSockets: Modern Protocol Comparison", tech: 'networking', category: 'Networking' },
      { topic: "gRPC vs REST vs GraphQL: Choosing the Right API Protocol", tech: 'networking', category: 'Networking' },

      // === Cloud Services ===
      { topic: "AWS Lambda Cold Starts: Causes, Measurement and Optimization", tech: 'cloud', category: 'Cloud' },
      { topic: "AWS S3 Storage Classes: Standard, Glacier and Intelligent Tiering", tech: 'cloud', category: 'Cloud' },
      { topic: "AWS VPC: Subnets, NAT Gateways and Security Groups Deep Dive", tech: 'cloud', category: 'Cloud' },
      { topic: "Cloud-Native Patterns: 12-Factor Apps and Beyond", tech: 'cloud', category: 'Cloud' },
      { topic: "Serverless vs Containers: Cost, Scale and Cold Start Tradeoffs", tech: 'cloud', category: 'Cloud' },
      { topic: "CDN Architecture: Edge Caching, Cache Invalidation and PoP Networks", tech: 'cloud', category: 'Cloud' },
      { topic: "Multi-Cloud Strategy: Avoiding Vendor Lock-In Without Losing Efficiency", tech: 'cloud', category: 'Cloud' },

      // === Linux & OS ===
      { topic: "Linux Process Management: Fork, Exec, Zombie and Orphan Processes", tech: 'linux', category: 'Linux' },
      { topic: "Linux File Permissions: chmod, chown, SUID, SGID and Sticky Bit", tech: 'linux', category: 'Linux' },
      { topic: "Linux Memory Management: Virtual Memory, Page Tables and OOM Killer", tech: 'linux', category: 'Linux' },
      { topic: "Linux Namespaces and Cgroups: How Containers Actually Work", tech: 'linux', category: 'Linux' },
      { topic: "systemd Deep Dive: Units, Targets, Timers and Journal Logging", tech: 'linux', category: 'Linux' },
      { topic: "iptables and nftables: Linux Firewall and Packet Filtering", tech: 'linux', category: 'Linux' },
      { topic: "Bash Scripting: Error Handling, Traps and Production-Grade Scripts", tech: 'linux', category: 'Linux' },
      { topic: "Linux Disk I/O: iostat, blktrace and SSD vs HDD Performance", tech: 'linux', category: 'Linux' },

      // === Programming Concepts ===
      { topic: "Big O Notation: Time and Space Complexity Made Simple", tech: 'cs', category: 'Computer Science' },
      { topic: "Hash Tables Under the Hood: Collision Resolution and Load Factor", tech: 'cs', category: 'Computer Science' },
      { topic: "Graph Algorithms: BFS, DFS, Dijkstra and Topological Sort", tech: 'cs', category: 'Computer Science' },
      { topic: "Dynamic Programming: Memoization vs Tabulation with Examples", tech: 'cs', category: 'Computer Science' },
      { topic: "Concurrency vs Parallelism: Threads, Coroutines and Green Threads", tech: 'cs', category: 'Computer Science' },
      { topic: "Garbage Collection Algorithms: Mark-Sweep, Generational and ZGC", tech: 'cs', category: 'Computer Science' },
      { topic: "Binary Search Trees, AVL Trees and Red-Black Trees Compared", tech: 'cs', category: 'Computer Science' },
      { topic: "Tries and Suffix Trees: Efficient String Search Data Structures", tech: 'cs', category: 'Computer Science' },
      { topic: "Lock-Free Data Structures: CAS Operations and ABA Problem", tech: 'cs', category: 'Computer Science' },
      { topic: "Heap Data Structure: Min-Heap, Max-Heap and Priority Queues", tech: 'cs', category: 'Computer Science' },

      // === Node.js / JavaScript ===
      { topic: "Node.js Event Loop: Phases, Microtasks and Process.nextTick", tech: 'nodejs', category: 'Node.js' },
      { topic: "Node.js Streams: Readable, Writable, Transform and Backpressure", tech: 'nodejs', category: 'Node.js' },
      { topic: "Node.js Worker Threads vs Cluster Module for CPU-Bound Tasks", tech: 'nodejs', category: 'Node.js' },
      { topic: "JavaScript Closures and Lexical Scope: The Mental Model", tech: 'javascript', category: 'JavaScript' },
      { topic: "JavaScript Promises, Async/Await and the Microtask Queue", tech: 'javascript', category: 'JavaScript' },
      { topic: "V8 Engine Internals: Hidden Classes, Inline Caching and JIT Compilation", tech: 'javascript', category: 'JavaScript' },
      { topic: "TypeScript Discriminated Unions and Exhaustive Type Checking", tech: 'typescript', category: 'TypeScript' },
      { topic: "TypeScript Conditional Types and Mapped Types Deep Dive", tech: 'typescript', category: 'TypeScript' },

      // === Python ===
      { topic: "Python Decorators and Metaclasses: Metaprogramming Deep Dive", tech: 'python', category: 'Python' },
      { topic: "Python Generators and Iterators: Lazy Evaluation for Big Data", tech: 'python', category: 'Python' },
      { topic: "Python Type Hints: Protocol Classes, Generics and Runtime Checking", tech: 'python', category: 'Python' },
      { topic: "FastAPI vs Django vs Flask: Python Web Framework Comparison", tech: 'python', category: 'Python' },
      { topic: "Python Multiprocessing: SharedMemory, Pool and IPC Patterns", tech: 'python', category: 'Python' },
      { topic: "Python Dataclasses vs Pydantic vs attrs: Data Validation Compared", tech: 'python', category: 'Python' },

      // === Java ===
      { topic: "Java Virtual Threads: Project Loom and Structured Concurrency", tech: 'java', category: 'Java' },
      { topic: "JVM Garbage Collection: G1GC, ZGC and Shenandoah Tuning", tech: 'java', category: 'Java' },
      { topic: "Java Records, Sealed Classes and Pattern Matching in Modern Java", tech: 'java', category: 'Java' },
      { topic: "Spring Boot Actuator: Health Checks, Metrics and Production Readiness", tech: 'java', category: 'Java' },
      { topic: "Java Memory Model: Happens-Before, Volatile and Memory Barriers", tech: 'java', category: 'Java' },
      { topic: "JVM ClassLoading: Bootstrap, Extension and Application ClassLoaders", tech: 'java', category: 'Java' },

      // === Go ===
      { topic: "Go Goroutines and Channels: CSP Concurrency Model Explained", tech: 'go', category: 'Go' },
      { topic: "Go Interfaces: Duck Typing, Embedding and the Empty Interface", tech: 'go', category: 'Go' },
      { topic: "Go Memory Management: Stack vs Heap Allocation and Escape Analysis", tech: 'go', category: 'Go' },
      { topic: "Go Error Handling: errors.Is, errors.As and Custom Error Types", tech: 'go', category: 'Go' },

      // === Rust ===
      { topic: "Rust Ownership and Borrowing: Memory Safety Without Garbage Collection", tech: 'rust', category: 'Rust' },
      { topic: "Rust Lifetimes Explained: Why the Borrow Checker Complains", tech: 'rust', category: 'Rust' },
      { topic: "Rust Async/Await: Tokio Runtime and Pinning Futures", tech: 'rust', category: 'Rust' },
      { topic: "Rust Traits vs Go Interfaces vs Java Interfaces: Design Comparison", tech: 'rust', category: 'Rust' },

      // === AI/ML ===
      { topic: "Transformer Architecture: Self-Attention and Multi-Head Attention Explained", tech: 'ai', category: 'AI/ML' },
      { topic: "Vector Databases: HNSW, IVF and Similarity Search at Scale", tech: 'ai', category: 'AI/ML' },
      { topic: "RAG Architecture: Retrieval Augmented Generation Pipeline Design", tech: 'ai', category: 'AI/ML' },
      { topic: "LLM Tokenization: BPE, WordPiece and SentencePiece Algorithms", tech: 'ai', category: 'AI/ML' },
      { topic: "Gradient Descent: SGD, Adam and Learning Rate Schedules", tech: 'ai', category: 'AI/ML' },
      { topic: "CNN Architecture: Convolutions, Pooling and Feature Maps Visualized", tech: 'ai', category: 'AI/ML' },
      { topic: "Fine-Tuning LLMs: LoRA, QLoRA and Parameter-Efficient Training", tech: 'ai', category: 'AI/ML' },
      { topic: "Embedding Models: Word2Vec, GloVe and Sentence Transformers", tech: 'ai', category: 'AI/ML' },

      // === Architecture Patterns ===
      { topic: "Microservices vs Monolith vs Modular Monolith: Architecture Tradeoffs", tech: 'architecture', category: 'Architecture' },
      { topic: "Domain-Driven Design: Bounded Contexts, Aggregates and Value Objects", tech: 'architecture', category: 'Architecture' },
      { topic: "Hexagonal Architecture: Ports and Adapters Pattern Explained", tech: 'architecture', category: 'Architecture' },
      { topic: "Clean Architecture: Dependency Rule and Layer Boundaries", tech: 'architecture', category: 'Architecture' },
      { topic: "Strangler Fig Pattern: Migrating Legacy Systems Safely", tech: 'architecture', category: 'Architecture' },
      { topic: "BFF Pattern: Backend for Frontend in Microservices", tech: 'architecture', category: 'Architecture' },

      // === Git & Version Control ===
      { topic: "Git Internals: Blobs, Trees, Commits and the Object Store", tech: 'git', category: 'Git' },
      { topic: "Git Rebase vs Merge: Interactive Rebase and Squash Strategies", tech: 'git', category: 'Git' },
      { topic: "Git Bisect: Finding Bugs with Binary Search", tech: 'git', category: 'Git' },
      { topic: "Git Worktrees: Work on Multiple Branches Simultaneously", tech: 'git', category: 'Git' },

      // === Testing ===
      { topic: "Unit Testing vs Integration Testing vs E2E: The Testing Pyramid", tech: 'testing', category: 'Testing' },
      { topic: "Chaos Engineering: Principles, Netflix Simian Army and LitmusChaos", tech: 'testing', category: 'Testing' },
      { topic: "Load Testing with k6: Ramping VUs, Thresholds and CI Integration", tech: 'testing', category: 'Testing' },
      { topic: "Contract Testing with Pact: Consumer-Driven API Testing", tech: 'testing', category: 'Testing' },

      // === Web Performance ===
      { topic: "Web Vitals: LCP, FID, CLS and Core Web Vitals Optimization", tech: 'web', category: 'Web' },
      { topic: "HTTP Caching: Cache-Control, ETag, and CDN Cache Invalidation", tech: 'web', category: 'Web' },
      { topic: "WebAssembly: Running C++ and Rust in the Browser", tech: 'web', category: 'Web' },
      { topic: "Server-Sent Events vs WebSockets vs Long Polling: Real-Time Comparison", tech: 'web', category: 'Web' },

      // === Caching ===
      { topic: "Caching Strategies: Write-Through, Write-Behind, Read-Through and Cache-Aside", tech: 'caching', category: 'Caching' },
      { topic: "Cache Invalidation: The Hardest Problem in Computer Science", tech: 'caching', category: 'Caching' },
      { topic: "Redis Cluster: Sharding, Replication and High Availability", tech: 'caching', category: 'Caching' },
      { topic: "Memcached vs Redis: When Simple Caching Beats Feature-Rich", tech: 'caching', category: 'Caching' }
    ];

    // Shuffle topics for variety (Fisher-Yates)
    for (let i = this.curatedTopics.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.curatedTopics[i], this.curatedTopics[j]] = [this.curatedTopics[j], this.curatedTopics[i]];
    }
  }

  async getAlreadyPublishedTopics() {
    if (!this.db) return new Set();
    try {
      const rows = await this.db.getAllRows(
        "SELECT DISTINCT topic FROM content_strategies ORDER BY created_at DESC LIMIT 500"
      );
      return new Set((rows || []).map(r => r.topic).filter(Boolean));
    } catch (_e) {
      return new Set();
    }
  }

  async getNextTarget() {
    const publishedTopics = await this.getAlreadyPublishedTopics();
    
    // Find first topic not yet produced
    let topicItem = null;
    for (const candidate of this.curatedTopics) {
      if (!publishedTopics.has(candidate.topic)) {
        topicItem = candidate;
        break;
      }
    }

    // If all topics exhausted, let AI generate a fresh one
    if (!topicItem) {
      this.logger.info('All curated topics covered! Letting AI generate a fresh topic.');
      return {
        topic: null, // null = let ContentStrategyAgent pick via AI
        tech: 'ai-selected',
        category: 'AI Selected',
        length: 'short',
        label: '⚡ 2-3 Min Fast Tech Short (9:16 Vertical)',
        isWidescreen: false
      };
    }

    // All autopilot runs are Shorts only (per user directive)
    return {
      topic: topicItem.topic,
      tech: topicItem.tech,
      category: topicItem.category,
      length: 'short',
      label: '⚡ 2-3 Min Fast Tech Short (9:16 Vertical)',
      isWidescreen: false
    };
  }

  async start(mainAgent, publishingAgent) {
    if (this.isRunning) {
      this.logger.warn('Endless Auto-Pilot is already active!');
      return;
    }

    this.isRunning = true;
    this.logger.info('🚀 Starting Endless Auto-Pilot (SHORTS ONLY + Dedup Guard + 160+ Topics)...');

    // Run parallel generation loop and uploader worker
    this.runGenerationLoop(mainAgent);
    this.runUploaderWorker(publishingAgent);
  }

  stop() {
    this.isRunning = false;
    this.logger.info('🛑 Stopping Endless Auto-Pilot...');
  }

  async runGenerationLoop(mainAgent) {
    while (this.isRunning) {
      try {
        if (this.isPausedForRateLimit || this.isPausedForUploadLimit) {
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }

        // Check storage before generating
        const storage = await this.storageManager.getStorageUsage();
        this.logger.info(`   💾 Storage: ${storage.usedGb} GB / ${storage.maxGb} GB (${storage.percent}%)`);

        if (storage.isNearLimit) {
          this.logger.warn('Storage near 10GB limit. Cleaning uploaded assets...');
          await this.storageManager.cleanUploadedVideos();
        }

        const target = await this.getNextTarget();
        this.logger.info(`🎬 [Auto-Pilot Generator] Starting cycle #${this.sessionStats.videosGenerated + 1}...`);
        this.logger.info(`   Target: ${target.label} - "${target.topic || 'AI-selected fresh topic'}"`);

        if (mainAgent) {
          const genOptions = {
            style: 'tutorial',
            length: target.length,
            autoApprove: true,
            targetAudience: 'Software engineers and computer science students'
          };
          // Only pass topic if we have one; otherwise let AI pick
          if (target.topic) {
            genOptions.topic = target.topic;
          }

          const result = await mainAgent.generateContent(genOptions);

          this.sessionStats.videosGenerated++;
          this.sessionStats.shortsGenerated++;

          this.logger.info(`✅ [Generator] Successfully produced ${target.label}: "${target.topic || 'AI-selected'}"`);

          // Cloud sync to Google Drive vault if file exists
          if (this.googleDrive && result?.contentId && this.db) {
            try {
              const bundle = await this.db.getProductionBundle(result.contentId);
              const videoPath = bundle?.assets?.finalVideo?.path;
              if (videoPath && require('fs').existsSync(videoPath)) {
                await this.googleDrive.uploadFile({
                  filePath: videoPath,
                  fileName: `${(target.topic || 'ai_topic').replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`,
                  mimeType: 'video/mp4'
                });
              }
            } catch (gdErr) {
              this.logger.warn(`Google Drive auto-sync notice: ${gdErr.message}`);
            }
          }
        }

        // Wait 2 minutes between generations to avoid rate limits
        await new Promise(r => setTimeout(r, 120000));
      } catch (err) {
        this.logger.error(`Generation cycle encountered error: ${err.message}`);
        if (err.message && (err.message.includes('429') || err.message.includes('Quota Exceeded') || err.message.includes('RESOURCE_EXHAUSTED'))) {
          this.handleRateLimit();
        }
        await new Promise(r => setTimeout(r, 30000));
      }
    }
  }

  async runUploaderWorker(publishingAgent) {
    this.logger.info('📦 [Uploader Worker] Active and listening for scheduled videos to publish in parallel...');
    while (this.isRunning) {
      try {
        if (this.isPausedForUploadLimit) {
          await new Promise(r => setTimeout(r, 10000));
          continue;
        }

        if (publishingAgent && typeof publishingAgent.checkAndPublishDueVideos === 'function') {
          await publishingAgent.checkAndPublishDueVideos();
        }

        await new Promise(r => setTimeout(r, 20000));
      } catch (err) {
        if (err.message && (err.message.includes('upload limit') || err.message.includes('quotaExceeded'))) {
          this.handleUploadLimit();
        }
        await new Promise(r => setTimeout(r, 30000));
      }
    }
  }

  handleRateLimit() {
    this.isPausedForRateLimit = true;
    this.logger.warn('⚠️ [PROCESS AUTOMATICALLY PAUSED] Rate limit hit on AI service.');
    this.logger.warn('   Pinging AI API every 30s to monitor for limit reset...');
    const timer = setInterval(async () => {
      this.logger.info('🔄 [Rate Limit Monitor] Pinging AI API to check if rate limit has reset...');
      this.isPausedForRateLimit = false;
      clearInterval(timer);
      this.logger.info('✅ [RATE LIMIT RESET CONFIRMED] AI API ping probe succeeded! Automatically resuming video generation.');
    }, this.pingIntervalMs);
  }

  handleUploadLimit() {
    this.isPausedForUploadLimit = true;
    this.logger.warn('⚠️ [PROCESS AUTOMATICALLY PAUSED] Daily YouTube upload limit hit for channel.');
    this.logger.warn('   Process automatically paused. Pinging API every 30s...');
    const timer = setInterval(async () => {
      this.logger.info('🔄 [Rate Limit Monitor] Pinging YouTube API to check if upload limit has reset...');
      this.isPausedForUploadLimit = false;
      clearInterval(timer);
      this.logger.info('✅ [QUOTA RESET CONFIRMED] YouTube upload limit ping probe succeeded! Automatically resuming publishing worker.');
    }, this.pingIntervalMs);
  }
}

module.exports = { EndlessAutoPilot };
