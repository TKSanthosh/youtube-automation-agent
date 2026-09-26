const { Logger } = require('../logger');

class TopicResearcher {
  constructor(aiTextService) {
    this.ai = aiTextService;
    this.logger = new Logger('TopicResearcher');
  }

  async research(topic, niche = 'tech_education') {
    this.logger.info(`Deeply researching technical topic: "${topic}"`);
    const prompt = `You are an elite Senior Technical Researcher and Computer Science Professor.
Conduct deep technical research on: "${topic}" in the domain of ${niche}.

Provide a detailed JSON response with:
{
  "coreConcepts": ["list of 4-6 fundamental technical concepts"],
  "importantTerminology": [{"term": "name", "definition": "clear technical definition"}],
  "realWorldApplications": ["concrete production use cases in major tech companies"],
  "commonMisconceptions": ["common beginner/intermediate misconceptions and why they are wrong"],
  "concreteExamples": ["practical code or system examples to demonstrate"],
  "beginnerPainPoints": ["where people get stuck or confused"],
  "advancedInsights": ["deep internals, memory models, compiler/runtime optimizations, or algorithmic trade-offs"],
  "interestingFacts": ["fascinating historical trivia, origin stories, or surprising facts"],
  "evidenceBackedClaims": [{"claim": "statement", "reasoning": "technical justification"}]
}
Respond strictly with valid JSON.`;

    try {
      const response = await this.ai.generateText(prompt);
      const parsed = this.ai.parseJsonResponse ? this.ai.parseJsonResponse(response) : JSON.parse(response.replace(/^```json/i, '').replace(/```$/, '').trim());
      return parsed;
    } catch (err) {
      this.logger.warn(`AI research failed (${err.message}); generating fallback research blueprint.`);
      return {
        coreConcepts: [topic, 'Internal Architecture', 'Execution Flow', 'Performance Characteristics'],
        importantTerminology: [{ term: topic, definition: 'Core programming / computing paradigm' }],
        realWorldApplications: ['High-throughput distributed services', 'Scalable production software'],
        commonMisconceptions: ['Thinking it operates without memory overhead or blocking'],
        concreteExamples: ['Step-by-step code implementation demonstrating the mechanism'],
        beginnerPainPoints: ['Understanding state transitions and execution ordering'],
        advancedInsights: ['Event queue semantics, byte-level allocations, and CPU cache friendliness'],
        interestingFacts: ['Designed to resolve fundamental scaling bottlenecks in modern runtimes'],
        evidenceBackedClaims: [{ claim: `${topic} optimizes resource utilization`, reasoning: 'Minimizes redundant allocations and thread context switches' }]
      };
    }
  }
}

module.exports = { TopicResearcher };
