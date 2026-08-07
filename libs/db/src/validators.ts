import { z } from 'zod';
import { Role } from '@vacti/core';

/** Hand-written Zod validators kept in sync with the Drizzle schema (no drizzle-zod coupling). */
export const insertUserSchema = z.object({
  email: z.string().email(),
  passwordHash: z.string().min(1),
  isSysAdmin: z.boolean().optional(),
});

export const insertProjectSchema = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9-]*$/, 'slug must be kebab-case'),
  name: z.string().min(1),
});

export const projectMemberRoleSchema = z.nativeEnum(Role);

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertProject = z.infer<typeof insertProjectSchema>;
