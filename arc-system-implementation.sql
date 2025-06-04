-- SQL Migration Script for MP Basketball Development ARC System Implementation

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
DECLARE
    adv_level_1_uuid UUID := 'a0000001-adv1-0000-0000-000000000000';
    res_level_1_uuid UUID := 'r0000001-res1-0000-0000-000000000000';
    col_level_1_uuid UUID := 'c0000001-col1-0000-0000-000000000000';
BEGIN

-- 1. Create ARC Definition Tables
--------------------------------------------------------------------------------
-- Table for Advancement (A) Levels
CREATE TABLE IF NOT EXISTS arc_advancement_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    level_value INTEGER UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE arc_advancement_definitions IS 'Defines the levels for individual player Advancement (A) in the ARC model.';

-- Table for Responsibilities (R) Levels
CREATE TABLE IF NOT EXISTS arc_responsibility_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    level_value INTEGER UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE arc_responsibility_definitions IS 'Defines the levels for team role/Responsibilities (R) in the ARC model.';

-- Table for Collective Growth (C) Levels
CREATE TABLE IF NOT EXISTS arc_collective_growth_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    level_value INTEGER UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE arc_collective_growth_definitions IS 'Defines the levels for team Collective Growth (C) in the ARC model.';

-- 2. Seed ARC Definition Tables
--------------------------------------------------------------------------------
RAISE NOTICE 'Seeding ARC Advancement Definitions...';
-- Advancement (A) Levels (1-9)
INSERT INTO arc_advancement_definitions (id, level_value, name, description) VALUES
    (adv_level_1_uuid, 1, 'Base & Balance', 'Fundamental movement skills, body control, and athletic stance.'),
    (uuid_generate_v4(), 2, 'Ball Control', 'Basic dribbling, passing, and receiving skills; comfort with the ball.'),
    (uuid_generate_v4(), 3, 'Finishing Foundation', 'Developing layups (both hands), basic post moves, and close-range shots.'),
    (uuid_generate_v4(), 4, 'Reading Advantage', 'Recognizing simple advantages (e.g., 2v1, open teammate) and making appropriate decisions.'),
    (uuid_generate_v4(), 5, 'Creating Advantage', 'Using individual skills (dribble moves, screens) to create scoring opportunities for self or others.'),
    (uuid_generate_v4(), 6, 'Maintaining Advantage', 'Sustaining offensive flow, making secondary reads, and exploiting continued defensive imbalance.'),
    (uuid_generate_v4(), 7, 'Layered Reads', 'Processing multiple defensive actions and reactions to make complex decisions.'),
    (uuid_generate_v4(), 8, 'Complex Scenarios', 'Navigating and executing effectively in late-game situations, special plays, or against sophisticated defenses.'),
    (uuid_generate_v4(), 9, 'Endgame Creation', 'Consistently making high-level plays under pressure to win games; elite decision-making and execution.')
ON CONFLICT (level_value) DO NOTHING;

RAISE NOTICE 'Seeding ARC Responsibility Definitions...';
-- Responsibilities (R) Levels (1-6)
INSERT INTO arc_responsibility_definitions (id, level_value, name, description) VALUES
    (res_level_1_uuid, 1, 'Development Cadre', 'Focus on individual skill acquisition and understanding basic team concepts.'),
    (uuid_generate_v4(), 2, 'Rotational Contributor', 'Can execute specific roles and responsibilities effectively within limited minutes or situations.'),
    (uuid_generate_v4(), 3, 'Trusted Role Player', 'Reliably performs defined team roles, understands system, and makes consistent positive contributions.'),
    (uuid_generate_v4(), 4, 'On-Court Co-Leader', 'Demonstrates leadership qualities, communicates effectively, and helps guide teammates within the team system.'),
    (uuid_generate_v4(), 5, 'Team Leader', 'Primary on-court leader, sets tone, responsible for significant tactical execution and team cohesion.'),
    (uuid_generate_v4(), 6, 'Core Anchor', 'Franchise-level player, system often revolves around their strengths; embodies team identity and culture.')
ON CONFLICT (level_value) DO NOTHING;

RAISE NOTICE 'Seeding ARC Collective Growth Definitions...';
-- Collective Growth (C) Levels (1-6)
INSERT INTO arc_collective_growth_definitions (id, level_value, name, description) VALUES
    (col_level_1_uuid, 1, 'Foundation & Familiarity', 'Team learning basic structure, roles, and communication protocols; high coach dependency.'),
    (uuid_generate_v4(), 2, 'Collective Constraints & Roles', 'Team beginning to understand and operate within shared constraints and defined roles; coach scaffolding still significant.'),
    (uuid_generate_v4(), 3, 'Shared Decision Rules', 'Players start to use shared heuristics and decision rules to solve common game problems; less direct cueing needed.'),
    (uuid_generate_v4(), 4, 'Autonomous Execution', 'Team can execute tactical plans with minimal coach intervention; players make adjustments based on shared understanding.'),
    (uuid_generate_v4(), 5, 'Collective Accountability', 'Players hold each other accountable to team standards and tactical execution; peer coaching emerges.'),
    (uuid_generate_v4(), 6, 'Self-Regulating Cohesion', 'Team operates with high autonomy, adapts fluidly to game situations, and self-manages culture and performance; coach as facilitator.')
ON CONFLICT (level_value) DO NOTHING;

-- 3. Alter Existing Tables to Add ARC Foreign Key Columns
--------------------------------------------------------------------------------
RAISE NOTICE 'Altering person table...';
-- Person Table
-- Note: Existing integer columns like 'advancement_level', 'responsibility_tier' are not removed.
-- It's recommended to migrate data from old columns to new ones and then drop old columns in a separate step.
ALTER TABLE person
    ADD COLUMN IF NOT EXISTS arc_advancement_id UUID REFERENCES arc_advancement_definitions(id) DEFAULT adv_level_1_uuid,
    ADD COLUMN IF NOT EXISTS arc_responsibility_id UUID REFERENCES arc_responsibility_definitions(id) DEFAULT res_level_1_uuid;

COMMENT ON COLUMN person.arc_advancement_id IS 'FK to arc_advancement_definitions.id, tracks individual player''s Advancement (A) level.';
COMMENT ON COLUMN person.arc_responsibility_id IS 'FK to arc_responsibility_definitions.id, tracks individual player''s Responsibility (R) level/role.';

RAISE NOTICE 'Altering session table...';
-- Session Table
-- Note: Existing 'collective_growth_phase' (type might vary: JSONB, TEXT, INTEGER) is not removed.
ALTER TABLE session
    ADD COLUMN IF NOT EXISTS session_team_responsibility_id UUID REFERENCES arc_responsibility_definitions(id) DEFAULT res_level_1_uuid,
    ADD COLUMN IF NOT EXISTS session_collective_growth_id UUID REFERENCES arc_collective_growth_definitions(id) DEFAULT col_level_1_uuid;

COMMENT ON COLUMN session.session_team_responsibility_id IS 'FK to arc_responsibility_definitions.id, defines the team''s Responsibility (R) layer/context for this specific session.';
COMMENT ON COLUMN session.session_collective_growth_id IS 'FK to arc_collective_growth_definitions.id, defines the team''s Collective Growth (C) level/context for this specific session.';

RAISE NOTICE 'ARC System SQL migration script completed.';

END $$;
