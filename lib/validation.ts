import { z } from "zod";

export const councilRunSchema = z.object({
  prompt: z.string().min(1).max(12000),
  models: z.array(z.string().min(1)).min(1).max(8),
  judgeModel: z.string().min(1),
  debateDepth: z.number().int().min(1).max(4),
  researchEnabled: z.boolean(),
  saveHistory: z.boolean(),
  threadId: z.string().uuid().optional()
});

export const researchSchema = z.object({
  query: z.string().min(1).max(4000),
  limit: z.number().int().min(1).max(10).optional()
});

export const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]).default("member")
});

export const evalRunSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  rubric: z.string().min(1).max(6000),
  baselineLabel: z.string().max(120).optional(),
  items: z.array(z.object({ prompt: z.string().min(1).max(6000) })).min(1).max(5),
  models: z.array(z.string().min(1)).min(1).max(6),
  judgeModel: z.string().min(1),
  debateDepth: z.number().int().min(1).max(3).default(1),
  researchEnabled: z.boolean().default(false)
});
