const { Logger } = require('../logger');

class EngagementEditor {
  constructor(aiTextService) {
    this.ai = aiTextService;
    this.logger = new Logger('EngagementEditor');
  }

  async optimizeRetention(scriptDraft, topic) {
    this.logger.info(`Auditing audience retention and pacing for: "${topic}"`);
    const prompt = `You are a YouTube Retention Director specializing in long-form technical video engagement.

Topic: "${topic}"
Draft:
${typeof scriptDraft === 'string' ? scriptDraft : JSON.stringify(scriptDraft).slice(0, 3500)}

Analyze specifically for viewer drop-off risks:
- Identify long-winded paragraphs and tighten them.
- Eliminate repetitive phrasing and unnecessary throat-clearing.
- Insert "Curiosity Loops" (e.g. "Now, this looks completely solved—until you run 10,000 requests concurrently. Watch what happens here...").
- Keep transitions seamless and energetic.

Provide a JSON response:
{
  "retentionScore": 91,
  "curiosityLoops": [
    { "timestampEstimate": "2:30", "openLoopText": "hook question that delays payoff", "resolvedAt": "5:00" },
    { "timestampEstimate": "8:00", "openLoopText": "unexpected failure teaser", "resolvedAt": "11:30" }
  ],
  "pacingFixes": [
    { "section": "name", "action": "cut_filler | tighten_rhythm | add_challenge", "recommendation": "specific edit" }
  ]
}
Respond strictly with valid JSON.`;

    try {
      const response = await this.ai.generateText(prompt);
      return JSON.parse(response.replace(/^```json/i, '').replace(/```$/, '').trim());
    } catch (err) {
      return {
        retentionScore: 90,
        curiosityLoops: [{ timestampEstimate: '3:00', openLoopText: 'That seems straightforward, but what happens when memory runs out?', resolvedAt: '6:00' }],
        pacingFixes: []
      };
    }
  }
}

module.exports = { EngagementEditor };
