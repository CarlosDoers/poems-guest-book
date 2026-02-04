import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getRecentPoems } from '../../services/supabase';
import './IdleCarousel.css';

export default function IdleCarousel() {
  const [displayItems, setDisplayItems] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fade, setFade] = useState(true);
  const audioRef = useRef(null);
  const [visibleWords, setVisibleWords] = useState(0); // Estado para la animación de texto

  // Fetch items on mount and create paired image-text sequence
  useEffect(() => {
    const fetchItems = async () => {
      try {
        const poems = await getRecentPoems(30);
        if (poems && poems.length > 0) {
          // Create a flattened array where each poem creates TWO items:
          // 1. Image item (if image_url exists)
          // 2. Text item (the poem text)
          const paired = [];
          poems.forEach(poem => {
            // Only add image item if the poem has an image
            if (poem.image_url) {
              paired.push({ type: 'image', poem });
            }
            // Always add the text item
            paired.push({ type: 'text', poem });
          });
          setDisplayItems(paired);
        }
      } catch (err) {
        console.error('IdleCarousel: Failed to fetch items', err);
      }
    };
    fetchItems();
    
    // Refresh items every 5 minutes
    const refreshInterval = setInterval(fetchItems, 5 * 60 * 1000);
    return () => clearInterval(refreshInterval);
  }, []);

  // Handle Audio Playback when item changes
  useEffect(() => {
    if (!displayItems.length) return;
    
    const current = displayItems[currentIndex];
    const isText = current && current.type === 'text';
    const hasAudio = current && current.poem && current.poem.audio_url;

    if (audioRef.current) {
      // Pause any ongoing playback first
      audioRef.current.pause();
      
      if (isText && hasAudio && fade) { // Only start when fading in
          audioRef.current.src = current.poem.audio_url;
          audioRef.current.load();
          
          const playPromise = audioRef.current.play();
          if (playPromise !== undefined) {
            playPromise.catch(error => {
               // Auto-play might be blocked until user interaction
               if (error.name !== 'AbortError') {
                 console.warn('Idle audio playback prevented:', error);
               }
            });
          }
      }
    }
  }, [currentIndex, fade, displayItems]);

  // Cycle through items with Dynamic Duration
  useEffect(() => {
    if (displayItems.length === 0) return;

    const currentItem = displayItems[currentIndex];
    const isText = currentItem?.type === 'text';
    
    // Tiempos ajustados: 25s para leer poemas (antes 10s), 15s para ver dibujos
    const displayDuration = isText ? 25000 : 15000;

    const timer = setTimeout(() => {
      setFade(false);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % displayItems.length);
        setVisibleWords(0); // Reset words
        setFade(true);
      }, 1000); // fade out duration
    }, displayDuration);

    return () => clearTimeout(timer);
  }, [currentIndex, displayItems]);

  const currentItem = displayItems[currentIndex];

  // Logic for text animation
  const linesWithWords = useMemo(() => {
    if (!currentItem || currentItem.type !== 'text') return [];
    return currentItem.poem.poem.split('\n')
      .filter(line => line.trim())
      .map(line => line.trim().split(/\s+/));
  }, [currentItem]);

  const totalWords = useMemo(() => linesWithWords.flat().length, [linesWithWords]);

  useEffect(() => {
    if (!currentItem || currentItem.type !== 'text' || !fade) return;

    let current = 0;
    let isCancelled = false;

    const showNextWord = () => {
      if (isCancelled) return;
      
      setVisibleWords(prev => {
        const next = prev + 1;
        current = next;
        return next;
      });

      if (current < totalWords) {
        // Velocidad natural de lectura (similar a PoemDisplay)
        const delay = 100 + Math.random() * 80;
        setTimeout(showNextWord, delay);
      }
    };

    const initialDelay = setTimeout(showNextWord, 500);
    return () => {
      isCancelled = true;
      clearTimeout(initialDelay);
    };
  }, [currentIndex, fade, totalWords]); // Re-run when fade in completes or item changes

  if (displayItems.length === 0 || !currentItem) return null;

  const showImage = currentItem.type === 'image';
  const poem = currentItem.poem;

  return (
    <div className={`idle-carousel-overlay ${fade ? 'fade-in' : 'fade-out'}`}>
      <div className="idle-content-container">
        {showImage && poem.image_url ? (
          <div className="idle-drawing-view">
             <div className="paper-frame">
                <img 
                  src={poem.image_url} 
                  alt="Dibujo anterior" 
                  className={`idle-image ${poem.image_url.toLowerCase().includes('.jpg') ? 'is-jpg' : 'is-png'}`} 
                />
             </div>
          </div>
        ) : (
          <div className="idle-poem-view">
            <div className="idle-poem-text">
              {linesWithWords.map((words, lineIdx) => (
                <p key={lineIdx} className="idle-line">
                  {words.map((word, wordIdx) => {
                    // Calculate global index for this word
                    const previousWordsCount = linesWithWords
                      .slice(0, lineIdx)
                      .reduce((acc, line) => acc + line.length, 0);
                    const globalIndex = previousWordsCount + wordIdx;
                    const isVisible = globalIndex < visibleWords;
                    
                    return (
                      <span 
                        key={wordIdx} 
                        className={`idle-word ${isVisible ? 'visible' : ''}`}
                      >
                        {word}{' '}
                      </span>
                    );
                  })}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
      <audio ref={audioRef} style={{ display: 'none' }} />
    </div>
  );
}
