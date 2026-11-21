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
Create TWO distinct candidate scripts for topic: "${topic}" (Format: ${isLongForm ? '15-20 Min Comprehensive Masterclass' : 'High-Velocity 35-45 Second Viral YouTube Short (strictly 35 to 45 seconds duration, 90-110 words total narration across 4 rapid-fire chapters)'}).

PEDAGOGICAL & DURATION CONSTRAINTS:
1. STRICT SHORTS DURATION: Total spoken narration MUST be between 90 and 110 words (~35 to 45 seconds at ~150 wpm). Strictly between 35s and 45s for maximum algorithmic retention (APV > 100%)!
2. ANTI-OVERPROMISING: The hook must focus ONLY on ONE singular technical problem that will be 100% resolved in this video.
3. 100% COMPLETE RESOLUTION: Every concept introduced in Chapter 1 MUST be thoroughly explained, demonstrated with code, and resolved by Chapter 4.
4. HUMAN TEACHER VOICE: Energetic, conversational, with witty developer analogies. NEVER read slides verbatim.
5. ZERO REPETITION: Do not repeat greetings or previous points.
6. SEAMLESS INFINITE LOOP: Chapter 4 must end with an open-ended lead-in that phonetically connects back to Chapter 1's hook.

Candidate A Approach: "Problem/Solution & Architectural Journey" (Begins with a real production bottleneck, visualizes the flow, solves it).
Candidate B Approach: "Under-The-Hood Visual Deep-Dive" (Begins with an invisible mechanism, traces internal state machines and memory, concludes with mastery).

Research Core Concepts: ${JSON.stringify(research.coreConcepts)}
Audience Progression: ${JSON.stringify(audience.progressiveStages?.map(s => s.goal) || [])}
Recommended Hook: ${hooks.hooks?.[0]?.text || ''}

Provide a JSON response:
{
  "candidateA": {
    "approach": "problem_solution_architecture",
    "title": "Punchy YouTube Title (under 55 chars)",
    "hook": "${hooks.hooks?.[0]?.text || ''}",
    "sections": [
      { "title": "Chapter 1: The Bottleneck", "content": ["Spoken teacher explanation... (22-26 words)"], "duration": ${isLongForm ? 90 : 8} },
      { "title": "Chapter 2: The Mental Model", "content": ["Spoken teacher explanation with analogy... (22-26 words)"], "duration": ${isLongForm ? 120 : 9} },
      { "title": "Chapter 3: Code Walkthrough", "content": ["Spoken line-by-line code walkthrough... (22-26 words)"], "duration": ${isLongForm ? 150 : 9} },
      { "title": "Chapter 4: Production Trade-offs & Closure", "content": ["Spoken takeaway and loop lead-in... (22-26 words)"], "duration": ${isLongForm ? 120 : 9} }
    ],
    "funFact": "${research.interestingFacts?.[0] || 'Historical programming trivia'}",
    "conclusion": "Key takeaway recap providing complete pedagogical closure",
    "cta": "Subscribe for daily senior dev breakdowns"
  },
  "candidateB": {
    "approach": "under_the_hood_internals",
    "title": "Alternative High-Click Technical Title",
    "hook": "${hooks.hooks?.[1]?.text || hooks.hooks?.[0]?.text || ''}",
    "sections": [
      { "title": "Chapter 1: The Invisible Execution", "content": ["Spoken teacher explanation... (22-26 words)"], "duration": ${isLongForm ? 90 : 8} },
      { "title": "Chapter 2: Memory & State Machines", "content": ["Spoken teacher explanation with analogy... (22-26 words)"], "duration": ${isLongForm ? 120 : 9} },
      { "title": "Chapter 3: Step-by-Step Implementation", "content": ["Spoken line-by-line code walkthrough... (22-26 words)"], "duration": ${isLongForm ? 150 : 9} },
      { "title": "Chapter 4: Advanced Gotchas & Closure", "content": ["Spoken takeaway and loop lead-in... (22-26 words)"], "duration": ${isLongForm ? 120 : 9} }
    ],
    "funFact": "${research.interestingFacts?.[0] || 'Historical programming trivia'}",
    "conclusion": "Mastery recap providing complete pedagogical closure",
    "cta": "Subscribe for daily engineering secrets"
  }
}
Respond strictly with valid JSON.`;

    try {
      const response = await this.ai.generateText(prompt);
      return JSON.parse(response.replace(/^```json/i, '').replace(/```$/, '').trim());
    } catch (err) {
      return {
        candidateA: {
          approach: 'cs_masterclass_fireship_bytebytego',
          title: `Mastering ${topic}: Computer Science Deep Dive`,
          hook: hooks.hooks?.[0]?.text || `Computing history changed when engineers solved ${topic}. Here is what you need to know.`,
          sections: [
            {
              title: 'The Origin & Computing Lore',
              content: [
                `Computing history is defined by how engineers conquer complexity. When ${topic} was first conceptualized, early computer scientists were constrained by tight hardware registers, forcing pioneers to invent clean architectural abstractions that still govern modern software today.`
              ],
              duration: isLongForm ? 180 : 35
            },
            {
              title: 'The 2 AM Developer Reality',
              content: [
                `The 2 AM developer reality: textbook solutions look flawless in local development environments, but the instant real production traffic hits, race conditions and subtle bottlenecks emerge. It worked on my machine, so why is the production server currently on fire?`
              ],
              duration: isLongForm ? 180 : 30
            },
            {
              title: 'Under The Hood: Mental Model',
              content: [
                `Let's examine the under-the-hood mental model displayed directly on your screen. Notice the flow of data across memory boundaries. Instead of naive lookups or tight synchronous coupling, modern architecture isolates state transitions, managing state changes through deterministic state boundaries and explicit invariant verification.`
              ],
              duration: isLongForm ? 240 : 40
            },
            {
              title: 'Staff Engineer Golden Rule',
              content: [
                `Here is the golden rule senior staff engineers live by: prioritize maintainable, predictable architecture over clever premature optimizations. Design systems around failure-tolerant boundaries and explicit invariants to build rock-solid software that scales effortlessly.`
              ],
              duration: isLongForm ? 180 : 35
            }
          ],
          funFact: research.interestingFacts?.[0] || 'Engineered for sub-millisecond memory efficiency',
          conclusion: 'Master hardware-aware data structures and your code will scale effortlessly.',
          cta: 'Save this breakdown for your next system design interview or production architecture review.'
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
