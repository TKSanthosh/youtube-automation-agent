const { Logger } = require('../logger');

class FinalScriptEditor {
  constructor(aiTextService) {
    this.ai = aiTextService;
    this.logger = new Logger('FinalScriptEditor');
  }

  async generateCandidates(topic, research, audience, hooks, isLongForm) {
    this.logger.info(`Generating distinct candidate script architectures for: "${topic}"`);
    
    // Candidate A: Problem/Solution & Architectural Flow
    // Candidate B: Technical Deep-Dive & Internals First
    const prompt = `You are a Master Script Architect and Passionate Tech Educator.
Create TWO distinct candidate scripts for topic: "${topic}" (Format: ${isLongForm ? '15-20 Min Comprehensive Masterclass' : '3-Minute YouTube Short (strictly 2m30s to 3m duration, 340-370 words total narration across 4 chapters)'}).

PEDAGOGICAL & DURATION CONSTRAINTS:
1. STRICT SHORTS DURATION: Total spoken narration MUST be between 340 and 370 words (~155 to 170 seconds). Never under 2m30s (at least 340 words), never over 3m (max 375 words)!
2. ANTI-OVERPROMISING: The hook must focus ONLY on ONE singular technical problem that will be 100% resolved in this video. Never list a broad curriculum of multiple disparate topics.
3. 100% COMPLETE RESOLUTION: Every concept introduced in Chapter 1 MUST be thoroughly explained, practically demonstrated with code, and definitively resolved by Chapter 4.
4. HUMAN TEACHER VOICE: Energetic, conversational, with witty developer analogies. NEVER read slides verbatim—talk directly to the student and refer to what appears on screen.
5. ZERO REPETITION: Do not repeat greetings or previous points.

Candidate A Approach: "Problem/Solution & Architectural Journey" (Begins with a real production bottleneck, visualizes the flow, solves it).
Candidate B Approach: "Under-The-Hood Visual Deep-Dive" (Begins with an invisible mechanism, traces internal state machines and memory, concludes with mastery).

Research Core Concepts: ${JSON.stringify(research.coreConcepts)}
Audience Progression: ${JSON.stringify(audience.progressiveStages?.map(s => s.goal) || [])}
Recommended Hook: ${hooks.hooks?.[0]?.text || ''}

Provide a JSON response:
{
  "candidateA": {
    "approach": "problem_solution_architecture",
    "title": "Punchy YouTube Title (under 95 chars)",
    "hook": "${hooks.hooks?.[0]?.text || ''}",
    "sections": [
      { "title": "Chapter 1: The Bottleneck", "content": ["Spoken teacher explanation... (80-90 words)"], "duration": ${isLongForm ? 90 : 40} },
      { "title": "Chapter 2: The Mental Model", "content": ["Spoken teacher explanation with analogy... (90-100 words)"], "duration": ${isLongForm ? 120 : 45} },
      { "title": "Chapter 3: Code Walkthrough", "content": ["Spoken line-by-line code walkthrough... (100-110 words)"], "duration": ${isLongForm ? 150 : 50} },
      { "title": "Chapter 4: Production Trade-offs & Closure", "content": ["Spoken takeaway and complete resolution... (70-80 words)"], "duration": ${isLongForm ? 120 : 35} }
    ],
    "funFact": "${research.interestingFacts?.[0] || 'Historical programming trivia'}",
    "conclusion": "Key takeaway recap providing complete pedagogical closure",
    "cta": "Subscribe for deep-dive software engineering breakdowns"
  },
  "candidateB": {
    "approach": "under_the_hood_internals",
    "title": "Alternative High-Click Technical Title",
    "hook": "${hooks.hooks?.[1]?.text || hooks.hooks?.[0]?.text || ''}",
    "sections": [
      { "title": "Chapter 1: The Invisible Execution", "content": ["Spoken teacher explanation... (80-90 words)"], "duration": ${isLongForm ? 90 : 40} },
      { "title": "Chapter 2: Memory & State Machines", "content": ["Spoken teacher explanation with analogy... (90-100 words)"], "duration": ${isLongForm ? 120 : 45} },
      { "title": "Chapter 3: Step-by-Step Implementation", "content": ["Spoken line-by-line code walkthrough... (100-110 words)"], "duration": ${isLongForm ? 150 : 50} },
      { "title": "Chapter 4: Advanced Gotchas & Closure", "content": ["Spoken takeaway and complete resolution... (70-80 words)"], "duration": ${isLongForm ? 120 : 35} }
    ],
    "funFact": "${research.interestingFacts?.[0] || 'Historical programming trivia'}",
    "conclusion": "Mastery recap providing complete pedagogical closure",
    "cta": "Drop a comment with your favorite architecture pattern"
  }
}
Respond strictly with valid JSON.`;

    try {
      const response = await this.ai.generateText(prompt);
      return JSON.parse(response.replace(/^```json/i, '').replace(/```$/, '').trim());
    } catch (err) {
      return {
        candidateA: {
          approach: 'problem_solution_architecture',
          title: `Mastering ${topic}: Architecture & Code Walkthrough`,
          hook: hooks.hooks?.[0]?.text || `Understanding ${topic} is the difference between junior code and production architecture.`,
          sections: [
            {
              title: 'The Production Problem',
              content: [
                `When engineers first implement ${topic}, textbook solutions appear clean in staging but collapse under live production spikes. As concurrent requests flood the ingress, unhandled downstream latencies cascade across microservices, causing worker thread pool exhaustion and catastrophic cluster outages. Notice what happens without intelligent backpressure: a single degraded dependency starves system resources and triggers a domino failure across your entire distributed platform. Let's break down the exact engineering mechanics required to eliminate this failure permanently and keep core services resilient.`
              ],
              duration: isLongForm ? 180 : 42
            },
            {
              title: 'Under The Hood Architecture',
              content: [
                `To solve this cleanly, let's examine the underlying architecture and mental model displayed directly on your screen. Instead of allowing callers to continuously hammer failing endpoints and consume thread capacity, we place an intelligent, stateful boundary layer directly in the critical request path. When failure rates breach the safety margin, the circuit trips instantly into an open state, serving deterministic fallbacks before resources saturate, isolating faults and granting downstream dependencies the room needed to recover gracefully.`
              ],
              duration: isLongForm ? 240 : 44
            },
            {
              title: 'Production Implementation',
              content: [
                `Now let's walk through the production implementation directly on your screen. Look at line 1: we configure explicit timeout thresholds paired with isolated execution pools to prevent thread contention. As you trace down through the execution handler, notice that every external I/O call is guarded within a monitored context. If the downstream service is healthy, execution proceeds with zero latency overhead. But the moment consecutive failures exceed the tripping threshold, the guard intercepts execution immediately, shielding your core database layer from connection starvation.`
              ],
              duration: isLongForm ? 240 : 44
            },
            {
              title: 'Senior Rule of Thumb',
              content: [
                `Here is the golden rule of thumb that senior staff engineers always keep in mind: never deploy ${topic} with static, hardcoded configuration values. Always tune your latency thresholds based on empirical 99th percentile production telemetry, and pair every fallback handler with automated metric alarms and circuit reset monitors. By designing systems around failure-tolerant boundaries and active recovery loops, you eliminate cascading outages, protect downstream infrastructure, and guarantee self-healing resilience across your entire tech stack.`
              ],
              duration: isLongForm ? 180 : 42
            }
          ],
          funFact: research.interestingFacts?.[0] || 'Engineered to maximize throughput',
          conclusion: 'Always profile your execution before premature optimization.',
          cta: 'Subscribe to Code & AI Academy for senior-level engineering tutorials.'
        }
      };
    }
  }

  synthesize(candidate, visualPlan, refactoredData) {
    const finalSections = (refactoredData?.sections || candidate.sections || []).map((sec, idx) => {
      const visual = visualPlan?.[idx] || {};
      const contentList = Array.isArray(sec.content) ? sec.content : [sec.content || ''];
      return {
        title: sec.title,
        content: contentList,
        spokenNarration: sec.spokenNarration || contentList.join(' '),
        duration: sec.duration || 45,
        visual: {
          type: visual.visualType || 'flow_diagram',
          description: visual.visualDescription || 'Visual concept illustration',
          diagramLayout: visual.diagramLayout || null,
          headline: visual.onScreenHeadline || sec.title,
          codeSnippet: visual.codeSnippet || null
        }
      };
    });

    const slides = finalSections.map((sec, idx) => ({
      slideNumber: idx + 1,
      headline: sec.visual?.headline || sec.title,
      bulletPoints: Array.isArray(sec.content)
        ? sec.content.slice(0, 3).map(s => String(s).replace(/^[-*•\d.]+\s*/, '').trim()).filter(Boolean)
        : [String(sec.content || '')],
      codeSnippet: sec.visual?.codeSnippet || '',
      teacherNarration: sec.spokenNarration || (Array.isArray(sec.content) ? sec.content.join(' ') : String(sec.content || ''))
    }));

    return {
      title: refactoredData?.title || candidate.title,
      hook: refactoredData?.hook || candidate.hook,
      sections: finalSections,
      slides,
      funFact: refactoredData?.funFact || candidate.funFact,
      conclusion: refactoredData?.conclusion || candidate.conclusion,
      callToAction: refactoredData?.cta || candidate.cta,
      duration: finalSections.reduce((acc, s) => acc + (s.duration || 45), 0)
    };
  }
}

module.exports = { FinalScriptEditor };
