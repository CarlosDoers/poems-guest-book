import { useState, useCallback, useEffect, lazy, Suspense, useRef } from 'react';
import WritingCanvas from './components/WritingCanvas/WritingCanvas';
import Loader from './components/Loader/Loader';
import { generatePoem, recognizeEmotionFromImage, generateIllustration, isOpenAIConfigured } from './services/ai';

// Lazy load heavy components
const PoemDisplay = lazy(() => import('./components/PoemDisplay/PoemDisplay'));
const PoemCarousel = lazy(() => import('./components/PoemCarousel/PoemCarousel'));
import { savePoem, getRecentPoems, isSupabaseConfigured, uploadIllustration } from './services/supabase';
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

function RippleBackground({ enabled }) {
  const canvasRef = useRef(null);

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
      precision highp float;

      uniform vec2 uResolution;
      uniform float uTime;
      uniform vec4 uMouse;
      uniform sampler2D uChannel0;
      uniform float uVideoReady;

      vec2 paramsDefault() {
        return vec2(2.5, 10.0);
      }

      float wave(vec2 pos, float t, float freq, float numWaves, vec2 center) {
        float d = length(pos - center);
        d = log(1.0 + exp(d));
        return 1.0 / (1.0 + 20.0 * d * d) * sin(6.2831853 * (-numWaves * d + t * freq));
      }

      float height(vec2 pos, float t, vec2 params) {
        float w = wave(pos, t, params.x, params.y, vec2(0.5, -0.5));
        w += wave(pos, t, params.x, params.y, -vec2(0.5, -0.5));
        return w;
      }

      vec2 normalV(vec2 pos, float t, vec2 params) {
        float e = 0.01;
        return vec2(
          height(pos - vec2(e, 0.0), t, params) - height(pos, t, params),
          height(pos - vec2(0.0, e), t, params) - height(pos, t, params)
        );
      }

      vec3 baseColor(vec2 uv) {
        vec2 p = uv * 2.0 - 1.0;
        float r = length(p);
        float a = atan(p.y, p.x);
        float g1 = 0.55 + 0.45 * sin(3.0 * a + 2.2 * uTime + r * 4.0);
        float g2 = 0.55 + 0.45 * sin(2.0 * a - 1.6 * uTime + r * 3.0);
        vec3 c1 = vec3(0.02, 0.45, 0.62);
        vec3 c2 = vec3(0.08, 0.85, 0.92);
        vec3 col = mix(c1, c2, 0.5 + 0.5 * sin((g1 + g2) * 1.2));
        float v = smoothstep(1.1, 0.2, r);
        return col * (0.35 + 0.65 * v);
      }

      void main() {
        vec2 fragCoord = gl_FragCoord.xy;
        vec2 uv = fragCoord / uResolution.xy;
        vec2 uvn = 2.0 * uv - vec2(1.0);

        vec2 params = paramsDefault();
        if (uMouse.z > 0.0) {
          params = 2.0 * params * (uMouse.xy / uResolution.xy);
          params.x = max(params.x, 0.2);
          params.y = max(params.y, 0.5);
        }

        vec2 n = normalV(uvn, uTime, params);
        vec2 duv = n * 0.085;

        vec2 suv = vec2(1.0 - (uv.x + duv.x), uv.y + duv.y);
        vec2 texUv = clamp(suv, 0.0, 1.0);
        vec3 camCol = texture2D(uChannel0, texUv).rgb;
        vec3 col = mix(baseColor(fract(suv)), camCol, step(0.5, uVideoReady));
        float vignette = smoothstep(1.25, 0.2, length(uvn));
        col *= 0.75 + 0.25 * vignette;

        gl_FragColor = vec4(col, 1.0);
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
    const uTime = gl.getUniformLocation(program, 'uTime');
    const uMouse = gl.getUniformLocation(program, 'uMouse');
    const uChannel0 = gl.getUniformLocation(program, 'uChannel0');
    const uVideoReady = gl.getUniformLocation(program, 'uVideoReady');

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    const video = document.createElement('video');
    
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

    const mouse = { x: 0, y: 0, down: 0 };
    const onPointerMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - rect.left) * (window.devicePixelRatio || 1);
      mouse.y = (rect.bottom - e.clientY) * (window.devicePixelRatio || 1);
    };
    const onPointerDown = () => {
      mouse.down = 1;
    };
    const onPointerUp = () => {
      mouse.down = 0;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
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
    const render = () => {
      const now = performance.now();
      const t = (now - start) / 1000;
      gl.uniform1f(uTime, t);
      gl.uniform4f(uMouse, mouse.x, mouse.y, mouse.down, 0);
      gl.uniform1f(uVideoReady, videoReady ? 1 : 0);

      if (videoReady && video.readyState >= 2) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 6);
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
}

export default function App() {
  const [appState, setAppState] = useState(STATES.WRITING);
  const [writingStage, setWritingStage] = useState(WRITING_STAGES.INTRO);
  const [poem, setPoem] = useState(null);
  const [illustration, setIllustration] = useState(null);
  const [emotion, setEmotion] = useState('');
  const [poemId, setPoemId] = useState(null); // ID del poema guardado
  const [existingAudioUrl, setExistingAudioUrl] = useState(null); // Audio from DB
  const [recentPoems, setRecentPoems] = useState([]);
  const [isPoemsLoading, setIsPoemsLoading] = useState(true);
  const [error, setError] = useState(null);

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
      
      // Step 1: Vision AI - Recognize the handwriting
      console.log('👁️ Reading handwriting...');
      const recognizedText = await recognizeEmotionFromImage(imageData);
      
      if (!recognizedText) {
        throw new Error('No se pudo reconocer ninguna emoción. Intenta escribir más claro.');
      }
      
      setEmotion(recognizedText);
      
      // Step 2: Generate Content
      console.log('✨ Generating poem & art...');
      
      const poemPromise = generatePoem(recognizedText);
      const illustrationPromise = generateIllustration(recognizedText);
      
      const [poemResult, illustrationResult] = await Promise.allSettled([
        poemPromise,
        illustrationPromise
      ]);
      
      // Handle Poem
      if (poemResult.status === 'fulfilled') {
        const generatedPoem = poemResult.value;
        
        let displayUrl = null; // For showing now
        let permanentUrl = null; // For saving to DB
        let rawBase64 = null;

        setPoem(generatedPoem);
        
        // Handle Illustration
        if (illustrationResult.status === 'fulfilled' && illustrationResult.value) {
          rawBase64 = illustrationResult.value;
          // Create temp URL for immediate display
          displayUrl = `data:image/png;base64,${rawBase64}`;
          
          console.log('🎨 Illustration ready for display');
          setIllustration(displayUrl);
          
          // Preload temp image (already in memory but good practice)
          try {
            await new Promise((resolve) => {
              const img = new Image();
              img.onload = resolve;
              img.onerror = resolve; 
              img.src = displayUrl;
            });
          } catch (e) {
            console.warn('Image preload failed', e);
          }
        } else {
          setIllustration(null);
        }
        
        setAppState(STATES.POEM);

        // Step 3: Upload & Save (non-blocking for UI, but blocking for DB consistency)
        if (isSupabaseConfigured()) {
          (async () => {
            try {
              // If we have an image, upload it first to get permanent URL
              if (rawBase64) {
                console.log('☁️ Uploading image to storage...');
                permanentUrl = await uploadIllustration(rawBase64, recognizedText);
              }
              
              const savedPoem = await savePoem({ 
                emotion: recognizedText, 
                poem: generatedPoem, 
                illustration: permanentUrl // Null if failed or no image
              });
              
              // Store poem ID for audio association
              if (savedPoem?.id) {
                setPoemId(savedPoem.id);
                
                // Optimización: agregar nuevo poema al state en lugar de recargar todos
                setRecentPoems(prev => [savedPoem, ...prev].slice(0, 20));
              }
            } catch (error) {
              console.error('Failed to save poem to database:', error);
              // No bloqueamos la UI, el poema ya se muestra
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

  const isWritingIntro = appState === STATES.WRITING && writingStage === WRITING_STAGES.INTRO;
  const isWritingCanvas = appState === STATES.WRITING && writingStage === WRITING_STAGES.CANVAS;
  const isFullScreenWriting = isWritingIntro || isWritingCanvas;

  return (
    <div className={`app ${appState === STATES.POEM ? 'app-scrollable' : 'app-fixed'} ${isFullScreenWriting ? 'app-fullscreen' : ''}`}>
      <RippleBackground enabled={isFullScreenWriting} />
      {/* Configuration Warnings */}
      {configWarnings.length > 0 && appState === STATES.WRITING && !isFullScreenWriting && (
        <div className="config-warnings">
          {configWarnings.map((warning, i) => (
            <p key={i} className="config-warning">{warning}</p>
          ))}
        </div>
      )}

      {/* Writing State */}
      {isWritingIntro && (
        <div
          className="intro-screen"
          role="button"
          tabIndex={0}
          onPointerUp={handleStartWriting}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') handleStartWriting();
          }}
        >
          <div className="intro-title">Eres un poema</div>
          <div className="intro-cta">Pulsa para comenzar</div>
        </div>
      )}

      {isWritingCanvas && (
        <div className="writing-screen">
          <div className="writing-hint">Usa el boli para escribir una emoción</div>
          <WritingCanvas onSubmit={handleCanvasSubmit} isProcessing={false} fullScreen />
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
      {appState === STATES.POEM && (recentPoems.length > 0 || isPoemsLoading) && (
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
        <div className="error-container animate-fade-in-up">
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
