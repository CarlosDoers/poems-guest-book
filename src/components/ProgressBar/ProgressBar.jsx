import React from 'react';
import './ProgressBar.css';

export default function ProgressBar({ text = "Generando poema..." }) {
  return (
    <div className="progress-wrapper">
      <div className="progress-container">
        <div className="progress-fill"></div>
      </div>
      <div className="progress-text">{text}</div>
    </div>
  );
}
