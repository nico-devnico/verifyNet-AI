import { motion } from 'framer-motion';
import { FileText, Search, Brain, ShieldCheck, FileOutput } from 'lucide-react';
import './AnalysisProgress.css';

/** Circonférence de l'anneau (r = 74) : le pourcentage doit tenir dans le disque intérieur. */
const RING = 2 * Math.PI * 74;

const steps = [
  { Icon: FileText, label: 'Extraction infos clés' },
  { Icon: Search, label: 'Recherche web' },
  { Icon: Brain, label: 'Analyse des sources' },
  { Icon: ShieldCheck, label: 'Analyse finale' },
  { Icon: FileOutput, label: 'Rapport final' },
];

export default function AnalysisProgress({ progress, step }) {
  const activeIndex = progress < 20 ? 0 : progress < 40 ? 1 : progress < 60 ? 2 : progress < 80 ? 3 : 4;

  return (
    <motion.div className="analysis-progress" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
      <div className="progress-card">
        {/* Animated loader */}
        <div className="progress-visual">
          <div
            className="progress-ring"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            aria-label="Progression de l’analyse"
          >
            <svg viewBox="0 0 176 176">
              <circle cx="88" cy="88" r="74" fill="none" stroke="var(--border)" strokeWidth="11" />
              <motion.circle
                cx="88" cy="88" r="74" fill="none" stroke="var(--primary)" strokeWidth="11"
                strokeLinecap="round" strokeDasharray={RING}
                animate={{ strokeDashoffset: RING - (RING * progress) / 100 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                transform="rotate(-90 88 88)"
              />
            </svg>
            <span className="progress-percent">{Math.round(progress)}%</span>
          </div>
        </div>

        {/* Current step */}
        <p className="progress-step">{step}</p>

        {/* Steps list */}
        <div className="progress-steps">
          {steps.map((step, i) => (
            <div key={i} className={`progress-step-item ${i < activeIndex ? 'done' : ''} ${i === activeIndex ? 'active' : ''}`}>
              <div className="step-icon">
                {i < activeIndex ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                ) : i === activeIndex ? (
                  <div className="step-spinner" />
                ) : (
                  <step.Icon size={16} className="step-icon-svg" />
                )}
              </div>
              <span className="step-label">{step.label}</span>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="progress-bar">
          <motion.div className="progress-bar-fill" animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} />
        </div>
      </div>
    </motion.div>
  );
}
