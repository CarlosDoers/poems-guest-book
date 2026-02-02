import React, { useState, useMemo } from 'react';
import './PoemCarousel.css';

// Helper to generate a consistent pastel color from a string
const stringToColor = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  return `linear-gradient(135deg, hsl(${h}, 70%, 90%) 0%, hsl(${(h + 40) % 360}, 60%, 95%) 100%)`;
};

// Sub-component to handle individual image state
const CarouselItem = React.memo(({ poem, index, onSelect }) => {
  const [imgError, setImgError] = useState(false);
  
  // Stable rotation based on index
  const angle = (index % 3 === 0 ? 2 : index % 3 === 1 ? -2 : 0);
  const fallbackBackground = useMemo(() => stringToColor(poem.emotion || 'poem'), [poem.emotion]);
  
  // Random float animation params
  const floatVariant = (index % 3) + 1; // 1 to 3 patterns
  const floatDuration = 5 + (index % 3); // 5s to 7s
  const floatDelay = -(index * 0.7); // Staggered start

  return (
    <div 
      className="carousel-item-wrapper"
      style={{
        animationName: `float-organic-${floatVariant}`,
        animationDuration: `${floatDuration}s`,
        animationDelay: `${floatDelay}s`
      }}
    >
      <div 
        className="carousel-card"
        style={{ 
          transform: `rotate(${angle}deg)`,
          background: (poem.image_url && /\.png($|\?)/i.test(poem.image_url)) ? '#f0f4f8' : undefined
        }}
        onClick={() => onSelect(poem)}
      >
        {poem.image_url && !imgError ? (
          <img 
            src={poem.image_url} 
            alt={poem.emotion} 
            className={`card-image ${/\.png($|\?)/i.test(poem.image_url) ? 'is-png' : ''}`}
            loading="lazy"
            onError={() => {
              console.warn('Failed to load image:', poem.image_url);
              setImgError(true);
            }}
          />
        ) : (
          <div 
            className="card-image fallback" 
            style={{ background: fallbackBackground }} 
          />
        )}
        
        <div className="card-overlay" />
        <span className="card-emotion">
          {poem.emotion}
        </span>
      </div>
    </div>
  );
});

// Skeleton Card Component
const CarouselSkeletonItem = ({ index }) => {
  const angle = (index % 3 === 0 ? 2 : index % 3 === 1 ? -2 : 0);
  return (
    <div className="carousel-item-wrapper">
      <div 
        className="carousel-card skeleton-card"
        style={{ transform: `rotate(${angle}deg)` }}
      >
        <div className="skeleton-image" />
        <div className="skeleton-text" />
      </div>
    </div>
  );
};

export default function PoemCarousel({ poems, onSelect, isLoading }) {
  if (!isLoading && (!poems || poems.length === 0)) return null;

  return (
    <div className="poem-carousel-container animate-fade-in-up">
      <div className="carousel-track">
        {isLoading ? (
          // Render 6 skeleton items
          Array.from({ length: 6 }).map((_, index) => (
            <CarouselSkeletonItem key={`skeleton-${index}`} index={index} />
          ))
        ) : (
          poems.map((poemItem, index) => (
            <CarouselItem 
              key={poemItem.id || index} 
              poem={poemItem} 
              index={index} 
              onSelect={onSelect} 
            />
          ))
        )}
      </div>
    </div>
  );
}
