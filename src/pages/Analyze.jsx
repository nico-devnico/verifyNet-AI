import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Link2, Search } from 'lucide-react';
import useStore from '../store';
import { analyzeText, analyzeUrl } from '../services/api';
import { isValidUrl, sanitizeInput } from '../utils/helpers';
import AnalysisProgress from '../components/analysis/AnalysisProgress';
import AnalysisResults from '../components/analysis/AnalysisResults';
import './Analyze.css';

export default function Analyze() {
  const [tab, setTab] = useState('text');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const {
    isAnalyzing, setIsAnalyzing, currentAnalysis, setCurrentAnalysis,
    analysisProgress, setAnalysisProgress, analysisStep, setAnalysisStep, addAnalysis
  } = useStore();

  const handleAnalyze = useCallback(async () => {
    setError('');
    const input = tab === 'text' ? text.trim() : url.trim();

    if (!input) { setError(tab === 'text' ? 'Veuillez saisir un texte à analyser.' : 'Veuillez saisir une URL valide.'); return; }
    if (tab === 'text' && input.length < 20) { setError('Le texte doit contenir au moins 20 caractères.'); return; }
    if (tab === 'url' && !isValidUrl(input)) { setError('Veuillez saisir une URL valide (http:// ou https://).'); return; }

    setIsAnalyzing(true);
    setAnalysisProgress(0);
    setAnalysisStep('Initialisation...');

    try {
      const onProgress = (progress, step) => {
        setAnalysisProgress(progress);
        setAnalysisStep(step);
      };

      const result = tab === 'text'
        ? await analyzeText(sanitizeInput(input), onProgress)
        : await analyzeUrl(input, onProgress);
      
      setCurrentAnalysis(result);
      const resultScore = result.final_score ?? result.finalScore ?? result.score ?? 0;
      addAnalysis({ type: tab, input: tab === 'text' ? input.slice(0, 100) : input, score: resultScore, verdict: result.verdict });
    } catch (err) {
      setError(err.message || 'Une erreur est survenue lors de l\'analyse. Veuillez réessayer.');
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress(100);
    }
  }, [tab, text, url, setIsAnalyzing, setCurrentAnalysis, addAnalysis, setAnalysisProgress, setAnalysisStep]);

  const handleReset = useCallback(() => {
    setCurrentAnalysis(null);
    setText('');
    setUrl('');
    setError('');
    setAnalysisProgress(0);
  }, [setCurrentAnalysis, setAnalysisProgress]);

  return (
    <div className="analyze-page">
      <div className="container">
        {/* Header */}
        <motion.div className="analyze-header" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1>Vérifiez une info</h1>
          <p>Collez un texte ou un lien, on s'occupe du reste.</p>
        </motion.div>

        {!isAnalyzing && !currentAnalysis && (
          <motion.div className="analyze-form" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            {/* Tabs */}
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'text'} className={`tab ${tab === 'text' ? 'active' : ''}`} onClick={() => { setTab('text'); setError(''); }}>
                <FileText size={17} />
                Texte
              </button>
              <button role="tab" aria-selected={tab === 'url'} className={`tab ${tab === 'url' ? 'active' : ''}`} onClick={() => { setTab('url'); setError(''); }}>
                <Link2 size={17} />
                URL
              </button>
            </div>

            {/* Input */}
            <div className="input-area" role="tabpanel">
              {tab === 'text' ? (
                <textarea
                  className="text-input"
                  placeholder="Collez ici le texte que vous voulez vérifier — une publication Facebook, un message transféré, une rumeur, n'importe quelle affirmation qui vous semble suspecte."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={8}
                  aria-label="Texte à analyser"
                  maxLength={5000}
                />
              ) : (
                <div className="url-input-wrapper">
                  <Link2 size={18} className="url-input-icon" />
                  <input
                    type="url"
                    className="url-input"
                    placeholder="https://..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    aria-label="URL à analyser"
                  />
                </div>
              )}

              {error && <p className="error-msg" role="alert">{error}</p>}

              <div className="form-actions">
                <button className="btn btn-primary btn-lg" onClick={handleAnalyze} disabled={isAnalyzing}>
                  <Search size={18} />
                  Analyser
                </button>
                {tab === 'text' && <span className="char-count">{text.length}/5000</span>}
              </div>
            </div>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {isAnalyzing && <AnalysisProgress key="progress" progress={analysisProgress} step={analysisStep} />}
          {currentAnalysis && !isAnalyzing && <AnalysisResults key="results" data={currentAnalysis} onReset={handleReset} />}
        </AnimatePresence>
      </div>
    </div>
  );
}
