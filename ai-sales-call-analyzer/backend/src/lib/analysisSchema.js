const { z } = require('zod');

const mistakeSchema = z.object({
  category: z.string(),
  severity: z.enum(['low', 'medium', 'high']),
  description: z.string(),
  evidence: z.string(),
  whyItIsWrong: z.string(),
  recommendation: z.string(),
  betterPhrase: z.string(),
});

const transcriptLineSchema = z.object({
  speaker: z.enum(['Sotuvchi', 'Mijoz']),
  timestamp: z.string(),
  text: z.string(),
});

const analysisResultSchema = z.object({
  overallScore: z.number().int().min(0).max(100),
  scores: z.object({
    communication: z.number().int().min(0).max(100),
    needDiscovery: z.number().int().min(0).max(100),
    productPresentation: z.number().int().min(0).max(100),
    objectionHandling: z.number().int().min(0).max(100),
    closing: z.number().int().min(0).max(100),
  }),
  summary: z.string(),
  customerNeed: z.string().nullable().optional(),
  customerObjection: z.string().nullable().optional(),
  customerIntent: z.string().nullable().optional(),
  strengths: z.array(z.string()),
  mistakes: z.array(mistakeSchema),
  transcript: z.array(transcriptLineSchema),
});

module.exports = { analysisResultSchema };
