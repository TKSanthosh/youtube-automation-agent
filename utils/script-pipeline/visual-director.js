const { Logger } = require('../logger');

class VisualDirector {
  constructor(aiTextService) {
    this.ai = aiTextService;
    this.logger = new Logger('VisualDirector');
  }

  async directVisuals(sections, topic) {
    this.logger.info(`Creating sentence-by-sentence visual architecture plan for: "${topic}"`);
    const prompt = `You are a Lead Motion Graphics Director and Technical Visualizer.
Convert technical tutorial concepts into explicit, rich visual diagrams.

CRITICAL RULE:
DO NOT default to static code or plain subtitles.
Every major concept must have a visual representation chosen from:
- "flow_diagram": Step-by-step process with moving data packets
- "architecture_diagram": System blocks (Client -> Gateway -> Microservice -> DB)
- "memory_diagram": Stack vs Heap allocation layout with pointers
- "tree_traversal": Binary tree or AST showing active node traversal
- "state_machine": State transitions (IDLE -> PENDING -> RESOLVED -> REJECTED)
- "api_data_flow": Animated HTTP request/response envelope moving through layers
- "code_terminal": Formatted dark IDE terminal with syntax highlight and line callouts
- "comparison_matrix": Split-screen before/after or paradigm trade-off table
- "trivia_callout": "Did You Know?" tech history spotlight

Sections to visualize:
${JSON.stringify(sections.map((s, idx) => ({ index: idx, title: s.title, summary: (Array.isArray(s.content) ? s.content.join(' ') : s.content || '').slice(0, 300) })))}

Provide a JSON response:
{
  "visualPlan": [
    {
      "sectionIndex": 0,
      "visualType": "architecture_diagram | flow_diagram | memory_diagram | tree_traversal | state_machine | api_data_flow | code_terminal | comparison_matrix | trivia_callout",
      "visualDescription": "precise description of what appears and animates on screen",
      "diagramLayout": {
        "nodes": ["Node A", "Node B", "Node C"],
        "connectionLabel": "data stream / function call / packet",
        "activeNode": "Node B"
      },
      "onScreenHeadline": "Short punchy 3-5 word headline",
      "codeSnippet": "clean 3-5 line code snippet if applicable, otherwise null"
    }
  ]
}
Respond strictly with valid JSON.`;

    try {
      const response = await this.ai.generateText(prompt);
      return JSON.parse(response.replace(/^```json/i, '').replace(/```$/, '').trim());
    } catch (err) {
      return {
        visualPlan: sections.map((s, idx) => ({
          sectionIndex: idx,
          visualType: idx % 3 === 0 ? 'architecture_diagram' : idx % 3 === 1 ? 'code_terminal' : 'flow_diagram',
          visualDescription: `Visual representation of ${s.title}`,
          diagramLayout: { nodes: ['Input', 'Processor', 'Output'], connectionLabel: 'Data Flow', activeNode: 'Processor' },
          onScreenHeadline: s.title ? s.title.slice(0, 30) : 'Core Architecture',
          codeSnippet: null
        }))
      };
    }
  }
}

module.exports = { VisualDirector };
