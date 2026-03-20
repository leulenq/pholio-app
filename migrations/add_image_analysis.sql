-- Migration: Add image analysis columns to profiles table
-- Run: psql -d pholio -f migrations/add_image_analysis.sql

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS image_analysis JSONB;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS look_descriptor TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS look_descriptor_generated_at TIMESTAMP;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS image_analyzed_at TIMESTAMP;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS image_analysis_model VARCHAR(100);
