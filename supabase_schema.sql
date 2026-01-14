-- ============================================================
-- SUPABASE SCHEMA FOR MDF2026 ECOSYSTEM
-- Designed for multi-app backend sharing
-- ============================================================

-- ============================================================
-- CORE TABLES
-- ============================================================

-- Apps registry: tracks all apps in the ecosystem
CREATE TABLE IF NOT EXISTS apps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert the guestbook app
INSERT INTO apps (slug, name, description) VALUES 
  ('guestbook', 'Libro de Emociones', 'App de escritura de emociones y generación de poemas con IA')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- GUESTBOOK APP TABLES
-- ============================================================

-- Poems table: stores generated poems
CREATE TABLE IF NOT EXISTS poems (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Core poem data
  emotion TEXT NOT NULL,
  poem TEXT NOT NULL,
  
  -- Visualization
  image_url TEXT,
  
  -- Audio narration (ElevenLabs TTS)
  audio_url TEXT,
  
  -- App source tracking (for multi-app ecosystem)
  app_id UUID REFERENCES apps(id) ON DELETE SET NULL,
  
  -- Metadata
  language TEXT DEFAULT 'es',
  ai_model TEXT DEFAULT 'gpt-4o-mini',
  
  -- Optional session/user tracking (for future use)
  session_id UUID,
  user_id UUID,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_poems_emotion ON poems(emotion);
CREATE INDEX IF NOT EXISTS idx_poems_created_at ON poems(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_poems_app_id ON poems(app_id);
CREATE INDEX IF NOT EXISTS idx_poems_session_id ON poems(session_id);

-- ============================================================
-- OPTIONAL: Sessions table (for future multi-device tracking)
-- ============================================================

CREATE TABLE IF NOT EXISTS sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Session data
  device_info JSONB,
  ip_address INET,
  
  -- App association
  app_id UUID REFERENCES apps(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE poems ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Apps: read-only for anon
CREATE POLICY "Apps are viewable by everyone" ON apps
  FOR SELECT USING (true);

-- Poems: full CRUD for anon (adjust based on your security needs)
CREATE POLICY "Poems are viewable by everyone" ON poems
  FOR SELECT USING (true);

CREATE POLICY "Anyone can create poems" ON poems
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update their poems" ON poems
  FOR UPDATE USING (true);

-- Sessions: full CRUD for anon
CREATE POLICY "Sessions are viewable" ON sessions
  FOR SELECT USING (true);

CREATE POLICY "Anyone can create sessions" ON sessions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update sessions" ON sessions
  FOR UPDATE USING (true);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to poems
DROP TRIGGER IF EXISTS poems_updated_at ON poems;
CREATE TRIGGER poems_updated_at
  BEFORE UPDATE ON poems
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Apply trigger to sessions
DROP TRIGGER IF EXISTS sessions_updated_at ON sessions;
CREATE TRIGGER sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- VIEWS FOR EASY QUERYING
-- ============================================================

-- View for poem statistics by emotion
CREATE OR REPLACE VIEW poem_stats AS
SELECT 
  LOWER(emotion) as emotion,
  COUNT(*) as poem_count,
  MIN(created_at) as first_poem,
  MAX(created_at) as last_poem
FROM poems
GROUP BY LOWER(emotion)
ORDER BY poem_count DESC;

-- View for daily poem counts
CREATE OR REPLACE VIEW daily_poem_counts AS
SELECT 
  DATE(created_at) as date,
  COUNT(*) as poems_created
FROM poems
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- ============================================================
-- NOTES FOR FUTURE EXPANSION
-- ============================================================
-- 
-- To connect other apps to this ecosystem:
-- 1. Insert a new record in the 'apps' table
-- 2. Reference the app_id in your app-specific tables
-- 3. Use the same session_id across apps for user tracking
--
-- Example for a future app:
-- CREATE TABLE app_data (
--   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
--   app_id UUID REFERENCES apps(id),
--   session_id UUID REFERENCES sessions(id),
--   data JSONB,
--   created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
-- );
-- ============================================================
