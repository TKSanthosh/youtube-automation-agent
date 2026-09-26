const { Logger } = require('../logger');

class AudienceAnalyst {
  constructor(aiTextService) {
    this.ai = aiTextService;
    this.logger = new Logger('AudienceAnalyst');
  }

  async analyze(topic, research) {
    this.logger.info(`Analyzing target audience mindset for: "${topic}"`);
    const prompt = `You are a Cognitive Learning Specialist and Audience Retention Analyst for top-tier technical educational YouTube channels.

Topic: "${topic}"
Research Summary: ${JSON.stringify(research.coreConcepts)}

Design the pedagogical framework to teach this topic progressively:
Simple Concept → Intuition → Visual Explanation → Technical Explanation → Real-World Example → Deeper Understanding.

Provide a JSON response:
{
  "targetAudience": "developers, CS students, engineers wanting mastery",
  "prerequisiteKnowledge": ["what they already know"],
  "confusionTriggers": ["what will cause cognitive overload if introduced too early"],
  "questionsNaturallyAsked": ["questions viewers will think at each stage"],
  "progressiveStages": [
    { "stage": "1. Simple Concept", "goal": "relatable non-jargon overview", "keyQuestion": "What is this actually?" },
    { "stage": "2. Intuition & Metaphor", "goal": "mental model through analogy", "keyQuestion": "What does it look like in real life?" },
    { "stage": "3. Visual Explanation", "goal": "diagrammatic or architectural flow", "keyQuestion": "How do the parts interact visually?" },
    { "stage": "4. Technical Explanation", "goal": "exact code, APIs, and syntax", "keyQuestion": "How do I write and execute this?" },
    { "stage": "5. Real-World Example", "goal": "practical production scenario", "keyQuestion": "Where does this solve a real problem?" },
    { "stage": "6. Deeper Understanding", "goal": "internals, edge cases, gotchas", "keyQuestion": "What happens when things break or scale?" }
  ]
}
Respond strictly with valid JSON.`;

    try {
      const response = await this.ai.generateText(prompt);
      return JSON.parse(response.replace(/^```json/i, '').replace(/```$/, '').trim());
    } catch (err) {
      return {
        targetAudience: 'Software developers and CS students',
        prerequisiteKnowledge: ['Basic syntax and variable scoping'],
        confusionTriggers: ['Premature deep-dive into bytecode or complex syntax before the mental model is set'],
        questionsNaturallyAsked: ['Why should I use this instead of the standard way?', 'How does it work under the hood?'],
        progressiveStages: [
          { stage: 'Simple Concept', goal: 'Relatable overview', keyQuestion: 'What problem does this solve?' },
          { stage: 'Intuition', goal: 'Mental model', keyQuestion: 'How does it work in simple terms?' },
          { stage: 'Visual Explanation', goal: 'Diagrammatic flow', keyQuestion: 'What does the flow look like?' },
          { stage: 'Technical Code', goal: 'Exact syntax and walkthrough', keyQuestion: 'How do we code this?' },
          { stage: 'Real-World Case', goal: 'Production deployment', keyQuestion: 'How is it used at scale?' },
          { stage: 'Internals & Gotchas', goal: 'Edge cases', keyQuestion: 'What are the common pitfalls?' }
        ]
      };
    }
  }
}

module.exports = { AudienceAnalyst };
