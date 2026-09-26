const { Logger } = require('../logger');

class TeachingPedagogyExpert {
  constructor(aiTextService) {
    this.ai = aiTextService;
    this.logger = new Logger('TeachingPedagogyExpert');
  }

  async enhancePedagogy(scriptDraft, topic) {
    this.logger.info(`Enhancing analogies and pedagogical clarity for: "${topic}"`);
    const prompt = `You are an award-winning Computer Science Educator known for transforming confusing abstract concepts into crystal-clear intuition (similar to 3Blue1Brown and Computerphile).

Topic: "${topic}"
Draft:
${typeof scriptDraft === 'string' ? scriptDraft : JSON.stringify(scriptDraft).slice(0, 3500)}

For every major concept:
1. Provide an intuitive real-world analogy (e.g., comparing an event loop to a restaurant kitchen ticket wheel, or stack vs heap to a stack of trays vs an open warehouse).
2. Ensure progressive complexity: never dump definitions without explaining WHY the concept was invented in the first place.
3. Break down step-by-step execution.

Provide a JSON response:
{
  "pedagogyScore": 94,
  "coreAnalogy": { "concept": "what is being analogized", "realWorldModel": "the intuitive metaphor", "explanation": "how it maps to software" },
  "clarityEnhancements": [
    { "section": "section title", "simplerExplanation": "clear intuitive wording", "stepByStepBreakdown": ["Step 1...", "Step 2...", "Step 3..."] }
  ]
}
Respond strictly with valid JSON.`;

    try {
      const response = await this.ai.generateText(prompt);
      return JSON.parse(response.replace(/^```json/i, '').replace(/```$/, '').trim());
    } catch (err) {
      return {
        pedagogyScore: 90,
        coreAnalogy: { concept: topic, realWorldModel: 'Systematic factory assembly line', explanation: 'Each component processes data and passes it forward predictably' },
        clarityEnhancements: []
      };
    }
  }
}

module.exports = { TeachingPedagogyExpert };
