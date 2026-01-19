import { useState, useCallback, useEffect, lazy, Suspense, useRef, forwardRef, useImperativeHandle } from 'react';
import WritingCanvas from './components/WritingCanvas/WritingCanvas';
import Loader from './components/Loader/Loader';
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

// -------------------------------------------------------------
// CONFIGURACIÓN DE EFECTOS VISUALES (SHADER DE AGUA)
// Modifica estos valores para personalizar el aspecto
// -------------------------------------------------------------
const SHADER_CONFIG = {
  // Movimiento base del agua
  baseWaveSpeed: 1.4,         // Velocidad más suave para ondas orgánicas
  waveAmplitude: 1.5,         // Altura general de las olas (reducido para más sutileza)
  waveFrequency: 12.0,         // Frecuencia/Densidad de olas (más bajo = ondas más amplias)
  
  // Ruido orgánico (NUEVO - clave para naturalidad)
  organicNoiseScale: 3.0,     // Escala del ruido Simplex para ondas naturales
  organicNoiseSpeed: 0.7,     // Velocidad del ruido (lento = más sereno)
  organicNoiseStrength: 0.5,  // Intensidad del ruido en las ondas
  microWaveIntensity: 0.01,   // Pequeñas ondulaciones de superficie - 0.12
  microWaveSpeed: 0.2,        // Velocidad de micro-ondas
  
  // Interacción (Dibujo/Lápiz) - MÁS ORGÁNICO Y SUTIL
  interactionRadius: 0.9,     // Radio de efecto más amplio para bordes suaves
  interactionStrength: 2.25,  // Intensidad reducida para sutileza
  interactionFreq: 4.5,       // Ondas más anchas y gentiles
  interactionSpeed: 2.5,      // Propagación más lenta y serena
  interactionDecay: 1.8,      // Desvanecimiento más gradual
  interactionWobble: 0.18,    // Más distorsión orgánica (menos círculos perfectos)
  
  // Distorsión visual (Refracción)
  refractionStrength: 0.065,  // Cuánto distorsiona la imagen de fondo (más sutil)

  // Color y Atmósfera - MEJORADO con variación de profundidad
  waterTint: [0.02, 0.18, 0.42],   // Color del tinte azul profundo
  shallowTint: [0.08, 0.28, 0.52], // Color en zonas "superficiales"
  tintIntensity: 0.48,             // Intensidad de la mezcla (más sutil)
  depthColorVariation: 0.25,       // Variación de color según altura de onda
  colorBalance: [0.85, 0.95, 1.25], // Balance de color más natural
  contrast: 1.5,                   // Contraste reducido para look más natural
  brightness: 0.85,                // Ligeramente más oscuro
  
  // Cáusticas (patrones de luz refractada) - NUEVO
  causticsIntensity: 0.05,    // Intensidad de cáusticas (sutil)
  causticsScale: 29.0,         // Tamaño del patrón
  causticsSpeed: 0.4,         // Velocidad de movimiento
  
  // Textura y Grano
  noiseIntensity: 0.08,       // Intensidad del grano (más sutil)

  // Iluminación (Reflejos Especulares)
  specularIntensity: 0.8,     // Intensidad de los reflejos de luz (más sutil)
  specularShininess: 55.0,    // Brillo más suave y natural
  lightDirection: [-0.4, -0.6, 1.0], // Dirección de la luz virtual [x, y, z]

  // Cámara
  cameraZoom: 1.0,            // Zoom de la cámara (1.0 = normal)



  // Enfoque (Blur Radial / Tilt-Shift)
  blurStrength: 2.5,          // Cantidad de desenfoque en los bordes
  focusRadius: 0.45,          // Tamaño del área central nítida
  baseBlur: 0.6               // Desenfoque base en toda la imagen
};

const RippleBackground = forwardRef(({ enabled, sharedPointerRef }, ref) => {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);

  useImperativeHandle(ref, () => ({
    getSnapshot: () => {
      // Capture a frame from the video stream if available
      if (!videoRef.current || videoRef.current.readyState < 2) return null;
      try {
          const v = videoRef.current;
          const c = document.createElement('canvas');
          c.width = v.videoWidth || 640;
          c.height = v.videoHeight || 480;
          const ctx = c.getContext('2d');
          
          // Mirror the image to match user experience
          ctx.translate(c.width, 0);
          ctx.scale(-1, 1);
          
          ctx.drawImage(v, 0, 0, c.width, c.height);
          // Return JPEG for smaller payload than PNG
          return c.toDataURL('image/jpeg', 0.8); 
      } catch(e) {
          console.error("Snapshot failed", e);
          return null;
      }
    }
  }));

  useEffect(() => {
    if (!enabled) return;

    const canvas = canvasRef.current;
    const gl =
      canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false }) ||
      canvas.getContext('experimental-webgl', { alpha: true, premultipliedAlpha: false, antialias: false });

    if (!gl) return;

    const vertSrc = `
      attribute vec2 aPos;
      void main() {
        gl_Position = vec4(aPos, 0.0, 1.0);
      }
    `;

    const fragSrc = `
      precision mediump float;

      uniform vec2 uResolution;
      uniform vec2 uVideoRes; 
      uniform float uTime;
      uniform vec4 uMouse;
      uniform sampler2D uChannel0;
      uniform float uVideoReady;

      #define TAU 6.28318530718
      #define MAX_ITER 3

      void main() {
        lowp float time = uTime * .5 + 23.0;
        vec2 uv = gl_FragCoord.xy / uResolution.xy;
        
        // --- Interaction (Ripples) ---
        // Simple distance-based distortion for performance
        lowp float interaction = 0.0;
        if (uMouse.z > 0.0) {
          vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
          vec2 uvCorr = uv * aspect;
          vec2 mouseCorr = (uMouse.xy / uResolution.xy) * aspect;
          lowp float dist = distance(uvCorr, mouseCorr);
          
          // Create a ripple wave based on distance
          if (dist < 0.5) {
            lowp float ripple = sin(dist * 60.0 - time * 8.0) * exp(-dist * 8.0);
            interaction = ripple * 0.02; 
          }
        }

        // --- Iterative Caustic Water Effect ---
        // Simplified version for mobile performance
        vec2 p = mod(uv * TAU, TAU) - 250.0;
        vec2 i = vec2(p);
        float c = 1.0;
        float inten = .005;

        for (int n = 0; n < MAX_ITER; n++) {
          float t = time * (1.0 - (3.5 / float(n + 1)));
          i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
          c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
        }
        
        c /= float(MAX_ITER);
        c = 1.17 - pow(c, 1.4);
        
        // Optimized color selection
        vec3 waterColour = vec3(pow(abs(c), 9.0));
        waterColour = clamp(waterColour + vec3(0.0, 0.35, 0.5), 0.0, 1.0);
        
        // Add interaction to color slightly
        waterColour += interaction * 2.0;

        // --- Video Integration ---
        vec3 finalColor;
        
        if (uVideoReady > 0.5) {
          float screenAspect = uResolution.x / uResolution.y;
          float videoAspect = uVideoRes.x / uVideoRes.y;
          vec2 texScale = vec2(1.0);
          
          if (screenAspect > videoAspect) {
             texScale.y = videoAspect / screenAspect;
          } else {
             texScale.x = screenAspect / videoAspect;
          }
          
          // Center and Zoom
          vec2 videoUv = (uv - 0.5) * texScale * 0.95 + 0.5;
          
          // Refraction (Water + Interaction)
          float distortStr = 0.015; 
          vec2 totalDistortion = vec2(sin(c * 5.0 + time), cos(c * 5.0 + time)) * distortStr;
          totalDistortion += interaction; // Add ripple distortion
          
          videoUv += totalDistortion;

          // Mirroring
          videoUv.x = 1.0 - videoUv.x;
          
          videoUv = clamp(videoUv, 0.0, 1.0);
          vec3 vidColor = texture2D(uChannel0, videoUv).rgb;
          
          // Blend Mode
          finalColor = mix(vidColor, waterColour, 0.35); 
          finalColor = finalColor * vec3(0.85, 0.95, 1.1) + vec3(0.0, 0.05, 0.1); 

        } else {
          finalColor = waterColour;
        }

        // Vignette
        vec2 uvn = 2.0 * uv - 1.0;
        float vignette = smoothstep(1.5, 0.5, length(uvn));
        finalColor *= vignette;

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;


    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = compile(gl.VERTEX_SHADER, vertSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return;
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    gl.useProgram(program);
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uResolution = gl.getUniformLocation(program, 'uResolution');
    const uVideoRes = gl.getUniformLocation(program, 'uVideoRes');
    const uTime = gl.getUniformLocation(program, 'uTime');
    const uMouse = gl.getUniformLocation(program, 'uMouse');
    const uChannel0 = gl.getUniformLocation(program, 'uChannel0');
    const uVideoReady = gl.getUniformLocation(program, 'uVideoReady');

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    const video = document.createElement('video');
    videoRef.current = video;
    
    // Critical for iOS
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('muted', '');
    
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;

    // iOS Safari fix: Video element needs to be in the DOM and visible (even if 1px transparent)
    // for the stream to update reliably as a texture
    video.style.position = 'fixed';
    video.style.top = '0';
    video.style.left = '0';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0.01'; // Not 0 to avoid being culled
    video.style.pointerEvents = 'none';
    video.style.zIndex = '-1';
    document.body.appendChild(video);

    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(uChannel0, 0);

    let stream = null;
    let videoReady = false;
    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        console.warn('Camera API not supported or not secure context');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 }
           },
          audio: false
        });
        
        video.srcObject = stream;
        
        // Ensure dimensions are set for iOS
        video.onloadedmetadata = () => {
             video.width = video.videoWidth;
             video.height = video.videoHeight;
        };

        try {
            await video.play();
            videoReady = true;
        } catch (playError) {
            console.warn("Autoplay failed/blocked:", playError);
            // Fallback for iOS interaction requirement
            const enableVideo = () => {
                video.play().then(() => {
                    videoReady = true;
                    document.removeEventListener('touchstart', enableVideo);
                    document.removeEventListener('click', enableVideo);
                });
            };
            document.addEventListener('touchstart', enableVideo);
            document.addEventListener('click', enableVideo);
        }
      } catch (e) {
        console.error('Camera/Video error:', e);
        videoReady = false;
      }
    };
    startCamera();

    const localMouse = { x: 0, y: 0, down: 0 };
    const getMouseState = () => sharedPointerRef ? sharedPointerRef.current : localMouse;

    const onPointerMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const m = getMouseState();
      m.x = (e.clientX - rect.left) * (window.devicePixelRatio || 1);
      m.y = (rect.bottom - e.clientY) * (window.devicePixelRatio || 1);
    };
    const onPointerDown = () => {
      getMouseState().down = 1;
    };
    const onPointerUp = () => {
      getMouseState().down = 0;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });

    const resize = () => {
      // PERFORMANCE OPTIMIZATION:
      // Cap DPR strictly to 1.0 or lower for mobile/iPad to prevent overheating.
      // 11-inch iPad at native res is still too many pixels.
      const isMobile = (window.innerWidth <= 1366 && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window));
      
      // We use a base DPR but on mobile we might want to render at a fraction of the screen
      // to keep pixel count manageable (e.g. max 960px width/height)
      let dpr = window.devicePixelRatio || 1;
      if (isMobile) {
        const maxDimension = 960;
        const currentMax = Math.max(window.innerWidth, window.innerHeight);
        if (currentMax > maxDimension) {
            dpr = maxDimension / currentMax;
        } else {
            dpr = 1.0;
        }
      } else {
        dpr = Math.min(dpr, 1.5);
      }
      
      const w = Math.max(1, Math.floor(window.innerWidth * dpr));
      const h = Math.max(1, Math.floor(window.innerHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uResolution, canvas.width, canvas.height);
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });

    let raf = 0;
    const start = performance.now();
    let lastFrameTime = 0;
    // Limit to 30 FPS to reduce battery consumption significantly
    const frameInterval = 1000 / 30; 

    const render = (now) => {
      // Frame limiter logic
      const delta = now - lastFrameTime;
      
      if (delta >= frameInterval) {
        lastFrameTime = now - (delta % frameInterval);
        
        const t = (now - start) / 1000;
        const m = getMouseState();
        
        gl.uniform1f(uTime, t);
        gl.uniform4f(uMouse, m.x, m.y, m.down, 0);
        gl.uniform1f(uVideoReady, videoReady ? 1 : 0);

        if (videoReady && video.readyState >= 2) {
          gl.uniform2f(uVideoRes, video.videoWidth || 1280, video.videoHeight || 720);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        }
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      
      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
      }
      if (video.parentNode) {
          document.body.removeChild(video);
      }
      gl.deleteTexture(tex);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, [enabled]);

  if (!enabled) return null;

  return <canvas ref={canvasRef} className="ripple-bg" aria-hidden="true" />;
});

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
        <Loader emotion={emotion} />
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
