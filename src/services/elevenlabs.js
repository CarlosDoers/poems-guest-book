// ElevenLabs Text-to-Speech Service
const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

// Spanish voices - Choose one that fits the emotional tone
const VOICE_IDS = {
  // Pre-made voices (siempre disponibles)
  angela: 'FUfBrNit0NNZAwb58KWH', // Angela - french female
  bosco: '0vrPGvXHhDD3rbGURCk8', // Bosco - Spanish male
  oscar: 'LdJsUJ9dnNgwNnALzX1G', // Óscar - Spanish male
  
  // Voces en español recomendadas (pueden variar según tu cuenta)
  // Reemplaza estos IDs con los que encuentres en tu cuenta
  default: 'FUfBrNit0NNZAwb58KWH', // 👈 CAMBIA ESTE ID POR TU VOZ FAVORITA
  
  // Para agregar más voces:
  // 1. Ve a https://elevenlabs.io/app/voice-lab
  // 2. Copia el Voice ID de la voz que te guste
  // 3. Agrégala aquí:
  // miVozFavorita: 'tu_voice_id_aqui',
};

/**
 * Check if ElevenLabs is properly configured
 */
export function isElevenLabsConfigured() {
  return ELEVENLABS_API_KEY && 
         ELEVENLABS_API_KEY.length > 0 && 
         ELEVENLABS_API_KEY !== 'your_elevenlabs_api_key_here';
}

/**
 * Generate speech audio from text using ElevenLabs
 * @param {string} text - The poem text to convert to speech
 * @param {string} voiceId - Optional voice ID to use
 * @returns {Promise<Blob>} - Audio blob
 */
export async function generateSpeech(text, voiceId = VOICE_IDS.default) {
  if (!isElevenLabsConfigured()) {
    throw new Error('ElevenLabs API key not configured');
  }

  if (!text || text.trim().length === 0) {
    throw new Error('No text provided for speech generation');
  }

  try {
    
    const response = await fetch(`${ELEVENLABS_API_URL}/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2', // Best for Spanish
        voice_settings: {
          stability: 0.5, // 0-1, higher = more consistent
          similarity_boost: 0.75, // 0-1, higher = more similar to original voice
          style: 0.3, // 0-1, exaggeration of style
          use_speaker_boost: true
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API error:', errorText);
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    const audioBlob = await response.blob();
    console.log('✅ Speech generated successfully');
    
    return audioBlob;
  } catch (error) {
    console.error('Error generating speech:', error);
    throw error;
  }
}

/**
 * Create an audio URL from a poem text
 * @param {string} poemText - The poem to convert
 * @returns {Promise<string>} - Object URL for the audio
 */
export async function createPoemAudio(poemText) {
  // Keep line breaks - ElevenLabs handles them naturally for proper verse pauses
  const audioBlob = await generateSpeech(poemText);
  const audioUrl = URL.createObjectURL(audioBlob);
  
  return audioUrl;
}

/**
 * Cleanup audio URL to prevent memory leaks
 * @param {string} audioUrl - The URL to revoke
 */
export function cleanupAudioUrl(audioUrl) {
  if (audioUrl && audioUrl.startsWith('blob:')) {
    URL.revokeObjectURL(audioUrl);
  }
}
