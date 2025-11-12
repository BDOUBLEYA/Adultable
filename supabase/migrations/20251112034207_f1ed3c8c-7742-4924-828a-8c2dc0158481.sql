-- Trigger types regeneration after remix
-- This comment migration forces Supabase to regenerate the TypeScript types file
-- with the actual database schema (tasks, forms, meal_plans, recommendations, etc.)

SELECT 1; -- No-op query to trigger migration system