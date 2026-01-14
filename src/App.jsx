import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import WritingCanvas from './components/WritingCanvas/WritingCanvas';
import Loader from './components/Loader/Loader';
import { generatePoem, recognizeEmotionFromImage, generateIllustration, isOpenAIConfigured } from './services/ai';

// Lazy load heavy components
const PoemDisplay = lazy(() => import('./components/PoemDisplay/PoemDisplay'));
const PoemCarousel = lazy(() => import('./components/PoemCarousel/PoemCarousel'));
import { savePoem, getRecentPoems, isSupabaseConfigured, uploadIllustration } from './services/supabase';
import { isElevenLabsConfigured } from './services/elevenlabs';

// App states
const STATES = {
  WRITING: 'writing',
  PROCESSING: 'processing',
  POEM: 'poem',
  ERROR: 'error'
};

export default function App() {
  const [appState, setAppState] = useState(STATES.WRITING);
  const [poem, setPoem] = useState(null);
  const [illustration, setIllustration] = useState(null);
  const [emotion, setEmotion] = useState('');
  const [poemId, setPoemId] = useState(null); // ID del poema guardado
  const [existingAudioUrl, setExistingAudioUrl] = useState(null); // Audio from DB
  const [recentPoems, setRecentPoems] = useState([]);
  const [isPoemsLoading, setIsPoemsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize and Fetch Data
  useEffect(() => {
    const init = async () => {
      if (isSupabaseConfigured()) {
        try {
          setIsPoemsLoading(true);
          const poems = await getRecentPoems();
          if (poems?.length) setRecentPoems(poems);
        } catch (error) {
          console.error('Failed to load recent poems:', error);
        } finally {
          setIsPoemsLoading(false);
        }
      } else {
        setIsPoemsLoading(false);
      }
    };
    init();
  }, []);

  // Check configuration on mount
  const configWarnings = [];
  if (!isOpenAIConfigured()) {
    configWarnings.push('⚠️ Configura VITE_OPENAI_API_KEY en el archivo .env');
  }
  if (!isSupabaseConfigured()) {
    configWarnings.push('⚠️ Configura las variables de Supabase en el archivo .env');
  }
  if (!isElevenLabsConfigured()) {
    console.info('ℹ️ ElevenLabs no configurado - La lectura de poemas estará deshabilitada');
  }

  const handleCanvasSubmit = useCallback(async (imageData) => {
    try {
      setAppState(STATES.PROCESSING);
      setError(null);
      setIllustration(null);
      
      // Step 1: Vision AI - Recognize the handwriting
      console.log('👁️ Reading handwriting...');
      const recognizedText = await recognizeEmotionFromImage(imageData);
      
      if (!recognizedText) {
        throw new Error('No se pudo reconocer ninguna emoción. Intenta escribir más claro.');
      }
      
      setEmotion(recognizedText);
      
      // Step 2: Generate Content
      console.log('✨ Generating poem & art...');
      
      const poemPromise = generatePoem(recognizedText);
      const illustrationPromise = generateIllustration(recognizedText);
      
      const [poemResult, illustrationResult] = await Promise.allSettled([
        poemPromise,
        illustrationPromise
      ]);
      
      // Handle Poem
      if (poemResult.status === 'fulfilled') {
        const generatedPoem = poemResult.value;
        
        let displayUrl = null; // For showing now
        let permanentUrl = null; // For saving to DB
        let rawBase64 = null;

        setPoem(generatedPoem);
        
        // Handle Illustration
        if (illustrationResult.status === 'fulfilled' && illustrationResult.value) {
          rawBase64 = illustrationResult.value;
          // Create temp URL for immediate display
          displayUrl = `data:image/png;base64,${rawBase64}`;
          
          console.log('🎨 Illustration ready for display');
          setIllustration(displayUrl);
          
          // Preload temp image (already in memory but good practice)
          try {
            await new Promise((resolve) => {
              const img = new Image();
              img.onload = resolve;
              img.onerror = resolve; 
              img.src = displayUrl;
            });
          } catch (e) {
            console.warn('Image preload failed', e);
          }
        } else {
          setIllustration(null);
        }
        
        setAppState(STATES.POEM);

        // Step 3: Upload & Save (non-blocking for UI, but blocking for DB consistency)
        if (isSupabaseConfigured()) {
          (async () => {
            try {
              // If we have an image, upload it first to get permanent URL
              if (rawBase64) {
                console.log('☁️ Uploading image to storage...');
                permanentUrl = await uploadIllustration(rawBase64, recognizedText);
              }
              
              const savedPoem = await savePoem({ 
                emotion: recognizedText, 
                poem: generatedPoem, 
                illustration: permanentUrl // Null if failed or no image
              });
              
              // Store poem ID for audio association
              if (savedPoem?.id) {
                setPoemId(savedPoem.id);
                
                // Optimización: agregar nuevo poema al state en lugar de recargar todos
                setRecentPoems(prev => [savedPoem, ...prev].slice(0, 20));
              }
            } catch (error) {
              console.error('Failed to save poem to database:', error);
              // No bloqueamos la UI, el poema ya se muestra
            }
          })();
        }
      } else {
        throw new Error('No se pudo generar el poema. Por favor intenta de nuevo.');
      }
      
    } catch (err) {
      console.error('Error:', err);
      setError(err.message || 'Ocurrió un error. Intenta de nuevo.');
      setAppState(STATES.ERROR);
    }
  }, []);

  const handleNewPoem = useCallback(() => {
    setAppState(STATES.WRITING);
    setPoem(null);
    setIllustration(null);
    setEmotion('');
    setPoemId(null);
    setExistingAudioUrl(null);
    setError(null);
  }, []);

  const handleSelectHistoryPoem = useCallback((poemItem) => {
    // Load a poem from history
    setEmotion(poemItem.emotion);
    setPoem(poemItem.poem);
    setIllustration(poemItem.image_url || null);
    setPoemId(poemItem.id || null); // Set poem ID for audio reuse
    setExistingAudioUrl(poemItem.audio_url || null); // Load existing audio
    setAppState(STATES.POEM);
  }, []);

  return (
    <div className={`app ${appState === STATES.POEM ? 'app-scrollable' : 'app-fixed'}`}>
      {/* Configuration Warnings */}
      {configWarnings.length > 0 && appState === STATES.WRITING && (
        <div className="config-warnings">
          {configWarnings.map((warning, i) => (
            <p key={i} className="config-warning">{warning}</p>
          ))}
        </div>
      )}

      {/* Writing State */}
      {appState === STATES.WRITING && (
        <>
          <h1 className="title">Emotional guest book</h1>
          <p className="subtitle">
            Escribe una emoción y recibe un poema único
          </p>
          <WritingCanvas 
            onSubmit={handleCanvasSubmit}
            isProcessing={false} 
          />
        </>
      )}

      {/* Processing State */}
      {appState === STATES.PROCESSING && (
        <Loader emotion={emotion} />
      )}

      {/* Poem Display State */}
      {appState === STATES.POEM && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
          <Suspense fallback={<Loader emotion={emotion} />}>
            <PoemDisplay 
              poem={poem}
              emotion={emotion}
              existingAudioUrl={existingAudioUrl}
              illustration={illustration}
              poemId={poemId}
              onNewPoem={handleNewPoem}
            />
          </Suspense>
        </div>
      )}

      {/* History Carousel - Visible in Writing and Poem states */}
      {(appState === STATES.WRITING || appState === STATES.POEM) && (recentPoems.length > 0 || isPoemsLoading) && (
        <Suspense fallback={null}>
          <PoemCarousel 
            poems={recentPoems} 
            isLoading={isPoemsLoading}
            onSelect={handleSelectHistoryPoem} 
          />
        </Suspense>
      )}

      {/* Error State */}
      {appState === STATES.ERROR && (
        <div className="error-container animate-fade-in-up">
          <div className="error-icon">😔</div>
          <h2>Algo salió mal</h2>
          <p>{error}</p>
          <button className="btn btn-primary" onClick={handleNewPoem}>
            Intentar de nuevo
          </button>
        </div>
      )}
    </div>
  );
}
