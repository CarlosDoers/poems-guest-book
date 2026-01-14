// Edge Function: Get Poems API
// Provides a clean REST API for external developers to access poem data

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PoemResponse {
  id: string;
  emotion: string;
  poem: string;
  image_url: string | null;
  audio_url: string | null;
  created_at: string;
  language: string;
  ai_model: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    
    // Query parameters
    const limitParam = url.searchParams.get('limit') || '50'
    const limit = Math.min(Math.max(parseInt(limitParam), 1), 100) // Between 1-100
    const emotion = url.searchParams.get('emotion')
    const appSlug = url.searchParams.get('app') || 'guestbook'
    const poemId = url.searchParams.get('id') // For getting a specific poem

    // Initialize Supabase client with service role key (bypasses RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // If requesting a specific poem by ID
    if (poemId) {
      const { data, error } = await supabase
        .from('poems')
        .select('id, emotion, poem, image_url, audio_url, created_at, language, ai_model')
        .eq('id', poemId)
        .single()

      if (error) {
        return new Response(
          JSON.stringify({ 
            success: false,
            error: 'Poem not found'
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 404 
          }
        )
      }

      // Process poem text to remove line breaks
      const processedData = {
        ...data,
        poem: data.poem ? data.poem.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim() : data.poem
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          data: processedData
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    // Get app_id for filtering (if app slug is specified)
    let appId = null
    if (appSlug) {
      const { data: app } = await supabase
        .from('apps')
        .select('id')
        .eq('slug', appSlug)
        .single()
      
      appId = app?.id
    }

    // Build query for multiple poems
    let query = supabase
      .from('poems')
      .select('id, emotion, poem, image_url, audio_url, created_at, language, ai_model')
      .order('created_at', { ascending: false })
      .limit(limit)

    // Helper function to process poem text (remove line breaks for external API)
    const processPoemText = (poemText: string) => {
      return poemText.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
    }

    // Filter by app if found
    if (appId) {
      query = query.eq('app_id', appId)
    }

    // Filter by emotion if specified
    if (emotion) {
      query = query.ilike('emotion', `%${emotion}%`)
    }

    const { data, error } = await query

    if (error) throw error

    // Process all poems to remove line breaks
    const processedData = data?.map(poem => ({
      ...poem,
      poem: poem.poem ? poem.poem.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim() : poem.poem
    }))

    return new Response(
      JSON.stringify({ 
        success: true,
        data: processedData as PoemResponse[],
        count: processedData?.length || 0,
        params: {
          limit,
          emotion: emotion || null,
          app: appSlug
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error in get-poems function:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || 'Internal server error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
