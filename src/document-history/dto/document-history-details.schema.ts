import { z } from 'zod';

export const DocumentHistoryDetailsSchema = z.record(z.string(), z.unknown());

export type DocumentHistoryDetails = z.infer<typeof DocumentHistoryDetailsSchema>;
