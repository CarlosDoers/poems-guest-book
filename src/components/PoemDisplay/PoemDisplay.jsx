import { useState, useEffect, useRef } from 'react';
import { createPoemAudio, cleanupAudioUrl, isElevenLabsConfigured } from '../../services/elevenlabs';
import { uploadAudio, updatePoemAudio, isSupabaseConfigured } from '../../services/supabase';
import './PoemDisplay.css';

export default function PoemDisplay({ poem, emotion, illustration, poemId, existingAudioUrl, onNewPoem }) {
  const illustrationUrlRef = useRef(null); // Track temp illustration URLs for cleanup
  const [visibleWords, setVisibleWords] = useState(0); 
  const [isAllComplete, setIsAllComplete] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [imgError, setImgError] = useState(false); // Track image loading error
  const [startTextAnimation, setStartTextAnimation] = useState(false);
  
  // Audio states
  const [audioUrl, setAudioUrl] = useState(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioError, setAudioError] = useState(null);
  const [isAudioReady, setIsAudioReady] = useState(false);
  const audioRef = useRef(null);
  
  const lines = poem ? poem.split('\n').filter(line => line.trim()) : [];
  const linesWithWords = lines.map(line => line.trim().split(/\s+/)); 
  const totalWords = linesWithWords.flat().length;

  // Reset state - only when poem or illustration changes, NOT when audio changes
  useEffect(() => {
    setIsImageLoaded(false);
    setImgError(false); // Reset error state
    setVisibleWords(0);
    setIsAllComplete(false);
    setStartTextAnimation(false);
    
    // Cleanup audio (solo cuando el poema cambia)
    if (audioUrl) {
      cleanupAudioUrl(audioUrl);
      setAudioUrl(null);
    }
    setIsPlaying(false);
    setIsLoadingAudio(false);
    setAudioError(null);
    setIsAudioReady(false);
    
    // Cleanup previous illustration Data URL if exists
    if (illustrationUrlRef.current && illustrationUrlRef.current.startsWith('data:')) {
      // Data URLs no necesitan revoke, pero rastreamos que fue limpiado
      illustrationUrlRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poem, illustration]); // Removido audioUrl de dependencias para evitar reset durante generación de audio

  // Logic to start text animation
  useEffect(() => {
    if (!poem) return;
    
    // If we have an illustration and no error yet, wait longer
    // If no illustration OR error happened immediately, start faster
    const hasValidImage = illustration && !imgError;
    const delay = hasValidImage ? 1500 : 500;
    
    const timer = setTimeout(() => {
        setStartTextAnimation(true);
        if (hasValidImage) setIsImageLoaded(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [illustration, poem, imgError]);

  // Word revealing logic
  useEffect(() => {
    if (!startTextAnimation || totalWords === 0) return;

    let currentWord = 0;

    const showNextWord = () => {
      setVisibleWords(prev => prev + 1);
      currentWord++;

      if (currentWord < totalWords) {
        // More fluid natural reading pace (faster than before)
        // 100ms base + random variation makes it feel like thought/writing
        const wordDelay = 80 + Math.random() * 120;
        setTimeout(showNextWord, wordDelay);
      } else {
        setTimeout(() => setIsAllComplete(true), 800);
      }
    };

    const initialTimeout = setTimeout(showNextWord, 300);
    
    return () => clearTimeout(initialTimeout);
  }, [startTextAnimation, totalWords]);

  // Generate or load audio when animation completes
  useEffect(() => {
    if (!isAllComplete || !poem || !isElevenLabsConfigured()) return;
    
    const abortController = new AbortController();
    let tempUrlToCleanup = null;
    
    // Detect if running in iOS standalone mode (PWA)
    const isIOSStandalone = () => {
      return (
        ('standalone' in window.navigator && window.navigator.standalone) || // iOS Safari standalone
        window.matchMedia('(display-mode: standalone)').matches // PWA standard
      );
    };
    
    const handleAudio = async () => {
      try {
        setIsLoadingAudio(true);
        setAudioError(null);
        
        // Check if poem already has audio from DB (from carousel)
        if (existingAudioUrl) {
          console.log('✅ Using existing audio from database');
          setAudioUrl(existingAudioUrl);
          setIsLoadingAudio(false);
          return;
        }
        
        // Generate new audio
        console.log('🎙️ Generating new audio with ElevenLabs...');
        const audioBlob = await fetch(await createPoemAudio(poem, emotion)).then(r => r.blob());
        
        // Check if cancelled
        if (abortController.signal.aborted) {
          console.log('Audio generation cancelled');
          return;
        }
        
        // iOS standalone mode has issues with blob URLs, so we upload first
        const iosStandalone = isIOSStandalone();
        
        if (iosStandalone) {
          console.log('📱 iOS Standalone detected - uploading audio before playback');
          
          // Upload to Supabase first for iOS standalone
          if (isSupabaseConfigured() && poemId && !abortController.signal.aborted) {
            console.log('☁️ Uploading audio to Supabase...');
            const permanentUrl = await uploadAudio(audioBlob, emotion);
            
            if (permanentUrl && !abortController.signal.aborted) {
              await updatePoemAudio(poemId, permanentUrl);
              console.log('✅ Audio saved and ready for playback');
              setAudioUrl(permanentUrl);
              // Mark as ready for iOS standalone immediately
              setIsAudioReady(true);
              
              // Fallback timeout for iOS - ensure button becomes clickable
              setTimeout(() => {
                if (!isAudioReady) {
                  console.log('⏰ Forcing audio ready state for iOS');
                  setIsAudioReady(true);
                }
              }, 1500);
            } else {
              throw new Error('Failed to upload audio for iOS standalone mode');
            }
          } else {
            throw new Error('Supabase required for iOS standalone audio playback');
          }
        } else {
          // Normal flow: use blob URL first, then upload in background
          const tempUrl = URL.createObjectURL(audioBlob);
          tempUrlToCleanup = tempUrl;
          setAudioUrl(tempUrl);
          setIsAudioReady(false); // Will be set to true by onCanPlayThrough event
          
          // Upload to Supabase in background if configured
          if (isSupabaseConfigured() && poemId && !abortController.signal.aborted) {
            console.log('☁️ Uploading audio to Supabase...');
            const permanentUrl = await uploadAudio(audioBlob, emotion);
            
            if (permanentUrl && !abortController.signal.aborted) {
              await updatePoemAudio(poemId, permanentUrl);
              console.log('✅ Audio saved to database');
              
              // Update to use permanent URL
              URL.revokeObjectURL(tempUrl);
              tempUrlToCleanup = null;
              setAudioUrl(permanentUrl);
            }
          }
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error('Failed to handle audio:', error);
          setAudioError('No se pudo generar el audio');
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoadingAudio(false);
        }
      }
    };
    
    handleAudio();
    
    return () => {
      abortController.abort();
      if (tempUrlToCleanup) {
        URL.revokeObjectURL(tempUrlToCleanup);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAllComplete, poem, emotion, poemId, existingAudioUrl]);

  // Audio control handlers
  const handlePlayPause = () => {
    if (!audioRef.current) return;
    
    // Detect iOS standalone
    const isIOSStandalone = ('standalone' in window.navigator && window.navigator.standalone) || 
                           window.matchMedia('(display-mode: standalone)').matches;
    
    // In iOS standalone, try to play even if not fully ready
    if (!isAudioReady && !isIOSStandalone) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      // Force load if needed (especially for iOS)
      if (audioRef.current.readyState < 2) {
        audioRef.current.load();
      }
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.error('Error playing audio:', err);
          // Show more specific error
          setAudioError(`Error: ${err.message || 'No se pudo reproducir'}`);
        });
      }
    }
  };

  const handleAudioPlay = () => setIsPlaying(true);
  const handleAudioPause = () => setIsPlaying(false);
  const handleAudioEnded = () => setIsPlaying(false);
  const handleAudioCanPlay = () => {
    console.log('✅ Audio ready to play');
    setIsAudioReady(true);
    setIsLoadingAudio(false);
  };
  const handleAudioError = (e) => {
    console.error('Audio loading error:', e);
    setAudioError('Error al cargar el audio');
    setIsLoadingAudio(false);
    setIsAudioReady(false);
  };

  if (!poem) return null;

  let wordCounter = 0;

  return (
    <div className="poem-display">
      <div 
        key={poem} /* Force re-render animation on poem change */
        className="poem-container"
      >
        {/* Background Illustration Overlay */}
        {illustration && !imgError && (
          <div 
            className="poem-bg-overlay"
            style={{ 
                backgroundImage: `url(${illustration})`,
                opacity: isImageLoaded ? 0.4 : 0 
            }}
          />
        )}
        
        {/* Hidden img to trigger load event */}
        {illustration && !imgError && (
             <img 
                src={illustration} 
                alt=""
                style={{ display: 'none' }}
                onLoad={() => setIsImageLoaded(true)}
                onError={() => {
                    console.warn('Image failed to load');
                    setImgError(true);
                    setStartTextAnimation(true);
                }}
             />
        )}

        <div className="flourish flourish-top">
          <svg viewBox="0 0 160 24" fill="none" stroke="currentColor" className="flourish-svg">
            {/* Elegant Calligraphic Line Left */}
            <path d="M80 12c-10 0-15-6-25-6-12 0-20 8-35 8-10 0-15-4-20-4" strokeWidth="1" strokeLinecap="round"/>
            {/* Elegant Calligraphic Line Right */}
            <path d="M80 12c10 0 15-6 25-6 12 0 20 8 35 8 10 0 15-4 20 4" strokeWidth="1" strokeLinecap="round"/>
          </svg>
        </div>
        
        <div className="poem-emotion">
          <span className="emotion-label">Inspirado en:</span>
          <span className="emotion-word">{emotion.charAt(0).toUpperCase() + emotion.slice(1).toLowerCase()}</span>
        </div>
        
        <div className="poem-content">
          {linesWithWords.map((words, lineIndex) => (
            <p key={lineIndex} className="poem-text-line">
              {words.map((word, wordIndex) => {
                const isVisible = wordCounter < visibleWords;
                wordCounter++;
                return (
                  <span 
                    key={wordIndex} 
                    className={`poem-word ${isVisible ? 'visible' : ''}`}
                  >
                    {word}
                  </span>
                );
              })}
            </p>
          ))}
        </div>
        
        <div className={`flourish flourish-bottom ${isAllComplete ? 'visible' : 'hidden'}`}>
          <svg viewBox="0 0 160 24" fill="none" stroke="currentColor" className="flourish-svg">
             {/* Inverted curve for bottom */}
             <path d="M80 12c-10 0-15 6-25 6-12 0-20-8-35-8-10 0-15 4-20 4" strokeWidth="1" strokeLinecap="round"/>
             <path d="M80 12c10 0 15 6 25 6 12 0 20-8 35-8 10 0 15 4 20-4" strokeWidth="1" strokeLinecap="round"/>
          </svg>
        </div>
      </div>
      
      {/* Hidden audio element */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onPlay={handleAudioPlay}
          onPause={handleAudioPause}
          onEnded={handleAudioEnded}
          onCanPlayThrough={handleAudioCanPlay}
          onLoadedData={handleAudioCanPlay}
          onLoadedMetadata={() => {
            console.log('✅ Audio metadata loaded');
            if (!isAudioReady) setIsAudioReady(true);
          }}
          onError={handleAudioError}
          preload="auto"
          playsInline
        />
      )}
      
      <div className={`poem-actions-external ${isAllComplete ? 'visible' : ''}`}>
        {/* Audio controls */}
        {isElevenLabsConfigured() && (
          <div className="audio-controls">
            {isLoadingAudio || (audioUrl && !isAudioReady) ? (
              <button className="btn btn-secondary" disabled>
                <div className="loading-spinner"></div>
                {isLoadingAudio ? 'Generando audio...' : 'Preparando audio...'}
              </button>
            ) : audioError ? (
              <span className="audio-error">{audioError}</span>
            ) : audioUrl && isAudioReady ? (
              <button className="btn btn-secondary" onClick={handlePlayPause}>
                {isPlaying ? (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                    </svg>
                    Pausar
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                    Escuchar poema
                  </>
                )}
              </button>
            ) : null}
          </div>
        )}
        
        <button className="btn btn-primary" onClick={onNewPoem}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Escribir otra emoción
        </button>
      </div>
    </div>
  );
}
