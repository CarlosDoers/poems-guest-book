import { useState, useEffect } from 'react';
import './Loader.css';

const LOADING_MESSAGES = [
  "Consultando a las musas...",
  "Mezclando metáforas...",
  "Buscando la rima perfecta...",
  "Dibujando sentimientos...",
  "Tejiendo versos...",
  "Invocando la creatividad...",
  "Dando forma a lo abstracto...",
  "Traduciendo el alma..."
];

export default function Loader({ emotion }) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    // Cycle through messages every 2.5 seconds
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="loader-wrapper">
      <div className="loader-orbit" aria-hidden="true" />
      
      <div className="loader-blob">
        <div className="loader-icon">
          {/* <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19l7-7 3 3-7 7-3-3z"></path>
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>
            <path d="M2 2l7.586 7.586"></path>
            <circle cx="11" cy="11" r="2"></circle>
          </svg> */}
        </div>
      </div>

      <div className="loader-content">
        <h2 className="loader-title">
          Materializando {emotion ? `"${emotion}"` : 'tu emoción'}
        </h2>
        <p key={messageIndex} className="loader-subtitle">
          {LOADING_MESSAGES[messageIndex]}
        </p>
      </div>
    </div>
  );
}
