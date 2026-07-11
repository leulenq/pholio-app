import { z } from 'zod';

/**
 * Client-side validation for the "add a bookout" mini-form
 * (AvailabilitySection, Discover WS9 talent-side surfaces). Mirrors the
 * server-side checks in src/domains/talent/routes/availability.js so the UI
 * can reject bad input before the round-trip: starts_on <= ends_on, no range
 * that has already fully elapsed (a range spanning today is fine), note
 * optional and capped at 200 characters.
 */
export const bookoutSchema = z
  .object({
    starts_on: z.string().min(1, 'Start date is required'),
    ends_on: z.string().min(1, 'End date is required'),
    note: z.string().max(200, 'Keep the note under 200 characters').optional().or(z.literal('')),
  })
  .refine((data) => data.starts_on <= data.ends_on, {
    message: 'Start date must be on or before the end date',
    path: ['ends_on'],
  })
  .refine(
    (data) => {
      const today = new Date().toISOString().slice(0, 10);
      return data.ends_on >= today;
    },
    {
      message: 'A bookout cannot end entirely in the past',
      path: ['ends_on'],
    },
  );
