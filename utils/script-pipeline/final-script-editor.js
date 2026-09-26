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
    const prompt = `You are a Master Script Architect.
Create TWO distinct candidate scripts for topic: "${topic}" (Format: ${isLongForm ? '15-20 Min Comprehensive Masterclass' : '60s Viral Short'}).

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
      { "title": "Chapter 1: The Bottleneck", "content": ["Spoken explanation..."], "duration": ${isLongForm ? 90 : 15} },
      { "title": "Chapter 2: The Mental Model", "content": ["Spoken explanation..."], "duration": ${isLongForm ? 120 : 15} },
      { "title": "Chapter 3: Code Walkthrough", "content": ["Spoken explanation..."], "duration": ${isLongForm ? 150 : 15} },
      { "title": "Chapter 4: Production Trade-offs", "content": ["Spoken explanation..."], "duration": ${isLongForm ? 120 : 15} }
    ],
    "funFact": "${research.interestingFacts?.[0] || 'Historical programming trivia'}",
    "conclusion": "Key takeaway recap",
    "cta": "Subscribe for deep-dive software engineering breakdowns"
  },
  "candidateB": {
    "approach": "under_the_hood_internals",
    "title": "Alternative High-Click Technical Title",
    "hook": "${hooks.hooks?.[1]?.text || hooks.hooks?.[0]?.text || ''}",
    "sections": [
      { "title": "Chapter 1: The Invisible Execution", "content": ["Spoken explanation..."], "duration": ${isLongForm ? 90 : 15} },
      { "title": "Chapter 2: Memory & State Machines", "content": ["Spoken explanation..."], "duration": ${isLongForm ? 120 : 15} },
      { "title": "Chapter 3: Step-by-Step Implementation", "content": ["Spoken explanation..."], "duration": ${isLongForm ? 150 : 15} },
      { "title": "Chapter 4: Advanced Edge Cases", "content": ["Spoken explanation..."], "duration": ${isLongForm ? 120 : 15} }
    ],
    "funFact": "${research.interestingFacts?.[0] || 'Historical programming trivia'}",
    "conclusion": "Mastery recap",
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
            { title: 'The Problem It Solves', content: [`Let's explore why ${topic} is indispensable in modern engineering.`], duration: isLongForm ? 180 : 20 },
            { title: 'Under The Hood Walkthrough', content: [`Here is how the data structures and execution flow operate.`], duration: isLongForm ? 240 : 20 },
            { title: 'Practical Code Example', content: [`Let's write out the clean implementation and examine each line.`], duration: isLongForm ? 240 : 20 }
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
      return {
        title: sec.title,
        content: Array.isArray(sec.content) ? sec.content : [sec.content],
        duration: sec.duration || 60,
        visual: {
          type: visual.visualType || 'flow_diagram',
          description: visual.visualDescription || 'Visual concept illustration',
          diagramLayout: visual.diagramLayout || null,
          headline: visual.onScreenHeadline || sec.title,
          codeSnippet: visual.codeSnippet || null
        }
      };
    });

    return {
      title: refactoredData?.title || candidate.title,
      hook: refactoredData?.hook || candidate.hook,
      sections: finalSections,
      funFact: refactoredData?.funFact || candidate.funFact,
      conclusion: refactoredData?.conclusion || candidate.conclusion,
      callToAction: refactoredData?.cta || candidate.cta,
      duration: finalSections.reduce((acc, s) => acc + (s.duration || 60), 0)
    };
  }
}

module.exports = { FinalScriptEditor };
