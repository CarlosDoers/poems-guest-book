import { useRef, useState, useEffect, useCallback } from 'react';
import './WritingCanvas.css';
import { getSyncChannel } from '../../services/sync';

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

export default function WritingCanvas({ onSubmit, isProcessing, fullScreen = false, onStrokeUpdate, onInteractionStart, onInteraction, isProjection = false, shouldReset = false, externalAudioRef }) {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const lastTouchRef = useRef(null); // Track if we're using touch to avoid pointer duplication

  // Clear canvas when shouldReset becomes true
  useEffect(() => {
    if (shouldReset) {
      const canvas = canvasRef.current;
      const ctx = contextRef.current;
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasContent(false);
        // We don't broadcast CLEAR here to avoid loops, as the parent controls the reset
      }
    }
  }, [shouldReset]);

  // Initialize Supabase Realtime Channel
  useEffect(() => {
    const channel = getSyncChannel();
    if (!channel) return;
    
    if (isProjection) {
      channel
        .on('broadcast', { event: 'STROKE_START' }, (payload) => {
          if (!payload?.payload?.data) return;
          const { data } = payload.payload;
          const canvas = canvasRef.current;
          const ctx = contextRef.current;
          if (!canvas || !ctx) return;
          const rect = canvas.getBoundingClientRect();
          const x = data.x * rect.width;
          const y = data.y * rect.height;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineWidth = 12;
          
          if (onStrokeUpdate) {
            // Convert canvas-relative to viewport-relative
            const vx = (rect.left + x) / window.innerWidth;
            const vy = (rect.top + y) / window.innerHeight;
            onStrokeUpdate(vx, vy, true);
          }
          setHasContent(true);
        })
        .on('broadcast', { event: 'STROKE_MOVE' }, (payload) => {
          if (!payload?.payload?.data) return;
          const { data } = payload.payload;
          const canvas = canvasRef.current;
          const ctx = contextRef.current;
          if (!canvas || !ctx) return;
          const rect = canvas.getBoundingClientRect();
          const x = data.x * rect.width;
          const y = data.y * rect.height;
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x, y);
          
          if (onStrokeUpdate) {
            const vx = (rect.left + x) / window.innerWidth;
            const vy = (rect.top + y) / window.innerHeight;
            onStrokeUpdate(vx, vy, true);
          }
        })
        .on('broadcast', { event: 'STROKE_END' }, () => {
          const ctx = contextRef.current;
          if (!ctx) return;
          ctx.closePath();
          if (onStrokeUpdate) onStrokeUpdate(0, 0, false);
        })
        .on('broadcast', { event: 'CLEAR' }, () => {
          console.log('[PROJECTION] 🧹 CLEAR recibido en canvas');
          const canvas = canvasRef.current;
          const ctx = contextRef.current;
          if (!canvas || !ctx) return;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          setHasContent(false);
          if (onStrokeUpdate) onStrokeUpdate(0, 0, false);
        });
    }

    return () => {
      // No desuscribimos el canal compartido aquí para no romper App.jsx
    };
  }, [isProjection, onStrokeUpdate]);

  useEffect(() => {
    const canvas = canvasRef.current;
    
    // Set canvas size based on container
    const resizeCanvas = () => {
      const container = canvas.parentElement;
      const rect = container.getBoundingClientRect();
      
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
        ctx.strokeStyle = '#FFFFFF';
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
      ctx.lineWidth = 12;
      
      contextRef.current = ctx;
    };

    resizeCanvas();
    const debouncedResize = debounce(resizeCanvas, 250);
    window.addEventListener('resize', debouncedResize);
    
    const preventDoubleTap = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    canvas.addEventListener('dblclick', preventDoubleTap);
    
    return () => {
      window.removeEventListener('resize', debouncedResize);
      canvas.removeEventListener('dblclick', preventDoubleTap);
    };
  }, [fullScreen, isProjection]);

  const getPointerPosition = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure || 0.5,
      // Normalized coordinates (0-1) relative to canvas for sync
      nx: (e.clientX - rect.left) / rect.width,
      ny: (e.clientY - rect.top) / rect.height,
      // Viewport normalized coordinates for local effect
      vx: e.clientX / window.innerWidth,
      vy: e.clientY / window.innerHeight
    };
  }, []);

  const getTouchPosition = useCallback((touch) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
      pressure: touch.force || 0.5,
      nx: (touch.clientX - rect.left) / rect.width,
      ny: (touch.clientY - rect.top) / rect.height,
      vx: touch.clientX / window.innerWidth,
      vy: touch.clientY / window.innerHeight
    };
  }, []);

  const startDrawing = useCallback((e) => {
    if (isProjection) return;
    e.preventDefault();
    e.stopPropagation();
    
    if (e.pointerId !== undefined) {
      e.target.setPointerCapture(e.pointerId);
    }
    
    const { x, y, nx, ny, vx, vy } = getPointerPosition(e);
    
    if (onStrokeUpdate) onStrokeUpdate(vx, vy, true);
    if (onInteractionStart) onInteractionStart();
    if (onInteraction) onInteraction();
    
    // Broadcast via Supabase Realtime
    const channel = getSyncChannel();
    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'STROKE_START',
        payload: { data: { x: nx, y: ny } }
      });
    }
    
    const ctx = contextRef.current;
    if (!ctx) return;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = 12;
    
    setIsDrawing(true);
    setHasContent(true);
  }, [getPointerPosition, onStrokeUpdate, onInteractionStart, isProjection, onInteraction]);

  const draw = useCallback((e) => {
    if (!isDrawing || isProjection) return;
    e.preventDefault();
    e.stopPropagation();
    
    const ctx = contextRef.current;
    if (!ctx) return;
    
    if (e.getCoalescedEvents) {
        const events = e.getCoalescedEvents();
        for (const event of events) {
            const { x, y, nx, ny, vx, vy } = getPointerPosition(event);
            ctx.lineTo(x, y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x, y);
            if (onStrokeUpdate) onStrokeUpdate(vx, vy, true);
            const channel = getSyncChannel();
            if (channel) {
              channel.send({
                type: 'broadcast',
                event: 'STROKE_MOVE',
                payload: { data: { x: nx, y: ny } }
              });
            }
        }
    } else {
        const { x, y, nx, ny, vx, vy } = getPointerPosition(e);
        if (onStrokeUpdate) onStrokeUpdate(vx, vy, true);
        const channel = getSyncChannel();
        if (channel) {
          channel.send({
            type: 'broadcast',
            event: 'STROKE_MOVE',
            payload: { data: { x: nx, y: ny } }
          });
        }
        
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
    }
  }, [isDrawing, getPointerPosition, onStrokeUpdate, isProjection]);

  const stopDrawing = useCallback((e) => {
    if (isProjection) return;
    if (e) {
        e.preventDefault();
        if (e.pointerId !== undefined) {
          e.target.releasePointerCapture(e.pointerId);
        }
    }
    const ctx = contextRef.current;
    if (ctx) ctx.closePath();
    
    if (onStrokeUpdate) onStrokeUpdate(0, 0, false);
    const channel = getSyncChannel();
    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'STROKE_END',
        payload: {}
      });
    }
    
    setIsDrawing(false);
  }, [onStrokeUpdate, isProjection]);

  const handleTouchStart = useCallback((e) => {
    if (isProjection) return;
    e.preventDefault();
    e.stopPropagation();
    
    lastTouchRef.current = Date.now();
    const touch = e.touches[0];
    const { x, y, nx, ny, vx, vy } = getTouchPosition(touch);
    
    if (onStrokeUpdate) onStrokeUpdate(vx, vy, true);
    if (onInteraction) onInteraction();
    const channel = getSyncChannel();
    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'STROKE_START',
        payload: { data: { x: nx, y: ny } }
      });
    }
    
    const ctx = contextRef.current;
    if (!ctx) return;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = 12;
    
    setIsDrawing(true);
    setHasContent(true);
  }, [getTouchPosition, onStrokeUpdate, isProjection, onInteraction]);

  const handleTouchMove = useCallback((e) => {
    if (!isDrawing || isProjection) return;
    e.preventDefault();
    e.stopPropagation();
    
    lastTouchRef.current = Date.now();
    const touch = e.touches[0];
    const { x, y, nx, ny, vx, vy } = getTouchPosition(touch);
    
    if (onStrokeUpdate) onStrokeUpdate(vx, vy, true);
    const channel = getSyncChannel();
    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'STROKE_MOVE',
        payload: { data: { x: nx, y: ny } }
      });
    }
    
    const ctx = contextRef.current;
    if (!ctx) return;
    
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, [isDrawing, getTouchPosition, onStrokeUpdate, isProjection]);

  const handleTouchEnd = useCallback((e) => {
    if (isProjection) return;
    e.preventDefault();
    e.stopPropagation();
    
    lastTouchRef.current = Date.now();
    const ctx = contextRef.current;
    if (ctx) ctx.closePath();
    if (onStrokeUpdate) onStrokeUpdate(0, 0, false);
    const channel = getSyncChannel();
    if (channel) {
      channel.send({
        type: 'broadcast',
        event: 'STROKE_END',
        payload: {}
      });
    }
    
    setIsDrawing(false);
  }, [onStrokeUpdate, isProjection]);

  const handlePointerDown = useCallback((e) => {
    if (lastTouchRef.current && Date.now() - lastTouchRef.current < 100) return;
    startDrawing(e);
  }, [startDrawing]);

  const handlePointerMove = useCallback((e) => {
    if (lastTouchRef.current && Date.now() - lastTouchRef.current < 100) return;
    draw(e);
  }, [draw]);

  const handlePointerUp = useCallback((e) => {
    if (lastTouchRef.current && Date.now() - lastTouchRef.current < 100) return;
    stopDrawing(e);
  }, [stopDrawing]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = contextRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasContent(false);
    if (onInteraction) onInteraction();
    
    if (!isProjection) {
      const channel = getSyncChannel();
      if (channel) {
        channel.send({
          type: 'broadcast',
          event: 'CLEAR',
          payload: {}
        });
      }
    }
  }, [isProjection, onInteraction]);

  const handleSubmit = useCallback(() => {
    if (!hasContent || isProcessing) return;
    
    const canvas = canvasRef.current;
    
    // Convert to transparent PNG
    const imageData = canvas.toDataURL('image/png');
    
    // TRICK: Create and play/pause a tiny silent audio to "unlock" audio on iPad/iOS
    // This must be triggered by a direct user action (like this click)
    try {
      if (externalAudioRef && externalAudioRef.current) {
        const audio = externalAudioRef.current;
        // iPad needs a real attempt to play to consider it unlocked
        audio.play().then(() => {
          audio.pause();
          console.log('🔊 Persistent audio element "unlocked" for iPad');
        }).catch(err => {
          console.log('ℹ️ Expected audio warm-up catch:', err.name);
        });
      }
    } catch (e) {
      console.warn('Audio unlock failed', e);
    }
    
    if (onInteraction) onInteraction();
    onSubmit(imageData);
  }, [hasContent, isProcessing, onSubmit, onInteraction]);

  return (
    <div className={`writing-canvas-container ${fullScreen ? 'fullscreen' : ''} ${isProjection ? 'projection-canvas' : ''}`}>
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
        {!fullScreen && !isProjection && (
          <div className="canvas-placeholder" style={{ opacity: hasContent ? 0 : 1 }}>
            <span>Escribe aquí tu emoción...</span>
          </div>
        )}
      </div>
      
      {!isProjection && (
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
      )}
    </div>
  );
}
