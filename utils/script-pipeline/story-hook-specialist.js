const { Logger } = require('../logger');

class StoryHookSpecialist {
  constructor(aiTextService) {
    this.ai = aiTextService;
    this.logger = new Logger('StoryHookSpecialist');
  }

  async generateHooks(topic, research, audience) {
    this.logger.info(`Crafting high-retention curiosity hooks for: "${topic}"`);
    const prompt = `You are a YouTube Retention Expert and Master Storyteller.
Topic: "${topic}"
Audience Questions: ${JSON.stringify(audience.questionsNaturallyAsked)}

RULES FOR HOOKS:
- ABSOLUTELY NO generic greetings like "Hello everyone, welcome back to the channel", "In this video we will discuss...", "Today I am going to show you..."
- ANTI-OVERPROMISING MANDATE: The hook MUST focus strictly on ONE singular, specific technical problem or mechanism that will be 100% taught and resolved in this video. NEVER promise a wide multi-topic curriculum (e.g. do not say "we will cover orchestration, networking, storage, and secrets"). If the topic is broad, scope it strictly as Part 1 for that singular piece.
- The opening 5-15 seconds must hook curiosity IMMEDIATELY with an unexpected insight, a critical bug, an invisible mechanism, or a thought-provoking challenge.
- Create 4 distinct hook archetypes:
  1. The "Invisible Mechanism" hook (Revealing what happens behind the scenes)
  2. The "Fatal Mistake / Gotcha" hook (A mistake 90% of developers make)
  3. The "Paradox / Curiosity Gap" hook (Counter-intuitive technical reality)
  4. The "Under the Hood Breakdown" hook (Deconstructing how a massive system works)

Provide a JSON response:
{
  "hooks": [
    { "type": "invisible_mechanism", "text": "exact spoken opening sentence", "visualCue": "what viewer sees on screen during this sentence", "curiosityScore": 95 },
    { "type": "fatal_mistake", "text": "exact spoken opening sentence", "visualCue": "what viewer sees on screen during this sentence", "curiosityScore": 93 },
    { "type": "paradox", "text": "exact spoken opening sentence", "visualCue": "what viewer sees on screen during this sentence", "curiosityScore": 91 },
    { "type": "under_the_hood", "text": "exact spoken opening sentence", "visualCue": "what viewer sees on screen during this sentence", "curiosityScore": 94 }
  ],
  "recommendedHookIndex": 0
}
Respond strictly with valid JSON.`;

    try {
      const response = await this.ai.generateText(prompt);
      return JSON.parse(response.replace(/^```json/i, '').replace(/```$/, '').trim());
    } catch (err) {
      return {
        hooks: [
          { type: 'invisible_mechanism', text: `Every time your software processes data, decisions happen in microseconds that can either run smoothly or crash your entire server. But who actually decides what runs first?`, visualCue: 'Animated request packet moving across architecture nodes', curiosityScore: 95 },
          { type: 'fatal_mistake', text: `Most developers write code that works in testing, but silently leaks memory and collapses under production traffic. Here is the exact gotcha—and how to prevent it.`, visualCue: 'Memory graph spiking into red overflow', curiosityScore: 92 }
        ],
        recommendedHookIndex: 0
      };
    }
  }
}

module.exports = { StoryHookSpecialist };
