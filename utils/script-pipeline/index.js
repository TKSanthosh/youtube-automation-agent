const { Logger } = require('../logger');
const { TopicResearcher } = require('./topic-researcher');
const { AudienceAnalyst } = require('./audience-analyst');
const { StoryHookSpecialist } = require('./story-hook-specialist');
const { TechnicalExpert } = require('./technical-expert');
const { TeachingPedagogyExpert } = require('./teaching-pedagogy-expert');
const { EngagementEditor } = require('./engagement-editor');
const { VisualDirector } = require('./visual-director');
const { ScriptRefactorer } = require('./script-refactorer');
const { CriticalReviewer } = require('./critical-reviewer');
const { FinalScriptEditor } = require('./final-script-editor');
const { HeadReviewer } = require('./head-reviewer');
const { ScenePlanner } = require('./scene-planner');

class MultiAgentScriptPipeline {
  constructor(aiTextService) {
    this.ai = aiTextService;
    this.logger = new Logger('ScriptPipeline');

    this.researcher = new TopicResearcher(aiTextService);
    this.audienceAnalyst = new AudienceAnalyst(aiTextService);
    this.hookSpecialist = new StoryHookSpecialist(aiTextService);
    this.techExpert = new TechnicalExpert(aiTextService);
    this.pedagogyExpert = new TeachingPedagogyExpert(aiTextService);
    this.engagementEditor = new EngagementEditor(aiTextService);
    this.visualDirector = new VisualDirector(aiTextService);
    this.refactorer = new ScriptRefactorer(aiTextService);
    this.reviewer = new CriticalReviewer(aiTextService);
    this.finalEditor = new FinalScriptEditor(aiTextService);
    this.headReviewer = new HeadReviewer(aiTextService);
    this.scenePlanner = new ScenePlanner();
  }

  async runPipeline(strategy, options = {}) {
    const topic = strategy.topic;
    const isLongForm = options.isLongForm || strategy.contentType === 'tutorial' || strategy.requestedLengthKey === 'long';
    this.logger.info(`=== Starting 10-Agent Collaborative Script Creation for: "${topic}" (${isLongForm ? 'Long-form Masterclass' : 'Short'}) ===`);

    // Step 1: Deep Research
    const research = await this.researcher.research(topic, strategy.niche || 'tech_education');

    // Step 2: Audience Mindset & Progressive Learning
    const audience = await this.audienceAnalyst.analyze(topic, research);

    // Step 3: High-Retention Story Hooks
    const hooks = await this.hookSpecialist.generateHooks(topic, research, audience);

    // Step 4: Generate Competing Candidate Scripts (Candidate A vs Candidate B)
    const candidates = await this.finalEditor.generateCandidates(topic, research, audience, hooks, isLongForm);
    const selectedCandidate = candidates.candidateA || candidates;

    // Step 5: Technical Audit
    const techAudit = await this.techExpert.audit(selectedCandidate, topic);

    // Step 6: Pedagogy & Analogies
    const pedagogyPlan = await this.pedagogyExpert.enhancePedagogy(selectedCandidate, topic);

    // Step 7: Engagement & Retention
    const retentionPlan = await this.engagementEditor.optimizeRetention(selectedCandidate, topic);

    // Step 8: Visual Sentence-by-Sentence Planning
    const visualPlan = await this.visualDirector.directVisuals(selectedCandidate.sections || [], topic);

    // Step 9: Aggressive Refactoring for Spoken YouTube Delivery
    const refactored = await this.refactorer.refactor(selectedCandidate, {
      techAudit,
      pedagogyPlan,
      retentionPlan
    });

    // Step 10: Adversarial Hostile Review
    const hostileReview = await this.reviewer.hostileReview(refactored, topic);

    // Synthesis into Master Script Draft
    let masterScript = this.finalEditor.synthesize(selectedCandidate, visualPlan.visualPlan, refactored);
    masterScript.isLongForm = isLongForm;

    // Step 11: Head Reviewer / Editor-in-Chief Gate
    let gateResult = await this.headReviewer.evaluate(masterScript, hostileReview, topic);
    this.logger.info(`Head Reviewer Gate Verdict: ${gateResult.verdict} (Score: ${gateResult.score}/100)`);

    let revisionAttempts = 0;
    while (!gateResult.approved && revisionAttempts < 2) {
      revisionAttempts++;
      this.logger.warn(`Script rejected by Editor-in-Chief. Running revision cycle #${revisionAttempts}...`);
      const revisedDraft = await this.refactorer.refactor(masterScript, gateResult.details);
      masterScript = this.finalEditor.synthesize(revisedDraft, visualPlan.visualPlan, revisedDraft);
      gateResult = await this.headReviewer.evaluate(masterScript, hostileReview, topic);
    }

    // Step 12: Generate Scene-by-Scene Production Plan
    const scenePlan = this.scenePlanner.planScenes(masterScript, isLongForm);
    masterScript.scenePlan = scenePlan;
    masterScript.pipelineMetadata = {
      research,
      audience,
      hooks,
      techAudit,
      pedagogyPlan,
      retentionPlan,
      hostileReview,
      gateResult
    };

    this.logger.info(`=== 10-Agent Script Pipeline COMPLETE: "${masterScript.title}" (${scenePlan.length} scenes planned) ===`);
    return masterScript;
  }
}

module.exports = { MultiAgentScriptPipeline };
