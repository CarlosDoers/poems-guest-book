import React, { useState, useCallback, useEffect, lazy, Suspense, useRef } from 'react';
import WritingCanvas from './components/WritingCanvas/WritingCanvas';
import Loader from './components/Loader/Loader';
import ProgressBar from './components/ProgressBar/ProgressBar';
import { isOpenAIConfigured, generatePoemMultimodal } from './services/ai';

// Lazy load heavy components
const PoemDisplay = lazy(() => import('./components/PoemDisplay/PoemDisplay'));
const PoemCarousel = lazy(() => import('./components/PoemCarousel/PoemCarousel'));
const IdleCarousel = lazy(() => import('./components/IdleCarousel/IdleCarousel'));
import { savePoem, getRecentPoems, isSupabaseConfigured, uploadPoemInputImage } from './services/supabase';
import { isElevenLabsConfigured } from './services/elevenlabs';
import { getSyncChannel } from './services/sync';

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

const PROJECTION_WATER_FX = {
  filterColor: [0.0, 0.25, 0.55],
  filterOpacity: 0.5,
  shineIntensity: 2.0, // antes 3.0
  refraction: 0.05,
  autoWaveStrength: 0.3,
  skyColor: [0.7, 0.85, 1.0], // [0.7, 0.85, 1.0] Celeste claro para los reflejos en el suelo
  vignetteStart: 0.3, // El círculo empieza a oscurecerse un poco después del centro
  vignetteEnd: 0.5,   // Oscuridad total antes de llegar a los bordes rectangulares
  useCamera: false,   // No usar la cámara en la proyección
  underwaterColor: [0.33, 0.35, 0.3], // Azul profundo para el fondo
};

export default function App() {
  const isProjectionMode = new URLSearchParams(window.location.search).get('view') === 'projection';
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
  const [isIdle, setIsIdle] = useState(false);
  const lastActivityRef = useRef(Date.now());

  // Shared pointer state for water ripple effect
  const sharedPointerRef = useRef({ x: 0, y: 0, down: 0 });
  const backgroundRef = useRef(null); // Reference to capture video snapshot

  const handleStrokeUpdate = useCallback((vx, vy, isDown) => {
    if (sharedPointerRef.current) {
      // vx and vy are viewport-normalized (0 to 1)
      sharedPointerRef.current.x = vx;
      sharedPointerRef.current.y = vy;
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

  // Idle Mode Logic
  const handleInteraction = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (isIdle) {
      setIsIdle(false);
      const channel = getSyncChannel();
      if (channel) {
        channel.send({
          type: 'broadcast',
          event: 'IDLE_STATUS',
          payload: { data: { isIdle: false } }
        });
      }
    }
  }, [isIdle]);

  useEffect(() => {
    if (isProjectionMode) return; // Only controller tracks inactivity

    const interval = setInterval(() => {
      const now = Date.now();
      const idleTime = (now - lastActivityRef.current) / 1000;
      
      if (idleTime > 60 && !isIdle) { // 1 minute
        setIsIdle(true);
        
        // Reset state to initial screen
        setAppState(STATES.WRITING);
        setWritingStage(WRITING_STAGES.INTRO);
        setPoem(null);
        setIllustration(null);
        setEmotion('');
        setPoemId(null);
        setExistingAudioUrl(null);
        setError(null);

        const channel = getSyncChannel();
        if (channel) {
          channel.send({
            type: 'broadcast',
            event: 'IDLE_STATUS',
            payload: { data: { isIdle: true } }
          });
        }
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [isIdle, isProjectionMode]);

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
             savedImageUrl = await uploadPoemInputImage(imageData, recognizedEmotion);
             if (savedImageUrl) setIllustration(savedImageUrl);
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
    handleInteraction();
  }, [handleInteraction]);

  const handleNewPoem = useCallback(() => {
    // Mandar señal de limpieza a la proyección vía Supabase Realtime
    const channel = getSyncChannel();
    if (channel && isSupabaseConfigured()) {
      console.log('📡 Enviando señal de CLEAR a través de Supabase...');
      
      channel.send({
        type: 'broadcast',
        event: 'CLEAR',
        payload: {}
      });
    }

    setAppState(STATES.WRITING);
    setWritingStage(WRITING_STAGES.INTRO);
    setPoem(null);
    setIllustration(null);
    setEmotion('');
    setPoemId(null);
    setExistingAudioUrl(null);
    setError(null);
    handleInteraction();
  }, [handleInteraction]);

  const handleStartWriting = useCallback(() => {
    setWritingStage(WRITING_STAGES.CANVAS);
    handleInteraction();
  }, [handleInteraction]);

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
    handleInteraction();
    if (recentPoems.length > 0) {
      handleSelectHistoryPoem(recentPoems[0]);
    }
  }, [recentPoems, handleSelectHistoryPoem, handleInteraction]);


  useEffect(() => {
    if (!isProjectionMode) {
      const handleBeforeUnload = () => {
        const channel = getSyncChannel();
        if (channel) {
          channel.send({
            type: 'broadcast',
            event: 'RELOAD_PROJECTION',
            payload: {}
          });
        }
      };

      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  }, [isProjectionMode]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    
    const channel = getSyncChannel();
    if (!channel) return;

    if (isProjectionMode) {
      console.log('📽️ Modo Proyección: Escuchando cambios de estado...');
      document.body.classList.add('projection-mode');
      
      channel
        .on('broadcast', { event: 'STATE_CHANGE' }, (payload) => {
          console.log('[PROJECTION] 📥 Estado recibido:', payload);
          if (payload?.payload?.data) {
            const { data } = payload.payload;
            setAppState(data.appState);
            setWritingStage(data.writingStage);
            setPoem(data.poem);
            setEmotion(data.emotion);
            setPoemId(data.poemId || null);
            setIllustration(data.illustration || null);
            setExistingAudioUrl(data.existingAudioUrl || null);
          }
        })
        .on('broadcast', { event: 'CLEAR' }, (payload) => {
          console.log('[PROJECTION] 📥 Señal de CLEAR recibida, reiniciando...', payload);
          setAppState(STATES.WRITING);
          setWritingStage(WRITING_STAGES.INTRO);
          setPoem(null);
          setEmotion('');
          setPoemId(null);
          setExistingAudioUrl(null);
          setIsIdle(false);
        })
        .on('broadcast', { event: 'IDLE_STATUS' }, (payload) => {
          console.log('[PROJECTION] 📥 Estado de inactividad:', payload.payload.data.isIdle);
          setIsIdle(payload.payload.data.isIdle);
        })
        .on('broadcast', { event: 'RELOAD_PROJECTION' }, () => {
          console.log('[PROJECTION] 📥 Señal de RELOAD recibida, recargando página...');
          window.location.reload();
        })
        .subscribe();
    }

    return () => {
      document.body.classList.remove('projection-mode');
    };
  }, [isProjectionMode]);

  // Sync state changes to projection view vía Supabase Realtime
  useEffect(() => {
    if (!isProjectionMode && isSupabaseConfigured()) {
      const channel = getSyncChannel();
      if (channel) {
        console.log('📤 Enviando actualización de estado:', { appState, writingStage });
        channel.send({
          type: 'broadcast',
          event: 'STATE_CHANGE',
          payload: { data: { appState, writingStage, poem, emotion, poemId, illustration, existingAudioUrl } }
        });
      }
    }
  }, [appState, writingStage, poem, emotion, poemId, illustration, existingAudioUrl, isProjectionMode]);

  const isWritingIntro = appState === STATES.WRITING && writingStage === WRITING_STAGES.INTRO;
  const isWritingCanvas = appState === STATES.WRITING && writingStage === WRITING_STAGES.CANVAS;
  
  // Enable Ripple/Water effect for all states
  const isRippleEnabled = true;

  if (isProjectionMode) {
    return (
      <div className="projection-view">
        <RippleBackground 
          ref={backgroundRef} 
          enabled={isRippleEnabled} 
          sharedPointerRef={sharedPointerRef} 
          config={PROJECTION_WATER_FX}
        />
        {isIdle ? (
          <Suspense fallback={null}>
            <IdleCarousel />
          </Suspense>
        ) : (
          <>
            {appState === STATES.POEM ? (
               <Suspense fallback={null}>
                  <PoemDisplay 
                    poem={poem} 
                    emotion={emotion} 
                    illustration={illustration}
                    poemId={poemId}
                    existingAudioUrl={existingAudioUrl}
                    isProjection={true} 
                  />
               </Suspense>
            ) : (
              <WritingCanvas 
                onSubmit={() => {}} 
                isProcessing={false} 
                fullScreen 
                onStrokeUpdate={handleStrokeUpdate}
                isProjection={true}
              />
            )}
          </>
        )}
      </div>
    );
  }

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
                 <div className="writing-hint">Usa el lápiz para escribir o dibujar una emoción</div>
             )}
            
            <WritingCanvas 
              onSubmit={handleCanvasSubmit} 
              isProcessing={false} 
              fullScreen 
              onStrokeUpdate={handleStrokeUpdate}
              onOpenGallery={handleOpenGallery}
              galleryCount={recentPoems.length}
              onInteractionStart={handleStartWriting}
              onInteraction={handleInteraction}
              shouldReset={isWritingIntro}
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
              poemId={poemId}
              onNewPoem={handleNewPoem}
              onInteraction={handleInteraction}
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
            onSelect={(item) => {
              handleInteraction();
              handleSelectHistoryPoem(item);
            }} 
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
