const fs = require('fs');
const path = require('path');
const { Logger } = require('./logger');

const SERIES_CATALOG = [
  {
    id: 'dart_internals',
    name: 'Dart & Flutter Internals',
    badge: 'DART & FLUTTER',
    language: 'Dart',
    description: 'Under-the-hood mechanics of the Dart runtime, single-threaded event loop, and Flutter rendering pipeline.',
    episodes: [
      {
        episode: 1,
        topic: 'Dart Event Loop: Microtasks vs Event Queue Deep Dive',
        hookAngle: 'Why does your Flutter UI drop to 30 FPS even when your async code looks clean? It all comes down to the Dart Event Loop.',
        problemHeadline: 'The Microtask Starvation Bottleneck',
        keyPrinciple: 'Never schedule long-running CPU loops in scheduleMicrotask — it starves UI paint events.',
        codeSnippet: `// Dart Event Loop Priority\nvoid main() {\n  print("1. Synchronous Main");\n  Future.microtask(() => print("2. Microtask Queue"));\n  Future(() => print("3. Event Queue (Timers/I/O)"));\n  // Microtasks ALWAYS drain before the next Event!\n}`,
        dsaType: 'event_loop',
        dsaFlow: 'Sync Execution -> Microtask Queue [Drained First] -> Event Queue [I/O & Timers] -> Frame Render',
        nextTeaser: 'The 3 Flutter Trees: Why Widget vs Element vs RenderObject Controls 60 FPS Re-renders',
        cliffhangerNarration: 'In Episode 2, we uncover how Flutter Element trees prevent catastrophic UI lag. Follow Byte By Byte so you do not miss Part 2 tomorrow!'
      },
      {
        episode: 2,
        topic: 'Flutter 3 Trees: Widget vs Element vs RenderObject',
        hookAngle: 'Widgets in Flutter are completely disposable throwaway configurations. The real magic lives in the Element tree.',
        problemHeadline: 'Widget Rebuild Budget Exhaustion',
        keyPrinciple: 'Widgets describe configuration; Elements manage identity; RenderObjects handle layout and paint.',
        codeSnippet: `// Efficient Flutter Element Identity\nclass HeavyCard extends StatelessWidget {\n  const HeavyCard({super.key}); // const caches Element identity\n  @override\n  Widget build(BuildContext context) => const Text("Zero Repaint");\n}`,
        dsaType: 'tree_hierarchy',
        dsaFlow: 'Widget (Blueprint) -> Element (Lifecycle & State) -> RenderObject (Layout & Painting)',
        nextTeaser: 'Dart Isolates: Zero-Shared-Memory Parallelism and Actor Model Execution',
        cliffhangerNarration: 'In Episode 3, we break down why Dart Isolates never share memory and how to run background compute. Follow for Part 3!'
      },
      {
        episode: 3,
        topic: 'Dart Isolates: Zero-Shared Memory Concurrency Explained',
        hookAngle: 'Dart is single-threaded, yet it can saturate an 8-core CPU without a single mutex or race condition. Here is how.',
        problemHeadline: 'Main Thread UI Freezes on JSON Parsing',
        keyPrinciple: 'Isolates communicate via immutable port message-passing, eliminating data races by design.',
        codeSnippet: `// Spawning Background Isolate\nimport 'dart:isolate';\n\nFuture<void> runHeavyCompute() async {\n  final result = await Isolate.run(() {\n    return parseHugeJsonPayload(rawBytes); // Runs on separate thread!\n  });\n}`,
        dsaType: 'actor_concurrency',
        dsaFlow: 'Main Isolate (UI & Event Loop) <-[SendPort / ReceivePort]-> Worker Isolate (Isolated Heap)',
        nextTeaser: 'Const Constructors in Dart: Why Canonicalization Saves Megabytes of RAM',
        cliffhangerNarration: 'In Episode 4, we reveal how the const keyword cuts RAM allocations in half. See you in Part 4!'
      },
      {
        episode: 4,
        topic: 'Dart Const Constructors & Object Canonicalization',
        hookAngle: 'Adding const to your Flutter widgets is not just a linter preference—it completely transforms how RAM is allocated.',
        problemHeadline: 'Heap Fragmentation from Redundant Objects',
        keyPrinciple: 'Canonicalized const instances share a single compile-time memory pointer across the entire app.',
        codeSnippet: `// Canonical Memory Pointer\nfinal a = const EdgeInsets.all(16.0);\nfinal b = const EdgeInsets.all(16.0);\nprint(identical(a, b)); // TRUE: Exactly the same heap address!`,
        dsaType: 'flyweight_cache',
        dsaFlow: 'Compile Time Constant -> Canonicalization Table -> Single Shared Pointer in Memory',
        nextTeaser: 'Flutter JIT vs AOT: How Dart Compiles into ARM64 Assembly in Production',
        cliffhangerNarration: 'In Episode 5, we explore how Flutter achieves sub-second launch times with AOT compilation. Follow to catch the finale!'
      },
      {
        episode: 5,
        topic: 'Flutter Compilation: JIT Debugging vs AOT Production Speed',
        hookAngle: 'How does Flutter hot-reload code in 400 milliseconds in dev, yet ship blazing fast C-speed ARM assembly in production?',
        problemHeadline: 'Development Velocity vs Production Runtime Latency',
        keyPrinciple: 'Debug uses Dart VM JIT compiler; Release compiles ahead-of-time into native machine code.',
        codeSnippet: `// Compilation Target Pipelines\n// Debug: Dart Source -> Kernel AST -> Dart VM JIT Engine\n// Release: Dart Source -> AOT Compiler -> libapp.so (ARM64 Machine Code)`,
        dsaType: 'compiler_pipeline',
        dsaFlow: 'Dart Code -> Tree Shaking -> Machine Code (ARM64/x86) -> Zero JIT Overhead',
        nextTeaser: 'Next Series: Go Concurrency & Systems Internals — Episode 1 drops tomorrow!',
        cliffhangerNarration: 'That wraps our Dart series! Tomorrow we launch our Go Concurrency Masterclass. Subscribe to catch Episode 1!'
      }
    ]
  },
  {
    id: 'go_internals',
    name: 'Go Systems & Concurrency Masterclass',
    badge: 'GO CONCURRENCY',
    language: 'Go',
    description: 'Under-the-hood architecture of the Go M:N runtime scheduler, goroutine stack allocation, and lockless concurrency.',
    episodes: [
      {
        episode: 1,
        topic: 'Goroutines vs OS Threads: Why Go Uses 2KB Stacks',
        hookAngle: 'An OS thread costs 2 to 8 Megabytes of memory. A Goroutine starts at just 2 Kilobytes. Here is how Go runs 100,000 threads.',
        problemHeadline: 'Operating System Thread Exhaustion (OOM)',
        keyPrinciple: 'Goroutines use segmented dynamic stacks and userspace M:N scheduling with zero kernel context-switch cost.',
        codeSnippet: `// 100,000 Concurrent Goroutines\npackage main\nimport ("fmt"; "sync")\nfunc main() {\n  var wg sync.WaitGroup\n  for i := 0; i < 100000; i++ {\n    wg.Add(1)\n    go func() { defer wg.Done() }() // Total RAM: ~200MB vs 800GB on OS threads!\n  }\n  wg.Wait()\n}`,
        dsaType: 'scheduler_mn',
        dsaFlow: 'G (Goroutine: 2KB) -> M (OS Worker Thread) -> P (Logical Processor Core) -> CPU Cores',
        nextTeaser: 'Unbuffered vs Buffered Channels: The Silent Deadlock That Freezes APIs',
        cliffhangerNarration: 'In Episode 2, we expose the silent deadlock trap in Go channels that freezes microservices. Follow Byte By Byte for Part 2!'
      },
      {
        episode: 2,
        topic: 'Go Channels: Unbuffered vs Buffered Deadlock Mechanics',
        hookAngle: 'Sending data into an unbuffered Go channel when no receiver is ready blocks immediately and can deadlock your entire backend.',
        problemHeadline: 'Silent Goroutine Leak & Channel Deadlock',
        keyPrinciple: 'Unbuffered channels require a rendezvous handshake; buffered channels decouple producer-consumer lockstep.',
        codeSnippet: `// The Unbuffered Deadlock Trap\nch := make(chan int) // Unbuffered!\n// ch <- 42 // FATAL: all goroutines are asleep - deadlock!\n\n// Production Solution: Non-blocking select or buffer\nselect {\ncase ch <- 42:\n  fmt.Println("Sent")\ndefault:\n  fmt.Println("Channel busy - dropped to prevent leak")\n}`,
        dsaType: 'channel_ringbuffer',
        dsaFlow: 'Sender -> hchan struct (Lock -> Sudog Waiting Queue -> Ring Buffer) -> Receiver',
        nextTeaser: 'Go Mutex Internals: Starvation Mode and 100ns Spinlocks',
        cliffhangerNarration: 'In Episode 3, we dive into the Go Mutex runtime and how Starvation Mode prevents goroutine starvation. Follow for Part 3!'
      },
      {
        episode: 3,
        topic: 'Go Mutex: Starvation Mode & Spinlock Contention',
        hookAngle: 'In high-throughput microservices, normal Go mutexes can starve goroutines indefinitely. Go solved this with Starvation Mode.',
        problemHeadline: 'Unbounded Tail Latency from Lock Starvation',
        keyPrinciple: 'After 1 millisecond of waiting, sync.Mutex switches to Starvation Mode, handing ownership directly to the first waiter.',
        codeSnippet: `// sync.Mutex State Machine\n// Normal Mode: Incoming goroutines spin on CPU (high throughput)\n// Starvation Mode: Lock handed strictly FIFO to queue head (fairness)\nvar mu sync.Mutex\nmu.Lock()   // Atomically toggles bit 0 (mutexLocked)\ndefer mu.Unlock()`,
        dsaType: 'mutex_state',
        dsaFlow: 'Normal Mode (Spinlock Fast-path) --[1ms Wait Timeout]--> Starvation Mode (Direct FIFO Handoff)',
        nextTeaser: 'Slice Capacity Doubling: Why Append Silently Duplicates Memory',
        cliffhangerNarration: 'In Episode 4, we examine why append() creates silent memory bugs and doubles buffer sizes. See you in Part 4!'
      },
      {
        episode: 4,
        topic: 'Go Slices: Capacity Doubling & Silent Memory Leaks',
        hookAngle: 'Did you know append() in Go does not modify your slice in place once capacity is exceeded? It silently allocates an entire new array.',
        problemHeadline: 'Hidden Heap Reallocation & Sub-slice Memory Leaks',
        keyPrinciple: 'Slices are 24-byte headers (Pointer, Length, Capacity). Always pre-allocate with make([]T, 0, cap) in hot paths.',
        codeSnippet: `// Pre-allocating Capacity Eliminates Re-allocations\ns := make([]int, 0, 1000) // 1 allocation\nfor i := 0; i < 1000; i++ {\n  s = append(s, i) // Zero re-allocations, zero heap thrash!\n}`,
        dsaType: 'array_growth',
        dsaFlow: 'Slice Header (Ptr: 8B | Len: 8B | Cap: 8B) -> Backing Array [Doubles at threshold]',
        nextTeaser: 'Go Garbage Collector: Tricolor Concurrent Mark and Sweep Deep Dive',
        cliffhangerNarration: 'In Episode 5, we break down the Go Garbage Collector and how it achieves sub-millisecond stop-the-world pauses. Follow for the finale!'
      },
      {
        episode: 5,
        topic: 'Go Garbage Collector: Tricolor Mark & Sweep Explained',
        hookAngle: 'Java used to pause for seconds during GC. Go achieves under 1 millisecond STW pauses using Tricolor Concurrent Mark & Sweep.',
        problemHeadline: 'Stop-The-World Latency Spikes in Low-Latency APIs',
        keyPrinciple: 'Objects are partitioned into White (unreachable), Grey (scanned), and Black (retained), marked concurrently alongside running goroutines.',
        codeSnippet: `// Write Barrier Prevents Memory Leaks During Concurrent GC\n// White: Candidate for deletion\n// Grey: Discovered, children pending scan\n// Black: Verified reachable; write barrier traps runtime mutations`,
        dsaType: 'tricolor_graph',
        dsaFlow: 'Root Pointers -> Grey Queue -> Concurrent Scan -> Black Set -> White Purged',
        nextTeaser: 'Next Series: JavaScript V8 Engine Internals — Episode 1 arrives tomorrow!',
        cliffhangerNarration: 'That concludes our Go series! Next up is our JavaScript V8 Engine Deep-Dive. Subscribe to catch Episode 1!'
      }
    ]
  },
  {
    id: 'javascript_v8',
    name: 'JavaScript & V8 Engine Runtime Secrets',
    badge: 'JAVASCRIPT V8',
    language: 'JavaScript',
    description: 'How the Google V8 engine parses, JIT compiles, and executes JavaScript at near-C speeds.',
    episodes: [
      {
        episode: 1,
        topic: 'V8 Event Loop: Call Stack, Microtasks & Macrotasks Explained',
        hookAngle: 'Why does Promise.resolve() execute before setTimeout 0, even though both are asynchronous? Let us crack open the V8 event loop.',
        problemHeadline: 'Unintended Async Order & Microtask Starvation',
        keyPrinciple: 'Microtasks (Promises/queueMicrotask) drain completely after every call stack tick before any Macrotask (Timers/I/O) runs.',
        codeSnippet: `// Execution Order in V8\nconsole.log("1. Stack");\nsetTimeout(() => console.log("4. Macrotask (Timer)"), 0);\nPromise.resolve().then(() => console.log("2. Microtask 1"))\n                 .then(() => console.log("3. Microtask 2"));`,
        dsaType: 'v8_loop',
        dsaFlow: 'Call Stack -> Drain All Microtasks -> Check Render Pipeline -> Dequeue 1 Macrotask',
        nextTeaser: 'Hidden Classes & Inline Caching: Why Object Shapes Rule V8 Speed',
        cliffhangerNarration: 'In Episode 2, we uncover why changing object property order destroys V8 JIT performance. Follow Byte By Byte for Part 2!'
      },
      {
        episode: 2,
        topic: 'V8 Hidden Classes & Inline Caching: Why Object Shapes Matter',
        hookAngle: 'Changing the initialization order of properties in a JavaScript object can slow down your code by 10x in V8. Here is why.',
        problemHeadline: 'De-optimized Megamorphic Lookups',
        keyPrinciple: 'V8 assigns hidden classes (Maps) based on property insertion order. Consistent shapes allow monomorphic inline caching.',
        codeSnippet: `// Monomorphic (Fast) vs Megamorphic (Slow)\nfunction Point(x, y) { this.x = x; this.y = y; } // Single Hidden Class (Fast)\n\nconst p1 = {}; p1.x = 1; p1.y = 2; // Map Transition A -> B\nconst p2 = {}; p2.y = 2; p2.x = 1; // Map Transition C -> D (Mismatched Shape!)`,
        dsaType: 'transition_tree',
        dsaFlow: 'Empty Object (Map 0) -> +x (Map 1) -> +y (Map 2: Monomorphic Inline Cache Hit)',
        nextTeaser: 'Node.js Memory Leaks: The 3 Deadliest Closures and Global Maps',
        cliffhangerNarration: 'In Episode 3, we dissect the top memory leaks that crash high-traffic Node.js clusters. Follow for Part 3!'
      },
      {
        episode: 3,
        topic: 'Node.js Memory Leaks: Closures, Global Maps & Timers',
        hookAngle: 'Your Node.js microservice runs fine for 3 days, then abruptly crashes with heap out of memory. Let us debug the hidden leak.',
        problemHeadline: 'Unbounded Heap Growth & OOM Crash',
        keyPrinciple: 'Retained outer scope closures and uncleared setInterval references prevent V8 GC from reclaiming entire object subgraphs.',
        codeSnippet: `// The Classic Closure Memory Leak\nlet theThing = null;\nfunction replaceThing() {\n  const prior = theThing;\n  const unused = function() { if (prior) console.log(prior); }; // Retains prior!\n  theThing = { longArray: new Array(1000000) };\n}; // Leaks 1MB per call!`,
        dsaType: 'retained_graph',
        dsaFlow: 'GC Root (Global Scope) -> Closure Context -> Retained Object Graph (Uncollectable)',
        nextTeaser: 'V8 TurboFan JIT: Ignition Bytecode to Optimized Machine Code',
        cliffhangerNarration: 'In Episode 4, we examine TurboFan JIT compilation and why dynamic type changes cause de-optimization bailouts. See you in Part 4!'
      },
      {
        episode: 4,
        topic: 'V8 TurboFan JIT: Bytecode to Raw Machine Code',
        hookAngle: 'JavaScript starts as interpreted bytecode in V8 Ignition. But when a hot loop is detected, TurboFan compiles it into raw assembly.',
        problemHeadline: 'Bailouts & JIT De-optimization Throttling',
        keyPrinciple: 'TurboFan speculatively compiles based on observed types. Passing a string to an integer hot path triggers instant de-optimization.',
        codeSnippet: `// Hot Path JIT Optimization\nfunction add(a, b) { return a + b; }\nfor (let i = 0; i < 100000; i++) add(i, 1); // TurboFan emits raw ADD assembly\nadd(5, "hello"); // DE-OPTIMIZATION BAILOUT! Reverts to slow interpreter`,
        dsaType: 'jit_pipeline',
        dsaFlow: 'JS Source -> Ignition Bytecode -> Profiling Feedback -> TurboFan Machine Code -> Bailout Guard',
        nextTeaser: 'WeakMap vs Map: How V8 Automatically Garbage Collects Keys',
        cliffhangerNarration: 'In Episode 5, we show how WeakMap solves caching memory leaks with ephemeron GC. Follow for the finale!'
      },
      {
        episode: 5,
        topic: 'WeakMap vs Map: V8 Ephemerons & Automatic Garbage Collection',
        hookAngle: 'Storing user metadata in a standard JavaScript Map leaks memory forever. WeakMap solves this with ephemeron garbage collection.',
        problemHeadline: 'Metadata Cache Memory Leaks on Terminated Users',
        keyPrinciple: 'WeakMap holds weak references to object keys—when the key has no other references, its value is automatically garbage collected.',
        codeSnippet: `// WeakMap Prevents Memory Leaks\nconst cache = new WeakMap();\nlet userSession = { token: "abc-123" };\ncache.set(userSession, { role: "admin", permissions: [...] });\n\nuserSession = null; // Key and metadata are instantly eligible for V8 GC!`,
        dsaType: 'ephemeron_gc',
        dsaFlow: 'Strong Ref Dropped -> Weak Key Unreachable -> Ephemeron Cleared -> Value Reclaimed',
        nextTeaser: 'Next Series: Java JVM & Low-Latency Internals — Episode 1 drops tomorrow!',
        cliffhangerNarration: 'That wraps our JavaScript V8 series! Tomorrow we kick off our Java JVM Masterclass. Subscribe to catch Episode 1!'
      }
    ]
  },
  {
    id: 'java_jvm',
    name: 'Java JVM & High-Performance Systems',
    badge: 'JAVA JVM',
    language: 'Java',
    description: 'Inside the JVM: Stack vs Heap allocation, escape analysis, garbage collection algorithms, and Project Loom virtual threads.',
    episodes: [
      {
        episode: 1,
        topic: 'JVM Memory Model: Stack vs Heap & Escape Analysis Secrets',
        hookAngle: 'Did you know the Java Virtual Machine does not always allocate objects on the heap? Escape Analysis can allocate them on the CPU stack.',
        problemHeadline: 'Unnecessary Heap Allocation & GC Overhead',
        keyPrinciple: 'If the JVM determines an object does not escape the method scope, it scalar-replaces it onto the stack with zero GC cost.',
        codeSnippet: `// Escape Analysis: Stack Allocation\npublic void processCoordinates() {\n  Point p = new Point(10, 20); // Does NOT escape method!\n  // JVM scalar-replaces 'p' into registers: int x = 10; int y = 20;\n  // Zero Heap Allocation, Zero GC pressure!\n}`,
        dsaType: 'stack_heap',
        dsaFlow: 'Method Call -> Escape Analysis -> Scalar Replacement -> CPU Register Allocation (No GC)',
        nextTeaser: 'ZGC vs G1: How the Modern JVM Achieved Sub-Millisecond Pauses',
        cliffhangerNarration: 'In Episode 2, we uncover how ZGC eliminated the infamous Java stop-the-world GC pause. Follow Byte By Byte for Part 2!'
      },
      {
        episode: 2,
        topic: 'ZGC vs G1: How the JVM Conquered Garbage Collection Pauses',
        hookAngle: 'Java used to freeze for 10 seconds on a 64 Gigabyte heap. Modern ZGC handles multi-terabyte heaps with under 1 millisecond pauses.',
        problemHeadline: 'Stop-The-World Latency Spikes in Financial Systems',
        keyPrinciple: 'ZGC uses Colored Pointers and Load Barriers to perform marking, relocation, and compaction concurrently with application threads.',
        codeSnippet: `// Colored Pointers in ZGC (64-bit Reference Metadata)\n// [16 bits Unused | 4 bits Metadata: Marked0/Marked1/Remapped | 44 bits Object Address]\n// Application threads encounter Load Barriers that heal pointers on the fly!`,
        dsaType: 'colored_pointer',
        dsaFlow: 'Application Thread Read -> Load Barrier -> Check Colored Pointer -> Remap if Relocated',
        nextTeaser: 'Virtual Threads in Java 21: How Project Loom Runs 1,000,000 Threads',
        cliffhangerNarration: 'In Episode 3, we explore Java 21 Virtual Threads and how Loom runs millions of threads concurrently. Follow for Part 3!'
      },
      {
        episode: 3,
        topic: 'Java Virtual Threads: 1,000,000 Lightweight Threads on 1 Core',
        hookAngle: 'Why use complex reactive code like WebFlux when Java 21 gives you 1,000,000 lightweight Virtual Threads with simple blocking code?',
        problemHeadline: 'Platform Thread Pool Saturation on Blocking I/O',
        keyPrinciple: 'Virtual threads mount onto carrier OS threads; when blocking on I/O, they unmount cleanly without blocking the OS thread.',
        codeSnippet: `// Millions of Lightweight Virtual Threads\ntry (var executor = Executors.newVirtualThreadPerTaskExecutor()) {\n  for (int i = 0; i < 100_000; i++) {\n    executor.submit(() -> {\n      Thread.sleep(1000); // Unmounts from carrier thread! Zero OS blocking!\n      return fetchApiResponse();\n    });\n  }\n}`,
        dsaType: 'virtual_threads',
        dsaFlow: 'Virtual Thread (Heap Cont) -> Mounted on Carrier Thread (ForkJoinPool) -> Unmounts on I/O',
        nextTeaser: 'ClassLoader Hierarchy: Why ClassLoader Leaks Crash Tomcat Servers',
        cliffhangerNarration: 'In Episode 4, we diagnose the notorious Metaspace OutOfMemoryError and ClassLoader leaks. See you in Part 4!'
      },
      {
        episode: 4,
        topic: 'ClassLoader Hierarchy & Metaspace OutOfMemoryError',
        hookAngle: 'Why does redeploying an application on a Java server without restarting the JVM eventually crash the server with OutOfMemoryError?',
        problemHeadline: 'Metaspace ClassLoader Memory Leaks',
        keyPrinciple: 'A Class can only be unloaded if its ClassLoader is unreachable. ThreadLocals retaining a ClassLoader pin the entire Metaspace.',
        codeSnippet: `// ThreadLocal ClassLoader Leak\npublic class LeakFilter implements Filter {\n  private static final ThreadLocal<CustomContext> ctx = new ThreadLocal<>();\n  // If ctx.remove() is not called in finally block,\n  // the Worker Thread pins CustomContext -> pins WebAppClassLoader -> Metaspace OOM!\n}`,
        dsaType: 'classloader_tree',
        dsaFlow: 'Bootstrap ClassLoader -> Platform ClassLoader -> App ClassLoader -> Custom ClassLoader',
        nextTeaser: 'Tiered Compilation: How C1 and C2 Turn Java Bytecode into C-Speed Code',
        cliffhangerNarration: 'In Episode 5, we show how C1 and C2 tiered compilation turns bytecode into C-speed code. Follow for the finale!'
      },
      {
        episode: 5,
        topic: 'Java Tiered Compilation: C1 Client to C2 Server Compilers',
        hookAngle: 'Java bytecode is interpreted at startup, compiled quickly by C1, and finally aggressively optimized by C2 into raw assembly.',
        problemHeadline: 'Cold Start Latency vs Peak Steady-State Throughput',
        keyPrinciple: 'Tiered compilation balances instant startup responsiveness (Levels 1-3) with aggressive peak C2 profile-guided optimization (Level 4).',
        codeSnippet: `// JVM Compilation Tiers:\n// Tier 0: Interpreter (Fast start, profiles hot loops)\n// Tier 1-3: C1 Client Compiler (Quick compilation with profiling counters)\n// Tier 4: C2 Server Compiler (Aggressive inlining, loop unrolling, vectorization)`,
        dsaType: 'tiered_compilation',
        dsaFlow: 'Bytecode -> Tier 0 Interpreter -> Tier 3 C1 (Profiled) -> Tier 4 C2 (Aggressive Machine Code)',
        nextTeaser: 'Next Series: Rust Systems & Memory Safety — Episode 1 launches tomorrow!',
        cliffhangerNarration: 'That wraps our Java JVM series! Tomorrow we launch our Rust Systems Masterclass. Subscribe so you do not miss Episode 1!'
      }
    ]
  }
];

class SeriesService {
  constructor(_options = {}) {
    this.logger = new Logger('SeriesService');
    this.stateFilePath = path.join(__dirname, '..', 'data', 'series_state.json');
  }

  getSeriesCatalog() {
    return SERIES_CATALOG;
  }

  loadState() {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const raw = fs.readFileSync(this.stateFilePath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (_e) {
      // Fallback to fresh state
    }

    return {
      active_series_id: 'dart_internals',
      current_episode: 1,
      total_episodes: 5,
      history: []
    };
  }

  saveState(state) {
    try {
      fs.writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
      this.logger.warn(`Could not persist series state: ${err.message}`);
    }
  }

  /**
   * Determine the next topic, either from explicit topic matching or sequential series progression
   */
  getNextEpisodePlan(requestedTopic = '') {
    const state = this.loadState();
    const req = String(requestedTopic || '').toLowerCase().trim();

    // 1. Check if user specified a topic matching one of our series
    if (req) {
      for (const series of SERIES_CATALOG) {
        const matchesSeries = req.includes(series.language.toLowerCase()) || 
                              req.includes(series.id.split('_')[0]) ||
                              series.episodes.some(ep => req.includes(ep.topic.toLowerCase()));
        if (matchesSeries) {
          const matchedEp = series.episodes.find(ep => req.includes(ep.topic.toLowerCase())) || series.episodes[0];
          return {
            isSeries: true,
            seriesId: series.id,
            seriesName: series.name,
            seriesBadge: series.badge,
            episode: matchedEp.episode,
            totalEpisodes: series.episodes.length,
            topic: matchedEp.topic,
            hookAngle: matchedEp.hookAngle,
            problemHeadline: matchedEp.problemHeadline,
            keyPrinciple: matchedEp.keyPrinciple,
            codeSnippet: matchedEp.codeSnippet,
            dsaType: matchedEp.dsaType,
            dsaFlow: matchedEp.dsaFlow,
            nextTeaser: matchedEp.nextTeaser,
            cliffhangerNarration: matchedEp.cliffhangerNarration
          };
        }
      }
    }

    // 2. Otherwise, progress through the active series sequentially
    let activeSeries = SERIES_CATALOG.find(s => s.id === state.active_series_id);
    if (!activeSeries) {
      activeSeries = SERIES_CATALOG[0];
      state.active_series_id = activeSeries.id;
      state.current_episode = 1;
    }

    let epIndex = (state.current_episode || 1) - 1;
    if (epIndex < 0 || epIndex >= activeSeries.episodes.length) {
      epIndex = 0;
    }

    const currentEp = activeSeries.episodes[epIndex];

    return {
      isSeries: true,
      seriesId: activeSeries.id,
      seriesName: activeSeries.name,
      seriesBadge: activeSeries.badge,
      episode: currentEp.episode,
      totalEpisodes: activeSeries.episodes.length,
      topic: currentEp.topic,
      hookAngle: currentEp.hookAngle,
      problemHeadline: currentEp.problemHeadline,
      keyPrinciple: currentEp.keyPrinciple,
      codeSnippet: currentEp.codeSnippet,
      dsaType: currentEp.dsaType,
      dsaFlow: currentEp.dsaFlow,
      nextTeaser: currentEp.nextTeaser,
      cliffhangerNarration: currentEp.cliffhangerNarration
    };
  }

  /**
   * Advance state after a video is published
   */
  advanceToNextEpisode(seriesId) {
    const state = this.loadState();
    const activeSeries = SERIES_CATALOG.find(s => s.id === (seriesId || state.active_series_id)) || SERIES_CATALOG[0];

    const nextEp = (state.current_episode || 1) + 1;
    if (nextEp > activeSeries.episodes.length) {
      // Rotate to next series!
      const currentIdx = SERIES_CATALOG.findIndex(s => s.id === activeSeries.id);
      const nextSeries = SERIES_CATALOG[(currentIdx + 1) % SERIES_CATALOG.length];
      state.active_series_id = nextSeries.id;
      state.current_episode = 1;
      this.logger.success(`🎉 Completed series: "${activeSeries.name}"! Rotating to new series: "${nextSeries.name}" Episode 1`);
    } else {
      state.current_episode = nextEp;
      this.logger.info(`📈 Advanced series "${activeSeries.name}" to Episode ${nextEp}/${activeSeries.episodes.length}`);
    }

    state.history = state.history || [];
    state.history.push({
      seriesId: activeSeries.id,
      episode: state.current_episode,
      timestamp: new Date().toISOString()
    });

    this.saveState(state);
    return state;
  }
}

module.exports = { SeriesService, SERIES_CATALOG };
