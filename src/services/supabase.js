import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client - only if configured
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// App identifier for this application
const APP_SLUG = 'guestbook';

// Create a lazy-initialized client
let supabaseInstance = null;
let appId = null;

function getSupabase() {
  if (!supabaseInstance && isSupabaseConfigured()) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  }
  return supabaseInstance;
}

/**
 * Get the app ID for this application
 */
async function getAppId() {
  if (appId) return appId;
  
  const supabase = getSupabase();
  if (!supabase) return null;
  
  try {
    const { data, error } = await supabase
      .from('apps')
      .select('id')
      .eq('slug', APP_SLUG)
      .single();
    
    if (!error && data) {
      appId = data.id;
    }
    return appId;
  } catch (e) {
    console.warn('Could not fetch app ID:', e);
    return null;
  }
}

/**
 * Check if Supabase is properly configured
 */
export function isSupabaseConfigured() {
  return supabaseUrl && supabaseAnonKey && 
         supabaseUrl.length > 0 && 
         supabaseAnonKey.length > 0 &&
         supabaseUrl !== 'your_supabase_url_here' && 
         supabaseAnonKey !== 'your_anon_key_here';
}

/**
 * Save a generated poem to the database
 * @param {Object} data - Poem data
 * @param {string} data.emotion - The emotion/word that inspired the poem
 * @param {string} data.poem - The generated poem
 * @param {string} [data.illustration] - Background image URL
 * @param {string} [data.audioUrl] - Audio narration URL
 * @param {string} [data.sessionId] - Optional session ID for tracking
 * @returns {Promise<Object>} - The saved record
 */
export async function savePoem({ emotion, poem, illustration = null, audioUrl = null, sessionId = null, model = 'gpt-4o' }) {
  const supabase = getSupabase();
  
  if (!supabase) {
    console.warn('⚠️ Supabase not configured, skipping save');
    return null;
  }
  
  try {
    console.log('💾 Saving poem to Supabase...', { emotion, illustration, audioUrl });
    
    // Get app ID for ecosystem tracking
    const currentAppId = await getAppId();
    
    const { data, error } = await supabase
      .from('poems')
      .insert([
        { 
          emotion: emotion.toLowerCase().trim(),
          poem: poem,
          image_url: illustration,
          audio_url: audioUrl,
          app_id: currentAppId,
          session_id: sessionId,
          language: 'es',
          ai_model: model
        }
      ])
      .select()
      .single();
    
    if (error) {
      console.error('❌ Supabase Error:', error);
      throw error;
    }
    
    console.log('✅ Poem saved:', data);
    return data;
  } catch (error) {
    console.error('❌ Error saving poem:', error);
    // Don't throw - saving is not critical for the user experience
    return null;
  }
}

/**
 * Get recent poems for the carousel
 * @param {number} limit 
 */
export async function getRecentPoems(limit = 10) {
  return getAllPoems({ limit, appSlug: APP_SLUG });
}

/**
 * Get all poems from the database
 * @param {Object} [options] - Query options
 * @param {number} [options.limit=50] - Max number of poems to return
 * @param {string} [options.appSlug] - Filter by app slug
 * @returns {Promise<Array>} - List of poems
 */
export async function getAllPoems({ limit = 50, appSlug = null } = {}) {
  const supabase = getSupabase();
  
  if (!supabase) {
    return [];
  }
  
  try {
    let query = supabase
      .from('poems')
      .select(`
        *,
        apps:app_id (slug, name)
      `)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    // Filter by app if specified
    if (appSlug) {
      const { data: app } = await supabase
        .from('apps')
        .select('id')
        .eq('slug', appSlug)
        .single();
      
      if (app) {
        query = query.eq('app_id', app.id);
      }
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    console.error('❌ Error fetching poems:', error);
    return [];
  }
}

/**
 * Get poems by emotion
 * @param {string} emotion - The emotion to filter by
 * @returns {Promise<Array>} - List of poems with that emotion
 */
export async function getPoemsByEmotion(emotion) {
  const supabase = getSupabase();
  
  if (!supabase) {
    return [];
  }
  
  try {
    const { data, error } = await supabase
      .from('poems')
      .select(`
        *,
        apps:app_id (slug, name)
      `)
      .ilike('emotion', `%${emotion}%`)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    console.error('❌ Error fetching poems:', error);
    return [];
  }
}

/**
 * Get poem statistics (uses the poem_stats view)
 * @returns {Promise<Array>} - Statistics by emotion
 */
export async function getPoemStats() {
  const supabase = getSupabase();
  
  if (!supabase) {
    return [];
  }
  
  try {
    const { data, error } = await supabase
      .from('poem_stats')
      .select('*')
      .limit(20);
    
    if (error) throw error;
    
    return data || [];
  } catch (error) {
    console.error('❌ Error fetching poem stats:', error);
    return [];
  }
}

/**
 * Create or get a session for tracking
 * @param {Object} [deviceInfo] - Optional device information
 * @returns {Promise<string|null>} - Session ID
 */
export async function createSession(deviceInfo = {}) {
  const supabase = getSupabase();
  
  if (!supabase) {
    return null;
  }
  
  try {
    const currentAppId = await getAppId();
    
    const { data, error } = await supabase
      .from('sessions')
      .insert([
        {
          app_id: currentAppId,
          device_info: deviceInfo
        }
      ])
      .select()
      .single();
    
    if (error) throw error;
    
    return data?.id || null;
  } catch (error) {
    console.error('❌ Error creating session:', error);
    return null;
  }
}

/**
 * Upload a base64 image to Supabase Storage
 * @param {string} base64Data - Raw base64 string from OpenAI
 * @param {string} emotion - Emotion for filename
 * @returns {Promise<string|null>} - Permanent Public URL
 */
export async function uploadIllustration(base64Data, emotion) {
  const supabase = getSupabase();
  if (!supabase) return null; 

  try {
    const timestamp = Date.now();
    const safeName = (emotion || 'poem').trim().toLowerCase().replace(/[^a-z0-9]/g, '-');
    const filename = `${timestamp}-${safeName}.png`;

    // 1. Convert Base64 to Blob
    const res = await fetch(`data:image/png;base64,${base64Data}`);
    const blob = await res.blob();

    // 2. Upload to 'illustrations' bucket
    const { error: uploadError } = await supabase.storage
      .from('illustrations')
      .upload(filename, blob, {
        contentType: 'image/png',
        upsert: false
      });

    if (uploadError) throw uploadError;

    // 3. Get Public URL
    const { data } = supabase.storage
      .from('illustrations')
      .getPublicUrl(filename);

    console.log('✅ Image uploaded permanent URL:', data.publicUrl);
    return data.publicUrl;

  } catch (error) {
    console.error('❌ Error uploading illustration:', error);
    return null;
  }
}


/**
 * Upload a poem input image (DataURL) to Supabase Storage
 * @param {string} dataUrl - Data URL string (data:image/jpeg;base64,...)
 * @param {string} emotion - Emotion for filename
 * @returns {Promise<string|null>} - Permanent Public URL
 */
export async function uploadPoemInputImage(dataUrl, emotion) {
  const supabase = getSupabase();
  if (!supabase) return null; 

  try {
    const timestamp = Date.now();
    const safeName = (emotion || 'input').trim().toLowerCase().replace(/[^a-z0-9]/g, '-');
    const filename = `input-${timestamp}-${safeName}.jpg`;

    // 1. Convert DataURL to Blob
    const res = await fetch(dataUrl);
    const blob = await res.blob();

    // 2. Upload to 'illustrations' bucket
    const { error: uploadError } = await supabase.storage
      .from('illustrations')
      .upload(filename, blob, {
        contentType: 'image/jpeg',
        upsert: false
      });

    if (uploadError) throw uploadError;

    // 3. Get Public URL
    const { data } = supabase.storage
      .from('illustrations')
      .getPublicUrl(filename);

    console.log('✅ Input image uploaded permanent URL:', data.publicUrl);
    return data.publicUrl;

  } catch (error) {
    console.error('❌ Error uploading input image:', error);
    return null;
  }
}

/**
 * Upload audio blob to Supabase Storage
 * @param {Blob} audioBlob - Audio blob from ElevenLabs
 * @param {string} emotion - Emotion for filename
 * @returns {Promise<string|null>} - Permanent Public URL
 */
export async function uploadAudio(audioBlob, emotion) {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const timestamp = Date.now();
    const safeName = (emotion || 'poem').trim().toLowerCase().replace(/[^a-z0-9]/g, '-');
    const filename = `${timestamp}-${safeName}.mp3`;

    // Upload to 'audio' bucket
    const { error: uploadError } = await supabase.storage
      .from('audio')
      .upload(filename, audioBlob, {
        contentType: 'audio/mpeg',
        upsert: false
      });

    if (uploadError) throw uploadError;

    // Get Public URL
    const { data } = supabase.storage
      .from('audio')
      .getPublicUrl(filename);

    console.log('✅ Audio uploaded permanent URL:', data.publicUrl);
    return data.publicUrl;

  } catch (error) {
    console.error('❌ Error uploading audio:', error);
    return null;
  }
}

/**
 * Update poem with audio URL
 * @param {string} poemId - Poem ID to update
 * @param {string} audioUrl - Audio URL to save
 * @returns {Promise<boolean>} - Success status
 */
export async function updatePoemAudio(poemId, audioUrl) {
  const supabase = getSupabase();
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from('poems')
      .update({ audio_url: audioUrl })
      .eq('id', poemId);

    if (error) throw error;

    console.log('✅ Poem audio URL updated');
    return true;
  } catch (error) {
    console.error('❌ Error updating poem audio:', error);
    return false;
  }
}

