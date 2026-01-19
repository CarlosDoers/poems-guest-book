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
 * Generate a poem based on multimodal input (canvas drawing + face image)
 * @param {string} canvasBase64 - Base64 image of the canvas
 * @param {string} faceBase64 - Base64 image of the user's face (optional)
 * @returns {Promise<{emotion: string, poem: string}>} - The detected emotion and generated poem
 */
export async function generatePoemMultimodal(canvasBase64, faceBase64) {
  const openai = getOpenAI();
  
  if (!openai) {
    throw new Error('Error de configuración: La API key de OpenAI no está configurada.');
  }
  
  try {
    console.log('✨ Generating poem from multimodal input...');
    
    const messages = [
        {
            role: "system",
            content: `Eres un poeta experto en naturaleza y psicología humana. 
            Tu objetivo es interpretar la emoción del usuario basándote en dos fuentes:
            1. CONTENIDO DEL LIENZO: Puede ser una PALABRA escrita o un DIBUJO (garabato, objeto, paisaje).
            2. EXPRESIÓN FACIAL: La emoción en su rostro (si hay foto).

            INSTRUCCIONES CLAVE DE ANÁLISIS:
            - Si hay TEXTO LLEGIBLE: La emoción del poema debe basarse PRIMORDIALMENTE en el significado de esa palabra.
            - Si hay un DIBUJO FIGURATIVO (ej: casa, sol, árbol): Interpreta el simbolismo de ese objeto junto con el estilo del trazo.
            - Si son TRAZOS ABSTRACTOS: Analiza la energía cinética (caos=ansiedad, curvas=calma).

            Debes generar una respuesta en formato JSON con TRES campos:
            - "analysis": Describe explícitamente qué ves en el dibujo Y en la cara. Ej: "Palabra 'IRA' y rostro tenso", "Dibujo de casa y mirada serena". (Conciso).
            - "emotion": La emoción destilada. Si escribió una emoción, usa esa misma o un sinónimo poético.
            - "poem": Un poema breve (4-5 versos cortos) inspirado en esa emoción y en el simbolismo detectado. 
            
            Reglas para el poema:
            - Relaciona la emoción con un detalle de la naturaleza (igual que antes: botánica, luz, agua).
            - Exalta lo bello y sensorial.
            - Evita mencionar explícitamente "tu cara", "tu letra" o "tu dibujo".
            - Sin rimas fáciles ni clichés.
            `
        },
        {
            role: "user",
            content: [
                { type: "text", text: "Analiza mi estado y crea un poema." },
                { type: "image_url", image_url: { url: canvasBase64, detail: "low" } }
            ]
        }
    ];

    if (faceBase64) {
        messages[1].content.push({ 
            type: "image_url", 
            image_url: { url: faceBase64, detail: "low" } 
        });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Using the more powerful model as requested
      messages: messages,
      response_format: { type: "json_object" },
      max_tokens: 400, // Increased for analysis
      temperature: 1.0, // Higher creativity
    });

    const result = JSON.parse(response.choices[0].message.content);
    console.log('📝 Generated multimodal result with analysis:', result);
    
    return {
        emotion: result.emotion || "Eter",
        poem: result.poem || "El silencio se hace presente...",
        analysis: result.analysis || "Interpretación silente."
    };

  } catch (error) {
    console.error('❌ OpenAI Multimodal Error:', error);
    throw new Error('No pude conectarme con la musa. Inténtalo de nuevo.');
  }
}
