import { useRef, useState, useEffect, useCallback } from 'react';
import './WritingCanvas.css';

// Utility: Debounce function
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

export default function WritingCanvas({ onSubmit, isProcessing, fullScreen = false, onStrokeUpdate, onInteractionStart }) {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const lastTouchRef = useRef(null); // Track if we're using touch to avoid pointer duplication

  useEffect(() => {
    const canvas = canvasRef.current;
    
    // Set canvas size based on container
    const resizeCanvas = () => {
      const container = canvas.parentElement;
      const rect = container.getBoundingClientRect();
      
      // High DPI support - Optimized
      // Cap DPR to 1.5 on desktops, and 1.5 on mobile/tablet to balance quality/performance
      // Native scale (2x/3x) on iPad causes significant input lag and heat with canvas
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      
      const ctx = canvas.getContext('2d', {
          alpha: true
      });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      
      // Configure drawing style - Estilo "tinta flotando en agua"
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      if (fullScreen) {
        // Trazo sólido blanco estandar
        ctx.strokeStyle = '#FFFFFF';
        
        // Optimización: Desactivar shadowBlur en móviles/tablets para evitar lag
        const isMobile = window.innerWidth <= 1024;
        if (!isMobile) {
            ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
            ctx.shadowBlur = 12;
        } else {
            ctx.shadowBlur = 0; // Mucho más rápido
        }
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      } else {
        ctx.strokeStyle = '#1A1815';
        ctx.shadowBlur = 0;
      }
      ctx.lineWidth = 5;
      
      contextRef.current = ctx;
    };

    resizeCanvas();
    // Debounce resize to avoid excessive recalculations (250ms)
    const debouncedResize = debounce(resizeCanvas, 250);
    window.addEventListener('resize', debouncedResize);
    
    // Prevent double-tap gesture on iOS/Safari (interferes with rapid strokes)
    const preventDoubleTap = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    canvas.addEventListener('dblclick', preventDoubleTap);
    
    return () => {
      window.removeEventListener('resize', debouncedResize);
      canvas.removeEventListener('dblclick', preventDoubleTap);
    };
  }, [fullScreen]);

  const getPointerPosition = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure || 0.5
    };
  }, []);

  const getTouchPosition = useCallback((touch) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
      pressure: touch.force || 0.5 // Apple Pencil supports force
    };
  }, []);

  const startDrawing = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Capture pointer for desktop/stylus
    if (e.pointerId !== undefined) {
      e.target.setPointerCapture(e.pointerId);
    }
    
    const { x, y } = getPointerPosition(e);
    
    // Update shader
    if (onStrokeUpdate) onStrokeUpdate(x, y, true);
    
    // Notify parent interaction started (to hide intro overlays)
    if (onInteractionStart) onInteractionStart();
    
    const ctx = contextRef.current;
    if (!ctx) return; // Safety check: context might not be initialized
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    // Trazo estándar
    ctx.lineWidth = 5;
    
    setIsDrawing(true);
    setHasContent(true);
  }, [getPointerPosition, onStrokeUpdate, onInteractionStart]);

  const draw = useCallback((e) => {
    if (!isDrawing) return;
    e.preventDefault();
    e.stopPropagation();
    
    const ctx = contextRef.current;
    if (!ctx) return; // Safety check: context might not be initialized
    
    // Use coalesced events for higher precision if available
    if (e.getCoalescedEvents) {
        const events = e.getCoalescedEvents();
        for (const event of events) {
            const { x, y } = getPointerPosition(event);
            ctx.lineTo(x, y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x, y);
        }
    } else {
        const { x, y } = getPointerPosition(e);
        
        // Update shader
        if (onStrokeUpdate) onStrokeUpdate(x, y, true);
        
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
    }
  }, [isDrawing, getPointerPosition, onStrokeUpdate]);

  const stopDrawing = useCallback((e) => {
    if (e) {
        e.preventDefault();
        if (e.pointerId !== undefined) {
          e.target.releasePointerCapture(e.pointerId);
        }
    }
    const ctx = contextRef.current;
    if (ctx) ctx.closePath(); // Safety check
    
    // Update shader (mouse up)
    if (onStrokeUpdate) onStrokeUpdate(0, 0, false);
    
    setIsDrawing(false);
  }, [onStrokeUpdate]);

  // TOUCH EVENTS - Override pointer events on touch devices for better iOS support
  const handleTouchStart = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    
    lastTouchRef.current = Date.now();
    
    const touch = e.touches[0];
    const { x, y } = getTouchPosition(touch);
    
    // Update shader
    if (onStrokeUpdate) onStrokeUpdate(x, y, true);
    
    const ctx = contextRef.current;
    if (!ctx) return; // Safety check
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = 5;
    
    setIsDrawing(true);
    setHasContent(true);
  }, [getTouchPosition, onStrokeUpdate]);

  const handleTouchMove = useCallback((e) => {
    if (!isDrawing) return;
    e.preventDefault();
    e.stopPropagation();
    
    lastTouchRef.current = Date.now();
    
    const touch = e.touches[0];
    const { x, y } = getTouchPosition(touch);
    
    // Update shader
    if (onStrokeUpdate) onStrokeUpdate(x, y, true);
    
    const ctx = contextRef.current;
    if (!ctx) return; // Safety check
    
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, [isDrawing, getTouchPosition, onStrokeUpdate]);

  const handleTouchEnd = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    
    lastTouchRef.current = Date.now();
    
    const ctx = contextRef.current;
    if (ctx) ctx.closePath(); // Safety check
    
    // Update shader
    if (onStrokeUpdate) onStrokeUpdate(0, 0, false);
    
    setIsDrawing(false);
  }, [onStrokeUpdate]);

  // Pointer event wrappers that check if touch was recently used
  const handlePointerDown = useCallback((e) => {
    // If touch was used recently (within 100ms), ignore pointer event (avoid duplication)
    if (lastTouchRef.current && Date.now() - lastTouchRef.current < 100) {
      return;
    }
    startDrawing(e);
  }, [startDrawing]);

  const handlePointerMove = useCallback((e) => {
    if (lastTouchRef.current && Date.now() - lastTouchRef.current < 100) {
      return;
    }
    draw(e);
  }, [draw]);

  const handlePointerUp = useCallback((e) => {
    if (lastTouchRef.current && Date.now() - lastTouchRef.current < 100) {
      return;
    }
    stopDrawing(e);
  }, [stopDrawing]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = contextRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasContent(false);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!hasContent || isProcessing) return;
    
    const canvas = canvasRef.current;
    
    // Create a temporary canvas to composite against a black background
    // (Since our strokes are white/light on transparent, OpenAI might see white-on-white)
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tCtx = tempCanvas.getContext('2d');
    
    // Fill with black
    tCtx.fillStyle = '#000000';
    tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    // Draw original drawing on top
    tCtx.drawImage(canvas, 0, 0);
    
    // Export as JPEG (smaller, good for photos/vision)
    const imageData = tempCanvas.toDataURL('image/jpeg', 0.85); // High quality for text/lines
    
    onSubmit(imageData);
  }, [hasContent, isProcessing, onSubmit]);

  return (
    <div className={`writing-canvas-container ${fullScreen ? 'fullscreen' : ''}`}>
      <div className="canvas-paper">
        <div className="paper-texture" />
        <canvas
          ref={canvasRef}
          className="writing-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        />
        {!fullScreen && (
          <div className="canvas-placeholder" style={{ opacity: hasContent ? 0 : 1 }}>
            <span>Escribe aquí tu emoción...</span>
          </div>
        )}
      </div>
      
      <div className="canvas-footer">
        {(!fullScreen || hasContent) && (
          <div className="button-group">
            <button 
              className="btn btn-secondary" 
              onClick={clearCanvas}
              disabled={!hasContent || isProcessing}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
              </svg>
              Borrar
            </button>
            <button 
              className="btn btn-primary" 
              onClick={handleSubmit}
              disabled={!hasContent || isProcessing}
            >
              {isProcessing ? (
                <>
                  <span className="loading-spinner" />
                  Creando poema...
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                  Generar poema
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
