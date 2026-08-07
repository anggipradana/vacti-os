import { describe, it, expect } from 'vitest';
import {
  buildNewsTriagePrompt,
  parseIrrelevantIndices,
  triageNewsRelevance,
  resolveAiModel,
  type AiProvider,
} from './ai';

describe('resolveAiModel', () => {
  it('keeps the stored model for a provider, or falls back to a default', () => {
    expect(resolveAiModel('openai', 'gpt-4o')).toBe('gpt-4o');
    expect(resolveAiModel('openai', '')).toBe('gpt-4o-mini');
    expect(resolveAiModel('ollama', 'llama3.2')).toBe('llama3.2');
    expect(resolveAiModel('ollama', '')).toBe('llama3');
  });
});

describe('news triage helpers', () => {
  it('builds a prompt that lists candidates and learns from examples', () => {
    const { system, prompt } = buildNewsTriagePrompt({
      context: 'banking sector security news',
      irrelevantExamples: ['Bank opens new branch in Bali'],
      relevantExamples: ['Major bank hit by ransomware'],
      candidates: ['Phishing campaign targets bank customers', 'New gardening tips'],
    });
    expect(system).toContain('IRRELEVANT');
    expect(prompt).toContain('banking sector security news');
    expect(prompt).toContain('1. Phishing campaign targets bank customers');
    expect(prompt).toContain('2. New gardening tips');
    expect(prompt).toContain('Bank opens new branch in Bali'); // negative example included
  });

  it('parses a JSON array of indices, dropping out-of-range / non-integer / dupes', () => {
    expect(parseIrrelevantIndices('Sure: [2, 2, 5, 9, "x"]', 5)).toEqual([2, 5]);
    expect(parseIrrelevantIndices('[]', 5)).toEqual([]);
    expect(parseIrrelevantIndices('no array here', 5)).toEqual([]);
    expect(parseIrrelevantIndices('garbage [1,3] trailing', 3)).toEqual([1, 3]);
  });

  it('triageNewsRelevance short-circuits on empty candidates and maps provider output', async () => {
    const provider: AiProvider = { generate: async () => '[2]' };
    expect(
      await triageNewsRelevance(
        { context: 'c', irrelevantExamples: [], relevantExamples: [], candidates: [] },
        provider,
      ),
    ).toEqual([]);
    const idx = await triageNewsRelevance(
      { context: 'c', irrelevantExamples: [], relevantExamples: [], candidates: ['a', 'b', 'c'] },
      provider,
    );
    expect(idx).toEqual([2]);
  });
});
