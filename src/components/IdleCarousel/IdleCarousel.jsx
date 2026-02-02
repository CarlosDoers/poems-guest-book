import React, { useState, useEffect, useMemo } from 'react';
import { getRecentPoems } from '../../services/supabase';
import './IdleCarousel.css';

export default function IdleCarousel() {
  const [displayItems, setDisplayItems] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fade, setFade] = useState(true);

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

  // Cycle through items
  useEffect(() => {
    if (displayItems.length === 0) return;

    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % displayItems.length);
        setFade(true);
      }, 1000); // Wait for fade out
    }, 10000); // 10 seconds per item

    return () => clearInterval(interval);
  }, [displayItems.length]);

  const currentItem = displayItems[currentIndex];

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
              {poem.poem.split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
