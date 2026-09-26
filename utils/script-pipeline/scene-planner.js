const { Logger } = require('../logger');

class ScenePlanner {
  constructor() {
    this.logger = new Logger('ScenePlanner');
  }

  planScenes(script, isLongForm) {
    this.logger.info(`Generating detailed scene-by-scene visual plan for: "${script.title}"`);
    const scenes = [];
    let sceneIndex = 1;

    // 1. Hook Scene
    scenes.push({
      sceneNumber: sceneIndex++,
      narration: typeof script.hook === 'object' ? script.hook.text : String(script.hook || ''),
      duration: isLongForm ? 15 : 8,
      visualType: 'architecture_diagram',
      diagramType: 'data_flow',
      visualDescription: 'Animated system flow showing data packets travelling between frontend, API, and worker nodes',
      animation: 'pulse_flow',
      onScreenText: script.title,
      code: null,
      transition: 'fade_zoom',
      purpose: 'Immediate curiosity gap & high-retention visual hook'
    });

    // 2. Sections / Chapters
    const sections = script.sections || [];
    sections.forEach((sec, idx) => {
      const visual = sec.visual || {};
      const sentences = Array.isArray(sec.content) ? sec.content : [sec.content || ''];
      
      // Determine appropriate diagram type
      let diagType = 'flow_diagram';
      const titleLower = (sec.title || '').toLowerCase();
      if (titleLower.includes('memory') || titleLower.includes('heap') || titleLower.includes('stack')) {
        diagType = 'memory_diagram';
      } else if (titleLower.includes('tree') || titleLower.includes('graph') || titleLower.includes('ast')) {
        diagType = 'tree_traversal';
      } else if (titleLower.includes('state') || titleLower.includes('lifecycle')) {
        diagType = 'state_machine';
      } else if (titleLower.includes('code') || titleLower.includes('syntax') || titleLower.includes('implementation')) {
        diagType = 'code_terminal';
      } else if (titleLower.includes('architecture') || titleLower.includes('pipeline')) {
        diagType = 'architecture_diagram';
      }

      scenes.push({
        sceneNumber: sceneIndex++,
        chapterTitle: sec.title,
        narration: sentences.join(' '),
        duration: sec.duration || 60,
        visualType: visual.type || diagType,
        diagramType: diagType,
        diagramLayout: visual.diagramLayout || null,
        visualDescription: visual.description || `Dynamic visualization of ${sec.title}`,
        animation: idx % 2 === 0 ? 'step_by_step_highlight' : 'node_pulse_traverse',
        onScreenText: visual.headline || sec.title,
        code: visual.codeSnippet || (diagType === 'code_terminal' ? sentences.find(s => s.includes('(') || s.includes('=')) : null),
        transition: 'slide_left',
        purpose: `Teach ${sec.title} with interactive visual representation`
      });

      // Fun fact intermission if present on 3rd chapter
      if (idx === 2 && script.funFact) {
        scenes.push({
          sceneNumber: sceneIndex++,
          chapterTitle: '💡 Did You Know?',
          narration: `Here is a fascinating historical fact: ${script.funFact}`,
          duration: 12,
          visualType: 'trivia_callout',
          diagramType: 'callout_box',
          visualDescription: 'Spotlight trivia card highlighting historical computer science insight',
          animation: 'reveal_bounce',
          onScreenText: 'DID YOU KNOW?',
          code: null,
          transition: 'fade',
          purpose: 'Audience retention pattern interrupt and delight'
        });
      }
    });

    // 3. Conclusion & Takeaways Scene
    scenes.push({
      sceneNumber: sceneIndex++,
      chapterTitle: 'Key Takeaways',
      narration: typeof script.conclusion === 'object' 
        ? (script.conclusion.recap || []).join('. ') + ' ' + (script.conclusion.finalThought || '')
        : String(script.conclusion || ''),
      duration: isLongForm ? 25 : 8,
      visualType: 'comparison_matrix',
      diagramType: 'summary_cards',
      visualDescription: 'Structured recap grid with highlighted core takeaways and architectural trade-offs',
      animation: 'stagger_reveal',
      onScreenText: 'Summary & Next Steps',
      code: null,
      transition: 'smooth_fade',
      purpose: 'Solidify viewer understanding and educational closure'
    });

    // 4. CTA Scene
    scenes.push({
      sceneNumber: sceneIndex++,
      chapterTitle: 'Code & AI Academy',
      narration: typeof script.callToAction === 'object' ? script.callToAction.text : String(script.callToAction || 'Subscribe for deep-dive tutorials.'),
      duration: isLongForm ? 12 : 5,
      visualType: 'call_to_action',
      diagramType: 'channel_branding',
      visualDescription: 'Clean terminal CTA card with Subscribe, Like, and GitHub repository links',
      animation: 'pulse',
      onScreenText: 'Code & AI Academy',
      code: null,
      transition: 'fade',
      purpose: 'Engage viewer community'
    });

    return scenes;
  }
}

module.exports = { ScenePlanner };
