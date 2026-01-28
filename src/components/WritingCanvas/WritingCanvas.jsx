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

export default function WritingCanvas({ onSubmit, isProcessing, fullScreen = false, onStrokeUpdate, onInteractionStart, isProjection = false }) {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const lastTouchRef = useRef(null); // Track if we're using touch to avoid pointer duplication
  const channelRef = useRef(null);

  // Initialize BroadcastChannel
  useEffect(() => {
    channelRef.current = new BroadcastChannel('guestbook_sync');
    
    if (isProjection) {
      channelRef.current.onmessage = (event) => {
        const { type, data } = event.data;
        const canvas = canvasRef.current;
        const ctx = contextRef.current;
        if (!canvas || !ctx) return;

        // Obtener dimensiones actuales del receptor para mapear correctamente las coordenadas normalizadas
        const rect = canvas.getBoundingClientRect();

        if (type === 'STROKE_START') {
          const x = data.x * rect.width;
          const y = data.y * rect.height;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineWidth = 12;
          if (onStrokeUpdate) onStrokeUpdate(x, y, true);
          setHasContent(true);
        } else if (type === 'STROKE_MOVE') {
          const x = data.x * rect.width;
          const y = data.y * rect.height;
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x, y);
          if (onStrokeUpdate) onStrokeUpdate(x, y, true);
        } else if (type === 'STROKE_END') {
          ctx.closePath();
          if (onStrokeUpdate) onStrokeUpdate(0, 0, false);
        } else if (type === 'CLEAR') {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          setHasContent(false);
          if (onStrokeUpdate) onStrokeUpdate(0, 0, false);
        }
      };
    }

    return () => {
      if (channelRef.current) channelRef.current.close();
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
  }, [fullScreen]);

  const getPointerPosition = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure || 0.5,
      // Normalized coordinates (0-1) for sync
      nx: (e.clientX - rect.left) / rect.width,
      ny: (e.clientY - rect.top) / rect.height
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
      ny: (touch.clientY - rect.top) / rect.height
    };
  }, []);

  const startDrawing = useCallback((e) => {
    if (isProjection) return;
    e.preventDefault();
    e.stopPropagation();
    
    if (e.pointerId !== undefined) {
      e.target.setPointerCapture(e.pointerId);
    }
    
    const { x, y, nx, ny } = getPointerPosition(e);
    
    if (onStrokeUpdate) onStrokeUpdate(x, y, true);
    if (onInteractionStart) onInteractionStart();
    
    // Broadcast
    if (channelRef.current) {
      channelRef.current.postMessage({ type: 'STROKE_START', data: { x: nx, y: ny } });
    }
    
    const ctx = contextRef.current;
    if (!ctx) return;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = 12;
    
    setIsDrawing(true);
    setHasContent(true);
  }, [getPointerPosition, onStrokeUpdate, onInteractionStart, isProjection]);

  const draw = useCallback((e) => {
    if (!isDrawing || isProjection) return;
    e.preventDefault();
    e.stopPropagation();
    
    const ctx = contextRef.current;
    if (!ctx) return;
    
    if (e.getCoalescedEvents) {
        const events = e.getCoalescedEvents();
        for (const event of events) {
            const { x, y, nx, ny } = getPointerPosition(event);
            ctx.lineTo(x, y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x, y);
            if (onStrokeUpdate) onStrokeUpdate(x, y, true);
            if (channelRef.current) {
              channelRef.current.postMessage({ type: 'STROKE_MOVE', data: { x: nx, y: ny } });
            }
        }
    } else {
        const { x, y, nx, ny } = getPointerPosition(e);
        if (onStrokeUpdate) onStrokeUpdate(x, y, true);
        if (channelRef.current) {
          channelRef.current.postMessage({ type: 'STROKE_MOVE', data: { x: nx, y: ny } });
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
    if (channelRef.current) {
      channelRef.current.postMessage({ type: 'STROKE_END' });
    }
    
    setIsDrawing(false);
  }, [onStrokeUpdate, isProjection]);

  const handleTouchStart = useCallback((e) => {
    if (isProjection) return;
    e.preventDefault();
    e.stopPropagation();
    
    lastTouchRef.current = Date.now();
    const touch = e.touches[0];
    const { x, y, nx, ny } = getTouchPosition(touch);
    
    if (onStrokeUpdate) onStrokeUpdate(x, y, true);
    if (channelRef.current) {
      channelRef.current.postMessage({ type: 'STROKE_START', data: { x: nx, y: ny } });
    }
    
    const ctx = contextRef.current;
    if (!ctx) return;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = 12;
    
    setIsDrawing(true);
    setHasContent(true);
  }, [getTouchPosition, onStrokeUpdate, isProjection]);

  const handleTouchMove = useCallback((e) => {
    if (!isDrawing || isProjection) return;
    e.preventDefault();
    e.stopPropagation();
    
    lastTouchRef.current = Date.now();
    const touch = e.touches[0];
    const { x, y, nx, ny } = getTouchPosition(touch);
    
    if (onStrokeUpdate) onStrokeUpdate(x, y, true);
    if (channelRef.current) {
      channelRef.current.postMessage({ type: 'STROKE_MOVE', data: { x: nx, y: ny } });
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
    if (channelRef.current) {
      channelRef.current.postMessage({ type: 'STROKE_END' });
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
    
    if (!isProjection && channelRef.current) {
      channelRef.current.postMessage({ type: 'CLEAR' });
    }
  }, [isProjection]);

  const handleSubmit = useCallback(() => {
    if (!hasContent || isProcessing) return;
    
    const canvas = canvasRef.current;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tCtx = tempCanvas.getContext('2d');
    
    tCtx.fillStyle = '#FFFFFF';
    tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    if (fullScreen) {
        tCtx.globalCompositeOperation = 'difference';
    }
    tCtx.drawImage(canvas, 0, 0);
    tCtx.globalCompositeOperation = 'source-over';
    
    const imageData = tempCanvas.toDataURL('image/jpeg', 0.85);
    onSubmit(imageData);
  }, [hasContent, isProcessing, onSubmit, fullScreen]);

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
