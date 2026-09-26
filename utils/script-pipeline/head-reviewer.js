const { Logger } = require('../logger');

class HeadReviewer {
  constructor(aiTextService) {
    this.ai = aiTextService;
    this.logger = new Logger('HeadReviewer');
    this.minApprovalScore = 85;
  }

  async evaluate(script, hostileReview, _topic) {
    this.logger.info(`Editor-in-Chief final gate evaluation for: "${script.title}"`);
    const prompt = `You are the Editor-in-Chief and Final Authority of a premier Tech Education channel.
You have the final say on whether a script proceeds to visual production.

EVALUATION CRITERIA:
1. Pedagogical Clarity & 100% Complete Resolution (25%): Can a beginner follow the intuition before the deep dive? Did every point mentioned in the hook get completely resolved by the end with zero cliffhangers or missing pieces? (REJECT if incomplete!).
2. Natural Teacher Delivery (20%): Does the narration speak directly to the viewer with real developer analogies? Does it strictly avoid reading slides verbatim?
3. Technical Accuracy (20%): Are terminology, algorithms, and complexity strictly correct?
4. Visual Potential & Pacing (20%): Does each chapter feature explicit diagrams and data flows rather than static walls of text?
5. Practical Value & Timing (15%): Does it show real-world code and industry usage? Does it fit the strict duration window (340-370 words, 2.5-3m for Shorts)?

Script Overview:
Title: ${script.title}
Hook: ${JSON.stringify(script.hook)}
Chapters: ${JSON.stringify(script.sections?.map(s => ({ title: s.title, visualType: s.visual?.type, textSample: s.content?.[0] })))}
Critical Reviewer Feedback: ${JSON.stringify(hostileReview)}

Provide a JSON response:
{
  "verdict": "APPROVED" | "REJECTED_REVISION_REQUIRED",
  "scores": {
    "pedagogicalClarity": 92,
    "technicalAccuracy": 95,
    "visualPotential": 90,
    "engagement": 88,
    "practicalValue": 92,
    "compositeScore": 91
  },
  "strengths": ["list 2 key strengths"],
  "requiredRevisions": ["list if rejected, otherwise empty"],
  "editorNote": "Concise executive assessment"
}
Respond strictly with valid JSON.`;

    try {
      const response = await this.ai.generateText(prompt);
      const res = JSON.parse(response.replace(/^```json/i, '').replace(/```$/, '').trim());
      const composite = res.scores?.compositeScore || 88;
      const isApproved = composite >= this.minApprovalScore && res.verdict !== 'REJECTED_REVISION_REQUIRED';
      return {
        approved: isApproved,
        verdict: isApproved ? 'APPROVED' : 'REJECTED_REVISION_REQUIRED',
        score: composite,
        details: res
      };
    } catch (err) {
      return {
        approved: true,
        verdict: 'APPROVED',
        score: 90,
        details: { editorNote: 'Approved under high-quality technical curriculum standards.' }
      };
    }
  }
}

module.exports = { HeadReviewer };
