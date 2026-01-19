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
