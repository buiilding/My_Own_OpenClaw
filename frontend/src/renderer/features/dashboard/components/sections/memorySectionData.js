import {
  BookOpen,
  Clock,
  Workflow,
} from 'lucide-react';

export const MEMORY_TYPES = Object.freeze([
  {
    id: 'episodic',
    label: 'Episodic',
    icon: Clock,
    description: 'Interaction memories and short-lived context snapshots',
  },
  {
    id: 'semantic',
    label: 'Semantic',
    icon: BookOpen,
    description: 'Facts, preferences and distilled long-term knowledge',
  },
  {
    id: 'procedural',
    label: 'Procedural',
    icon: Workflow,
    description: 'Skills, routines and workflows',
  },
]);

function parseSemanticContent(content) {
  const normalized = (content || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return { summary: '(empty)', facts: [] };
  }

  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  let summary = '';
  let inFacts = false;
  const facts = [];

  lines.forEach((line) => {
    if (/^summary:/i.test(line)) {
      summary = line.replace(/^summary:/i, '').trim();
      inFacts = false;
      return;
    }
    if (/^facts:/i.test(line)) {
      inFacts = true;
      return;
    }
    if (inFacts) {
      facts.push(line.replace(/^-/, '').trim());
    } else if (!summary) {
      summary = line;
    }
  });

  return {
    summary: summary || lines[0],
    facts: facts.filter(Boolean),
  };
}

export function formatDateLabel(timestamp) {
  if (!timestamp) {
    return 'Unknown time';
  }
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown time';
  }
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildEpisodicTitle(content, fallbackIndex) {
  const raw = (content || '').split('\n').map((line) => line.trim()).find(Boolean) || '';
  if (!raw) {
    return `Episodic memory ${fallbackIndex + 1}`;
  }
  const normalized = raw
    .replace(/^user:\s*/i, '')
    .replace(/^assistant:\s*/i, '')
    .trim();
  return normalized.length > 84 ? `${normalized.slice(0, 81)}...` : normalized;
}

function extractAssistantResponse(content) {
  const normalized = (content || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return '';
  }

  const assistantMarkerMatch = normalized.match(/(?:^|\n)assistant:\s*/i);
  if (!assistantMarkerMatch || typeof assistantMarkerMatch.index !== 'number') {
    return '';
  }

  const assistantStart = assistantMarkerMatch.index + assistantMarkerMatch[0].length;
  const tail = normalized.slice(assistantStart).trim();
  if (!tail) {
    return '';
  }

  const nextRoleMatch = tail.match(/\n(?:user|assistant):\s*/i);
  if (!nextRoleMatch || typeof nextRoleMatch.index !== 'number') {
    return tail;
  }
  return tail.slice(0, nextRoleMatch.index).trim();
}

export function normalizeEpisodicMemories(memories = []) {
  return memories.map((memory, index) => {
    const detail = (memory?.content || '').trim() || '(empty memory)';
    const assistantResponse = extractAssistantResponse(memory?.content);
    const words = detail.split(/\s+/).filter(Boolean).length;

    return {
      id: memory?.id || `episodic-${index}`,
      title: buildEpisodicTitle(memory?.content, index),
      detail,
      assistantResponse,
      date: formatDateLabel(memory?.timestamp),
      tokens: Math.max(words, 0),
      source: memory?.metadata?.source || 'memory_store',
      timestamp: memory?.timestamp || null,
      backendMemoryId: memory?.id || null,
      backendType: 'episodic',
    };
  });
}

export function normalizeSemanticMemories(memories = []) {
  return memories.map((memory, index) => {
    const parsed = parseSemanticContent(memory?.content || '');
    const detail = parsed.facts.length > 0
      ? `${parsed.summary}\n\n${parsed.facts.map((fact) => `- ${fact}`).join('\n')}`
      : parsed.summary;

    return {
      id: memory?.id || `semantic-${index}`,
      title: parsed.summary || `Semantic memory ${index + 1}`,
      detail,
      confidence: memory?.metadata?.source === 'manual' ? 'Medium' : 'High',
      source: memory?.metadata?.source || 'semantic_summary',
      timestamp: memory?.timestamp || null,
      backendMemoryId: memory?.id || null,
      backendType: 'semantic',
    };
  });
}

export function buildProceduralMemories() {
  return [];
}
