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
Create TWO distinct candidate scripts for topic: "${topic}" (Format: ${isLongForm ? '15-20 Min Comprehensive Masterclass' : 'Strictly YouTube Shorts (< 60s duration, 110-120 words total narration across 4 chapters)'}).

PEDAGOGICAL & DURATION CONSTRAINTS:
1. STRICT SHORTS DURATION: Total spoken narration MUST be between 110 and 125 words (~50 to 55 seconds). Never exceed 58 seconds total (YouTube requires < 60s to index as a Short)!
2. ANTI-OVERPROMISING: The hook must focus ONLY on ONE singular technical problem that will be 100% resolved in this video.
3. 100% COMPLETE RESOLUTION: Every concept introduced in Chapter 1 MUST be thoroughly explained, demonstrated with code, and resolved by Chapter 4.
4. HUMAN TEACHER VOICE: Energetic, conversational, with witty developer analogies. NEVER read slides verbatim.
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
      { "title": "Chapter 1: The Bottleneck", "content": ["Spoken teacher explanation... (25-30 words)"], "duration": ${isLongForm ? 90 : 13} },
      { "title": "Chapter 2: The Mental Model", "content": ["Spoken teacher explanation with analogy... (25-30 words)"], "duration": ${isLongForm ? 120 : 14} },
      { "title": "Chapter 3: Code Walkthrough", "content": ["Spoken line-by-line code walkthrough... (28-32 words)"], "duration": ${isLongForm ? 150 : 14} },
      { "title": "Chapter 4: Production Trade-offs & Closure", "content": ["Spoken takeaway and complete resolution... (25-28 words)"], "duration": ${isLongForm ? 120 : 13} }
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
      { "title": "Chapter 1: The Invisible Execution", "content": ["Spoken teacher explanation... (25-30 words)"], "duration": ${isLongForm ? 90 : 13} },
      { "title": "Chapter 2: Memory & State Machines", "content": ["Spoken teacher explanation with analogy... (25-30 words)"], "duration": ${isLongForm ? 120 : 14} },
      { "title": "Chapter 3: Step-by-Step Implementation", "content": ["Spoken line-by-line code walkthrough... (28-32 words)"], "duration": ${isLongForm ? 150 : 14} },
      { "title": "Chapter 4: Advanced Gotchas & Closure", "content": ["Spoken takeaway and complete resolution... (25-28 words)"], "duration": ${isLongForm ? 120 : 13} }
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
                `When building ${topic}, standard implementations look fine in staging but instantly crash under production spikes. Unhandled downstream latencies cascade across microservices, exhausting thread pools and triggering catastrophic outages.`
              ],
              duration: isLongForm ? 180 : 13
            },
            {
              title: 'Under The Hood Architecture',
              content: [
                `To fix this cleanly, look at the architecture on screen. We place an intelligent boundary layer in the critical path that intercepts downstream failures and trips open before resources saturate.`
              ],
              duration: isLongForm ? 240 : 14
            },
            {
              title: 'Production Implementation',
              content: [
                `Here is the production implementation. Notice line 1: explicit timeout thresholds with isolated thread pools guard every call, ensuring zero latency overhead while shielding your core database from connection starvation.`
              ],
              duration: isLongForm ? 240 : 14
            },
            {
              title: 'Senior Rule of Thumb',
              content: [
                `The senior engineer rule of thumb: always tune failure thresholds using real 99th percentile production metrics. Never deploy static timeouts, and implement automated recovery loops to guarantee resilient architecture.`
              ],
              duration: isLongForm ? 180 : 13
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
