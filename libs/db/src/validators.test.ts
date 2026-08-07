import { describe, it, expect } from 'vitest';
import { insertUserSchema, insertProjectSchema, projectMemberRoleSchema } from './validators';

describe('db validators', () => {
  it('accepts a valid user and rejects a bad email', () => {
    expect(insertUserSchema.safeParse({ email: 'a@b.com', passwordHash: 'x' }).success).toBe(true);
    expect(insertUserSchema.safeParse({ email: 'nope', passwordHash: 'x' }).success).toBe(false);
  });

  it('enforces kebab-case project slug', () => {
    expect(insertProjectSchema.safeParse({ slug: 'acme-corp', name: 'Acme' }).success).toBe(true);
    expect(insertProjectSchema.safeParse({ slug: 'Acme Corp', name: 'Acme' }).success).toBe(false);
  });

  it('validates project member roles', () => {
    expect(projectMemberRoleSchema.safeParse('Auditor').success).toBe(true);
    expect(projectMemberRoleSchema.safeParse('Hacker').success).toBe(false);
  });
});
