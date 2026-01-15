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

const SYSTEM_PROMPT_POET = `Eres un poeta experto en naturaleza y emociones.
Responde SOLO con el texto del poema, sin títulos, explicaciones ni comentarios.
Usa puntuación natural para marcar el ritmo.`;

const USER_PROMPT_POET = `Escribe un poema breve, dinámico y sensorial, de tono poético y cuidado, inspirado en la emoción: "{emotion}".

Instrucciones:
1. Relaciona la emoción con un único detalle de la naturaleza ibérica (botánica, aves, agua, luz, bosque, insectos, crepúsculo), usándolo como figura literaria central.
2. El poema debe exaltar lo bello de la vida desde la observación atenta del detalle, con precisión, delicadeza y riqueza sensorial.
3. El texto debe tener entre 4 y 6 versos, con ritmo vivo.
4. Evita referencias a personas, explicaciones, moralejas y clichés.
5. No mezcles escenas ni motivos naturales.
6. El poema debe cerrar con una imagen viva y expansiva, clara y visible, que deje una sensación de continuidad más allá del texto.`;

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
    // Variaciones basadas en detalles naturales y texturas orgánicas
    const styles = [
      "abstract macro texture of leaf veins and dew",
      "ethereal light filtering through olive branches",
      "fluid river water reflections in watercolor",
      "delicate organic pattern of bird plumage",
      "soft twilight gradient over hills",
      "wildflower silhouette against light",
      "texture of weathered stone and moss"
    ];
    
    // Select a random style element
    const randomStyle = styles[Math.floor(Math.random() * styles.length)];
    
    // Add a random seed to the prompt text itself to force variety
    const randomSeed = Math.random().toString(36).substring(7);

    const prompt = `A delicate, sensory, abstract watercolor illustration inspired by a detail of nature (botany, light, water) representing the emotion "${emotion}". 
    Artistic direction: ${randomStyle}.
    CONCEPT: Exalt the beauty of a single natural detail. Organic forms, natural textures, atmospheric light. No human figures.
    Color palette: Sophisticated, natural, and harmonious tones matching the emotion "${emotion}" (e.g. earthy ochres, deep river blues, olive greens, sunset purples). 
    STYLE: Minimalist, poetic, premium art. Use negative space effectively. 
    Background: Pure white, clean background surrounding the central composition.
    CRITICAL: Ensure the entire artistic composition is visible and complete within the image boundaries. No elements should be cut off.
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
