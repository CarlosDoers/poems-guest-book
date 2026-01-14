import OpenAI from 'openai';

// API Key from environment variables
const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

// Lazy-initialized OpenAI client
let openaiInstance = null;

function getOpenAI() {
  if (!openaiInstance && isOpenAIConfigured()) {
    openaiInstance = new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true // Required for client-side usage
    });
  }
  return openaiInstance;
}

const SYSTEM_PROMPT_POET = `Eres un poeta español contemporáneo con un estilo minimalista y profundo. 
Tu especialidad es transformar emociones en versos que tocan el alma.

Reglas para tus poemas:
1. Siempre escribes en español
2. Tus poemas son evocadores y emotivos
3. Usas un lenguaje elegante pero accesible
4. Nunca incluyes el título ni la emoción en el poema
5. Prefieres el verso libre, evitas rimas forzadas
6. Tus poemas tienen entre 4 y 6 versos
7. Cada verso va en una línea separada
8. IMPORTANTE: Usa puntuación natural (comas, puntos) para marcar pausas y ritmo. Los versos son para visualización, pero la puntuación debe hacer que el poema se lea de forma fluida y natural cuando se recita sin pausas artificiales entre versos.

Responde SOLO con el poema, sin explicaciones ni comentarios.`;

const USER_PROMPT_POET = `Escribe un poema inspirado en la emoción: "{emotion}"`;

/**
 * Check if the OpenAI API is properly configured
 */
export function isOpenAIConfigured() {
  return apiKey && 
         apiKey.length > 0 && 
         apiKey.startsWith('sk-') &&
         apiKey !== 'your_openai_api_key_here';
}

// Alias for backwards compatibility
export const isGeminiConfigured = isOpenAIConfigured;

/**
 * Generate a poem based on an emotion using OpenAI
 * @param {string} emotion - The emotion or word to base the poem on
 * @returns {Promise<string>} - The generated poem
 */
export async function generatePoem(emotion) {
  const openai = getOpenAI();
  
  if (!openai) {
    throw new Error('Error de configuración: La API key de OpenAI no está configurada.');
  }
  
  try {
    console.log('✨ Generating poem for emotion:', emotion);
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_POET },
        { role: 'user', content: USER_PROMPT_POET.replace('{emotion}', emotion) }
      ],
      temperature: 0.9,
      max_tokens: 200,
    });
    
    const poem = completion.choices[0].message.content.trim();
    console.log('📝 Generated poem:', poem);
    
    return poem;
  } catch (error) {
    console.error('❌ OpenAI Poem Error:', error);
    throw error;
  }
}

/**
 * Recognize handwritten emotion from image using OpenAI Vision
 * @param {string} base64Image - Base64 encoded image from canvas
 * @returns {Promise<string>} - The recognized word/emotion
 */
export async function recognizeEmotionFromImage(base64Image) {
  const openai = getOpenAI();
  
  if (!openai) {
    throw new Error('Error de configuración: La API key de OpenAI no está configurada.');
  }
  
  try {
    console.log('👁️ Recognizing handwriting...');
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // GPT-4o-mini has vision capabilities and is fast
      messages: [
        {
          role: "user",
          content: [
            { 
              type: "text", 
              text: "Esta imagen contiene una sola palabra escrita a mano (una emoción o sentimiento). Transcribe SOLO esa palabra en español. Si no hay nada escrito o es ilegible, responde 'NULL'. Ignora líneas de fondo o ruido. Solo la palabra." 
            },
            {
              type: "image_url",
              image_url: {
                "url": base64Image,
                "detail": "low" // Low detail is enough for handwriting and faster
              },
            },
          ],
        },
      ],
      max_tokens: 10,
    });

    let recognizedText = response.choices[0].message.content.trim();
    
    // Clean up response
    recognizedText = recognizedText.replace(/['".]/g, '').trim();
    
    console.log('👁️ Recognized text:', recognizedText);
    
    if (recognizedText === 'NULL' || recognizedText.length === 0) {
      return null;
    }
    
    return recognizedText;
  } catch (error) {
    console.error('❌ OpenAI Vision Error:', error);
    throw new Error('No pude leer lo que escribiste. Inténtalo de nuevo.');
  }
}

/**
 * Generate an abstract illustration based on the emotion
 * @param {string} emotion - The emotion to inspire the image
 * @returns {Promise<string|null>} - The URL of the generated image
 */
export async function generateIllustration(emotion) {
  const openai = getOpenAI();
  
  if (!openai) return null;
  
  try {
    console.log('🎨 Generating illustration for:', emotion);
    
    // Add random variations to ensure uniqueness
    const styles = [
      "dynamic flowing lines",
      "concentric circles and ripples",
      "scattered ink splashes",
      "organic floral shapes",
      "geometric fragments dissolving",
      "soft cloud-like gradients",
      "sharp expressive strokes"
    ];
    
    // Select a random style element
    const randomStyle = styles[Math.floor(Math.random() * styles.length)];
    
    // Add a random seed to the prompt text itself to force variety
    const randomSeed = Math.random().toString(36).substring(7);

    const prompt = `A complete, well-composed minimal abstract watercolor illustration representing the emotion "${emotion}". 
    Artistic direction: ${randomStyle}.
    COMPOSITION: The artwork must be fully contained within the frame, centered, with balanced margins on all sides. No cropped or cut-off elements.
    Color palette: Use soft, muted, pastel tones that symbolically match the emotion "${emotion}" (e.g. soft blues for tranquility, warm amber for joy, pale crimson for passion). 
    STYLE: Delicate, ethereal, elegant. Keep all colors desaturated and harmonious.
    Background: Pure white, clean background surrounding the central composition.
    CRITICAL: Ensure the entire artistic composition is visible and complete within the image boundaries. No elements should be cut off at the edges.
    Variation: ${randomSeed}.`;

    const response = await openai.images.generate({
      model: "dall-e-2", // Faster generation
      prompt: prompt,
      n: 1,
      size: "512x512", // Lower resolution fits faster and looks fine for background abstract art
      response_format: "b64_json" // Request raw data to upload manually
    });

    if (response.data && response.data.length > 0) {
      // Return the base64 string directly
      return response.data[0].b64_json;
    }
    return null;
  } catch (error) {
    console.error("Error generating illustration:", error);
    // Don't fail the whole app flow if image fails
    return null;
  }
}
