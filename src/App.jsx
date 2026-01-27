import React, { useState, useCallback, useEffect, lazy, Suspense, useRef } from 'react';
import WritingCanvas from './components/WritingCanvas/WritingCanvas';
import Loader from './components/Loader/Loader';
import ProgressBar from './components/ProgressBar/ProgressBar';
import { isOpenAIConfigured, generatePoemMultimodal } from './services/ai';

// Lazy load heavy components
const PoemDisplay = lazy(() => import('./components/PoemDisplay/PoemDisplay'));
const PoemCarousel = lazy(() => import('./components/PoemCarousel/PoemCarousel'));
import { savePoem, getRecentPoems, isSupabaseConfigured, uploadPoemInputImage } from './services/supabase';
import { isElevenLabsConfigured } from './services/elevenlabs';

// App states
const STATES = {
  WRITING: 'writing',
  PROCESSING: 'processing',
  POEM: 'poem',
  ERROR: 'error'
};

const WRITING_STAGES = {
  INTRO: 'intro',
  CANVAS: 'canvas'
};

import RippleBackground from './components/RippleBackground/RippleBackground';

export default function App() {
  const [appState, setAppState] = useState(STATES.WRITING);
  // FEATURE FLAG: Show gallery button on intro screen
  const SHOW_GALLERY = true; 
  // FEATURE FLAG: Show history carousel
  const SHOW_CAROUSEL = true; 

  const [writingStage, setWritingStage] = useState(WRITING_STAGES.INTRO);
  const [poem, setPoem] = useState(null);
  const [illustration, setIllustration] = useState(null);
  const [emotion, setEmotion] = useState('');
  const [poemId, setPoemId] = useState(null); // ID del poema guardado
  const [existingAudioUrl, setExistingAudioUrl] = useState(null); // Audio from DB
  const [recentPoems, setRecentPoems] = useState([]);
  const [isPoemsLoading, setIsPoemsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Shared pointer state for water ripple effect
  const sharedPointerRef = useRef({ x: 0, y: 0, down: 0 });
  const backgroundRef = useRef(null); // Reference to capture video snapshot

  const handleStrokeUpdate = useCallback((x, y, isDown) => {
    if (sharedPointerRef.current) {
      const dpr = window.devicePixelRatio || 1;
      // Convert top-left coordinates to bottom-left (GL style) and scale by DPR
      sharedPointerRef.current.x = x * dpr;
      sharedPointerRef.current.y = (window.innerHeight - y) * dpr;
      sharedPointerRef.current.down = isDown ? 1 : 0;
    }
  }, []);

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
      
      // Step 1: Capture Face (if available)
      let faceSnapshot = null;
      if (backgroundRef.current) {
        faceSnapshot = backgroundRef.current.getSnapshot();
        if (faceSnapshot) {
            console.log(`📸 Face captured successfully! Size: ${Math.round(faceSnapshot.length / 1024)} KB`);
        } else {
            console.log('⚠️ No face captured (Snapshot returned null)');
        }
      }

      // Step 2: Generate Multimodal Poem
      console.log('✨ Generating poem from stroke + face (Multimodal)...');
      const result = await generatePoemMultimodal(imageData, faceSnapshot);
      
      // Handle Poem
      if (result && result.poem) {
        if (result.analysis) {
            console.log('🧠 AI Interpretation:', result.analysis);
        }
        const recognizedEmotion = result.emotion;
        const generatedPoem = result.poem;
        setEmotion(recognizedEmotion);
        setPoem(generatedPoem);
        setAppState(STATES.POEM);
        
        // Step 2b: Upload Canvas Input (Drawing/Text)
        let savedImageUrl = null;
        if (imageData && isSupabaseConfigured()) {
             console.log('⬆️ Uploading canvas input image...');
             // imageData is already a DataURL (JPEG) from the canvas submission
            savedImageUrl = await uploadPoemInputImage(imageData, recognizedEmotion);
        }

        // Step 3: Upload & Save (non-blocking for UI, but blocking for DB consistency)
        if (isSupabaseConfigured()) {
          (async () => {
             try {
                const savedPoem = await savePoem({ 
                    emotion: recognizedEmotion, 
                    poem: generatedPoem, 
                    illustration: savedImageUrl, // Save canvas drawing URL
                    model: 'gpt-4o' 
                });
                
                if (savedPoem?.id) {
                    setPoemId(savedPoem.id);
                    setRecentPoems(prev => [savedPoem, ...prev].slice(0, 20));
                }
             } catch (err) {
                 console.error('Failed to save poem:', err);
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
    setWritingStage(WRITING_STAGES.INTRO);
    setPoem(null);
    setIllustration(null);
    setEmotion('');
    setPoemId(null);
    setExistingAudioUrl(null);
    setError(null);
  }, []);

  const handleStartWriting = useCallback(() => {
    setWritingStage(WRITING_STAGES.CANVAS);
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

  const handleOpenGallery = useCallback((e) => {
    e.stopPropagation();
    if (recentPoems.length > 0) {
      handleSelectHistoryPoem(recentPoems[0]);
    }
  }, [recentPoems, handleSelectHistoryPoem]);

  const isWritingIntro = appState === STATES.WRITING && writingStage === WRITING_STAGES.INTRO;
  const isWritingCanvas = appState === STATES.WRITING && writingStage === WRITING_STAGES.CANVAS;
  
  // Enable Ripple/Water effect for all states
  const isRippleEnabled = true;

  return (
    <div className={`app ${appState === STATES.POEM ? 'app-scrollable' : 'app-fixed'} ${isRippleEnabled ? 'app-fullscreen' : ''}`}>
      <RippleBackground ref={backgroundRef} enabled={isRippleEnabled} sharedPointerRef={sharedPointerRef} />
      {/* Configuration Warnings */}
      {configWarnings.length > 0 && appState === STATES.WRITING && !isRippleEnabled && (
        <div className="config-warnings">
          {configWarnings.map((warning, i) => (
            <p key={i} className="config-warning">{warning}</p>
          ))}
        </div>
      )}

      {/* Writing State */}
      {/* Writing State - Canvas always active in background to capture first stroke */}
      {appState === STATES.WRITING && (
          <div className="writing-screen">
            {/* Hint only shows when actively writing (not in intro overlay) */}
            {isWritingCanvas && (
                 <div className="writing-hint">Usa el boli para escribir una emoción</div>
             )}
            
            <WritingCanvas 
              onSubmit={handleCanvasSubmit} 
              isProcessing={false} 
              fullScreen 
              onStrokeUpdate={handleStrokeUpdate}
              onOpenGallery={handleOpenGallery}
              galleryCount={recentPoems.length}
              onInteractionStart={handleStartWriting}
            />
          </div>
      )}

      {/* Intro Overlay - Text on top, passes clicks to canvas below */}
      {isWritingIntro && (
        <div
          className="intro-screen"
          style={{ pointerEvents: 'none', position: 'absolute', inset: 0 }}
        >
          <div className="intro-title">Eres un poema</div>
          <div className="intro-cta">Toca para comenzar</div>
          
          {/* Gallery Link (Restored) - Needs pointer events enabled specifically */}
          {SHOW_GALLERY && !isPoemsLoading && recentPoems.length > 0 && (
            <button 
              className="btn btn-ghost" 
              style={{ marginTop: '2rem', fontSize: '0.9rem', opacity: 0.8, zIndex: 10, pointerEvents: 'auto' }}
              onClick={handleOpenGallery}
            >
              Ver galería de poemas ({recentPoems.length})
            </button>
          )}
        </div>
      )}

      {/* Processing State */}
      {appState === STATES.PROCESSING && (
        <ProgressBar />
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
      {SHOW_CAROUSEL && appState === STATES.POEM && (recentPoems.length > 0 || isPoemsLoading) && (
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
        <div className="error-screen animate-fade-in-up">
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
