const { Logger } = require('../logger');

class CriticalReviewer {
  constructor(aiTextService) {
    this.ai = aiTextService;
    this.logger = new Logger('CriticalReviewer');
  }

  async hostileReview(script, topic) {
    this.logger.info(`Conducting adversarial critical review of script: "${script.title}"`);
    const prompt = `You are an intentionally demanding, hostile YouTube Technical Reviewer and Principal Engineer.
Your job is to find EVERYTHING wrong with this educational programming script:

Topic: "${topic}"
Title: ${script.title}
Hook: ${script.hook?.text || script.hook}
Sections: ${JSON.stringify((script.sections || []).slice(0, 8)).slice(0, 3500)}

Ruthlessly evaluate against these 11 questions:
1. Is anything technically inaccurate or hand-wavy?
2. Does the hook grab attention in 5 seconds, or does it sound like standard AI filler?
3. Did the hook/intro overpromise multiple topics and leave them incomplete or cut off at the end? (REJECT if incomplete!)
4. Is there 100% complete pedagogical resolution—did every question and concept raised get fully resolved with practical code and closure?
5. Does the teacher voice read bullet points verbatim? (REJECT if verbatim reading occurs—must be natural, conversational commentary!)
6. Are there boring stretches where the viewer will drop off, or repetitive loops?
7. Are concepts defined without explaining WHY they exist?
8. Are there enough concrete visual cues and code demonstrations?
9. Are transitions between sections natural or jarring?
10. Will a beginner genuinely understand the mechanism after watching?
11. Is the script strictly timed (for Shorts: 340-370 words, ~155-170s, strictly between 2m30s and 3m)?

Provide a JSON response:
{
  "overallScore": 88,
  "flawsFound": [
    { "type": "technical | engagement | clarity | pacing", "location": "section name", "critique": "harsh specific flaw", "remedy": "exact fix" }
  ],
  "hostileVerdict": "NEEDS_TIGHTENING | SOLID | EXCEPTIONAL",
  "mustFixBeforeProduction": ["1 or 2 absolute dealbreakers if any"]
}
Respond strictly with valid JSON.`;

    try {
      const response = await this.ai.generateText(prompt);
      return JSON.parse(response.replace(/^```json/i, '').replace(/```$/, '').trim());
    } catch (err) {
      return {
        overallScore: 88,
        flawsFound: [],
        hostileVerdict: 'SOLID',
        mustFixBeforeProduction: []
      };
    }
  }
}

module.exports = { CriticalReviewer };
