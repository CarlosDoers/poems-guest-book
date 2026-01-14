// Script para listar todas las voces disponibles en tu cuenta de ElevenLabs
// Ejecutar con: node list-voices.js

const ELEVENLABS_API_KEY = 'tu_api_key_aqui'; // Copia tu API key aquí temporalmente

async function listVoices() {
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY
      }
    });

    const data = await response.json();
    
    console.log('\n========== VOCES DISPONIBLES ==========\n');
    
    data.voices.forEach(voice => {
      console.log(`📢 ${voice.name}`);
      console.log(`   ID: ${voice.voice_id}`);
      console.log(`   Descripción: ${voice.description || 'N/A'}`);
      console.log(`   Idiomas: ${voice.labels?.language || 'N/A'}`);
      console.log(`   Género: ${voice.labels?.gender || 'N/A'}`);
      console.log(`   Acento: ${voice.labels?.accent || 'N/A'}`);
      console.log(`   Edad: ${voice.labels?.age || 'N/A'}`);
      console.log(`   Caso de uso: ${voice.labels?.use_case || 'N/A'}`);
      console.log('');
    });
    
    console.log('\n========== VOCES EN ESPAÑOL ==========\n');
    
    const spanishVoices = data.voices.filter(v => 
      v.labels?.language?.toLowerCase().includes('spanish') ||
      v.labels?.accent?.toLowerCase().includes('spanish')
    );
    
    spanishVoices.forEach(voice => {
      console.log(`🇪🇸 ${voice.name}: ${voice.voice_id}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  }
}

listVoices();
