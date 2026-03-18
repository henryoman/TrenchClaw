import { z } from "zod";

export const nonEmptyTrimmedStringSchema = z.string().trim().min(1);
export const unixMillisecondsSchema = z.number().int().nonnegative();
export const nonNegativeIntegerSchema = z.number().int().nonnegative();
export const positiveIntegerSchema = z.number().int().positive();
export const confidenceSchema = z.number().min(0).max(1);

export const jobIdSchema = nonEmptyTrimmedStringSchema;
export const botIdSchema = nonEmptyTrimmedStringSchema;
export const conversationIdSchema = nonEmptyTrimmedStringSchema;
export const chatMessageIdSchema = nonEmptyTrimmedStringSchema;
export const sessionIdSchema = nonEmptyTrimmedStringSchema;
export const instanceIdSchema = nonEmptyTrimmedStringSchema;
export const factIdSchema = nonEmptyTrimmedStringSchema;
export const factKeySchema = nonEmptyTrimmedStringSchema;
export const idempotencyKeySchema = nonEmptyTrimmedStringSchema;
