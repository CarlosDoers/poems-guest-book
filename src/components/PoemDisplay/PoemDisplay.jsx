import { useState, useEffect, useRef } from 'react';
import { createPoemAudio, cleanupAudioUrl, isElevenLabsConfigured } from '../../services/elevenlabs';
import { uploadAudio, updatePoemAudio, isSupabaseConfigured } from '../../services/supabase';
import './PoemDisplay.css';

export default function PoemDisplay({ poem, emotion, onInteraction, poemId, existingAudioUrl, illustration, isProjection, onNewPoem, externalAudioRef }) {
  const [visibleWords, setVisibleWords] = useState(0); 
  const [isAllComplete, setIsAllComplete] = useState(false);
  const [startTextAnimation, setStartTextAnimation] = useState(false);
  
  // Audio states
  const [audioUrl, setAudioUrl] = useState(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioError, setAudioError] = useState(null);
  const [isAudioReady, setIsAudioReady] = useState(false);
  const internalAudioRef = useRef(null);
  const audioRef = externalAudioRef || internalAudioRef;
  const hasAutoPlayedRef = useRef(false);
  const poemIdRef = useRef(poemId);
  
  // Sync poemId to ref
  useEffect(() => {
    poemIdRef.current = poemId;
  }, [poemId]);
  
  const lines = poem ? poem.split('\n').filter(line => line.trim()) : [];
  const linesWithWords = lines.map(line => line.trim().split(/\s+/)); 
  const totalWords = linesWithWords.flat().length;

  // Reset state - only when poem changes
  useEffect(() => {
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
    hasAutoPlayedRef.current = false;
    
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poem]); 

  // Logic to start text animation
  useEffect(() => {
    if (!poem) return;
    
    // Start almost immediately now
    const timer = setTimeout(() => {
        setStartTextAnimation(true);
    }, 500);

    return () => clearTimeout(timer);
  }, [poem]);

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

  // Generate or load audio as soon as we have the poem
  useEffect(() => {
    if (!poem || !isElevenLabsConfigured()) return;
    
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
          
          // Wait for poemId to be available from App.jsx (DB save)
          const currentId = await waitForPoemId();
          
          // Upload to Supabase first for iOS standalone
          if (isSupabaseConfigured() && currentId && !abortController.signal.aborted) {
            console.log('☁️ Uploading audio to Supabase...');
            const permanentUrl = await uploadAudio(audioBlob, emotion);
            
            if (permanentUrl && !abortController.signal.aborted) {
              await updatePoemAudio(currentId, permanentUrl);
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
            throw new Error(`Supabase required for iOS standalone audio playback (ID: ${currentId})`);
          }
        } else {
          // Normal flow: use blob URL first, then upload in background
          const tempUrl = URL.createObjectURL(audioBlob);
          tempUrlToCleanup = tempUrl;
          setAudioUrl(tempUrl);
          setIsAudioReady(false); // Will be set to true by onCanPlayThrough event
          
          // Upload to Supabase in background if configured
          // Non-blocking but wait for ID
          (async () => {
            const currentId = await waitForPoemId();
            if (isSupabaseConfigured() && currentId && !abortController.signal.aborted) {
              console.log('☁️ Uploading audio to Supabase in background...');
              try {
                const permanentUrl = await uploadAudio(audioBlob, emotion);
                
                if (permanentUrl && !abortController.signal.aborted) {
                  await updatePoemAudio(currentId, permanentUrl);
                  console.log('✅ Audio saved to database');
                }
              } catch (err) {
                console.warn('Background audio upload failed:', err);
              }
            }
          })();
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error('Failed to handle audio:', error);
          setAudioError('No se pudo generar el audio');
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoadingAudio(false);
          // If we have an existing URL or just set one, eventually mark as ready 
          // as a fallback for missing onCanPlay events
          setTimeout(() => {
            if (!abortController.signal.aborted) setIsAudioReady(true);
          }, 2000);
        }
      }
    };
    
    // Internal function to wait for poemId if we're uploading
    const waitForPoemId = async () => {
      let attempts = 0;
      while (!poemIdRef.current && attempts < 20 && !abortController.signal.aborted) {
        await new Promise(r => setTimeout(r, 500));
        attempts++;
      }
      return poemIdRef.current;
    };

    handleAudio();
    
    return () => {
      abortController.abort();
      if (tempUrlToCleanup) {
        URL.revokeObjectURL(tempUrlToCleanup);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poem, emotion, existingAudioUrl]);

  // Audio control handlers
  const handlePlayPause = () => {
    if (onInteraction) onInteraction();
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
      hasAutoPlayedRef.current = true; // Mark as played to prevent auto-play later
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

  // Auto-play trigger: Play once when audio is ready
  useEffect(() => {
    // Only auto-play on controller screen, once, when audio ready
    if (isAudioReady && audioUrl && !isProjection && !hasAutoPlayedRef.current && audioRef.current) {
      const triggerAutoPlay = () => {
        if (hasAutoPlayedRef.current) return;
        console.log('🎵 Auto-playing audio...');
        hasAutoPlayedRef.current = true;
        
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(err => {
            console.warn('Auto-play prevented by browser:', err);
            // User will have to play manually
          });
        }
      };

      const timer = setTimeout(triggerAutoPlay, 100);
      return () => clearTimeout(timer);
    }
  }, [isAudioReady, audioUrl, isProjection]);

  const handleAudioError = (e) => {
    console.error('Audio loading error:', e);
    setAudioError('Error al cargar el audio');
    setIsLoadingAudio(false);
    setIsAudioReady(false);
  };

  // Attach event listeners to audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onCanPlayThrough = () => {
      console.log('✅ Audio ready to play (external)');
      setIsAudioReady(true);
      setIsLoadingAudio(false);
    };
    const onLoadedMetadata = () => {
        console.log('✅ Audio metadata loaded (external)');
        setIsAudioReady(true);
    };
    const onError = (e) => handleAudioError(e);

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('canplaythrough', onCanPlayThrough);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('canplaythrough', onCanPlayThrough);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('error', onError);
    };
  }, [audioRef]);

  // Sync source to audio element
  useEffect(() => {
    if (audioUrl && audioRef.current) {
      // Avoid re-setting the same source
      if (audioRef.current.src !== audioUrl) {
        audioRef.current.src = audioUrl;
        audioRef.current.load();
      }
    }
  }, [audioUrl, audioRef]);

  if (!poem) return null;

  let wordCounter = 0;

  return (
    <div className={`poem-display ${isProjection ? 'projection-poem' : ''}`}>
      <div 
        key={poem} /* Force re-render animation on poem change */
        className="poem-container"
      >
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
        
        {/* Background Illustration */}
        {illustration && (
          <img 
            src={illustration} 
            alt="Poem Illustration" 
            className={`illustration-bg ${illustration ? 'loaded' : ''}`}
          />
        )}
      </div>
      

      
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
