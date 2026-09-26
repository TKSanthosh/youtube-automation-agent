const { Logger } = require('../logger');

class ScriptRefactorer {
  constructor(aiTextService) {
    this.ai = aiTextService;
    this.logger = new Logger('ScriptRefactorer');
  }

  async refactor(candidateScript, auditFeedback) {
    this.logger.info(`Aggressively refactoring script for professional YouTube spoken delivery...`);
    const prompt = `You are an elite YouTube Technical Scriptwriter and Speech Coach.
Refactor and elevate this script draft into an engaging, clear, highly articulated technical masterclass.

Original Candidate:
Title: ${candidateScript.title}
Hook: ${candidateScript.hook?.text || candidateScript.hook}
Content: ${JSON.stringify(candidateScript.sections || candidateScript.mainContent?.sections || []).slice(0, 3000)}

Audit Feedback to incorporate:
${JSON.stringify(auditFeedback).slice(0, 1500)}

REFACTORING MANDATES:
1. Write for the EAR, not the eye. Use punchy, conversational, authoritative speech.
2. Zero passive corporate jargon.
3. Every chapter must open with purpose and end with a bridge to the next concept.
4. Seamlessly incorporate code callouts and visual cues.
5. Emphasize "why this matters" before "how it works".

Provide a JSON response with the refactored script:
{
  "title": "Clean, highly clickable technical title (under 95 chars)",
  "hook": { "text": "curiosity-driven opening 10-15s", "duration": "0:00-0:15" },
  "sections": [
    {
      "title": "Chapter Title",
      "content": ["Spoken sentence 1.", "Spoken sentence 2.", "Spoken sentence 3.", "Spoken sentence 4."],
      "duration": 60,
      "visualFocus": "brief description of accompanying visual"
    }
  ],
  "funFact": "Surprising origin story or tech trivia",
  "conclusion": {
    "recap": ["key takeaway 1", "key takeaway 2", "key takeaway 3"],
    "finalThought": "inspiring closing technical wisdom"
  },
  "cta": { "text": "Subtle, non-pushy engineering call to action", "duration": "10s" }
}
Respond strictly with valid JSON.`;

    try {
      const response = await this.ai.generateText(prompt);
      return JSON.parse(response.replace(/^```json/i, '').replace(/```$/, '').trim());
    } catch (err) {
      return candidateScript;
    }
  }
}

module.exports = { ScriptRefactorer };
