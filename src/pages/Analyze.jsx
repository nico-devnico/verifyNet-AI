import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Link2, Search, Image as ImageIcon, FileStack,
  AlertTriangle, Gauge, Lock, Sparkles,
} from 'lucide-react';

import useStore from '../store';
import { analyzeText, analyzeUrl, analyzeExtracted, ApiError } from '../services/api';
import { saveAnalysis, uploadSourceFile } from '../services/analyses';
import { extractText } from '../lib/extract';
import { toast } from '../store/toast';
import { isValidUrl, sanitizeInput } from '../utils/helpers';

import AnalysisProgress from '../components/analysis/AnalysisProgress';
import AnalysisResults from '../components/analysis/AnalysisResults';
import FileDropzone from '../components/analysis/FileDropzone';
import ExtractedText, { ExtractionProgress } from '../components/analysis/ExtractedText';
import './Analyze.css';

const TABS = [
  { id: 'text', label: 'Texte', icon: FileText, flag: null },
  { id: 'url', label: 'URL', icon: Link2, flag: null },
  { id: 'image', label: 'Image', icon: ImageIcon, flag: 'enable_image_analysis' },
  { id: 'document', label: 'Document', icon: FileStack, flag: 'enable_document_analysis' },
];

export default function Analyze() {
  const {
    user, isAnalyzing, setIsAnalyzing, currentAnalysis, setCurrentAnalysis,
    analysisProgress, setAnalysisProgress, analysisStep, setAnalysisStep,
    addLocalAnalysis, settingBool, settingNumber, usage, loadUsage,
    isLockedByMaintenance, setting,
  } = useStore();

  const [tab, setTab] = useState('text');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  // État de l'extraction de fichier
  const [file, setFile] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extraction, setExtraction] = useState(null); // { text, method, confidence, … }
  const [extractedValue, setExtractedValue] = useState('');
  const [extractProgress, setExtractProgress] = useState({ progress: 0, message: '' });
  const abortRef = useRef(null);

  const maxTextLength = settingNumber('max_text_length', 20000);
  const maxUploadMb = settingNumber('max_upload_size_mb', 15);
  const anonymousAllowed = settingBool('allow_anonymous_analysis', true);
  const archiveFiles = settingBool('enable_file_archiving', true);

  const availableTabs = useMemo(
    () => TABS.filter((t) => !t.flag || settingBool(t.flag, true)),
    [settingBool]
  );

  // Si le super admin désactive l'onglet actif, on revient sur « Texte ».
  useEffect(() => {
    if (!availableTabs.some((t) => t.id === tab)) setTab('text');
  }, [availableTabs, tab]);

  useEffect(() => {
    if (user) loadUsage();
  }, [user, loadUsage]);

  const resetFileState = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setFile(null);
    setExtraction(null);
    setExtractedValue('');
    setExtracting(false);
    setExtractProgress({ progress: 0, message: '' });
  }, []);

  const switchTab = (next) => {
    setTab(next);
    setError('');
    resetFileState();
  };

  /* ---------------------------------------------------------------------- */
  /* Extraction du texte d'un fichier                                       */
  /* ---------------------------------------------------------------------- */

  const runExtraction = useCallback(
    async (selected) => {
      setError('');
      setExtraction(null);
      setExtractedValue('');

      if (!selected) {
        resetFileState();
        return;
      }

      setFile(selected);
      setExtracting(true);
      setExtractProgress({ progress: 0, message: 'Préparation…' });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const result = await extractText(selected, {
          maxSizeMb: maxUploadMb,
          signal: controller.signal,
          onProgress: (p) => setExtractProgress(p),
        });

        setExtraction(result);
        setExtractedValue(result.text.slice(0, maxTextLength));
        toast.success(
          `${result.text.length.toLocaleString('fr-FR')} caractères extraits de « ${selected.name} ».`,
          'Extraction terminée'
        );
      } catch (err) {
        if (err.code === 'ABORTED') return;
        setError(err.message);
        setFile(null);
      } finally {
        setExtracting(false);
        abortRef.current = null;
      }
    },
    [maxUploadMb, maxTextLength, resetFileState]
  );

  /* ---------------------------------------------------------------------- */
  /* Lancement de l'analyse                                                 */
  /* ---------------------------------------------------------------------- */

  const handleAnalyze = useCallback(async () => {
    setError('');

    const isFileTab = tab === 'image' || tab === 'document';
    const payload = isFileTab ? extractedValue.trim() : tab === 'text' ? text.trim() : url.trim();

    if (!payload) {
      setError(
        tab === 'url'
          ? 'Veuillez saisir une URL à analyser.'
          : isFileTab
            ? 'Importez un fichier pour extraire son texte.'
            : 'Veuillez saisir un texte à analyser.'
      );
      return;
    }
    if (tab === 'url' && !isValidUrl(payload)) {
      setError('URL invalide. Elle doit commencer par http:// ou https://.');
      return;
    }
    if (tab !== 'url' && payload.length < 20) {
      setError(`Le texte doit contenir au moins 20 caractères (actuellement ${payload.length}).`);
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(0);
    setAnalysisStep('Initialisation…');

    const onProgress = (progress, step) => {
      setAnalysisProgress(progress);
      setAnalysisStep(step);
    };

    try {
      const source = isFileTab
        ? {
            fileName: file?.name ?? null,
            mime: file?.type ?? null,
            size: file?.size ?? null,
            method: extraction?.method ?? null,
            confidence: extraction?.confidence ?? null,
            pageCount: extraction?.pageCount ?? null,
          }
        : {};

      let result;
      if (tab === 'text') {
        result = await analyzeText(sanitizeInput(payload), onProgress);
      } else if (tab === 'url') {
        result = await analyzeUrl(payload, onProgress);
      } else {
        result = await analyzeExtracted(tab, payload, source, onProgress);
      }

      setCurrentAnalysis(result);

      const summary = {
        type: tab,
        input: isFileTab ? file?.name || payload.slice(0, 120) : payload.slice(0, 200),
        score: result.finalScore ?? result.final_score ?? result.score ?? 0,
        verdict: result.verdict,
      };

      if (user) {
        /*
         * Le texte a déjà été extrait dans le navigateur ; conserver le fichier
         * d'origine ne sert qu'à pouvoir le relire plus tard. Le super admin
         * peut donc couper cet archivage sans rien casser.
         */
        let storagePath = null;
        if (isFileTab && file && archiveFiles) {
          storagePath = await uploadSourceFile(user.id, file);
        }

        const saved = await saveAnalysis({
          userId: user.id,
          type: tab,
          input: summary.input,
          result,
          source: { ...source, storagePath, extractedText: isFileTab ? payload : null },
        });

        if (!saved.saved) {
          toast.warning(
            "Le résultat s'affiche mais n'a pas pu être ajouté à votre historique.",
            'Enregistrement impossible'
          );
        }
        loadUsage();
      } else {
        addLocalAnalysis(summary, result);
      }
    } catch (err) {
      const message =
        err instanceof ApiError && err.code === 'QUOTA_EXCEEDED'
          ? err.message
          : err.message || "L'analyse a échoué. Veuillez réessayer.";
      setError(message);
      toast.error(message, "Échec de l'analyse");
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress(100);
    }
  }, [
    tab, text, url, extractedValue, file, extraction, user, archiveFiles,
    setIsAnalyzing, setAnalysisProgress, setAnalysisStep, setCurrentAnalysis,
    addLocalAnalysis, loadUsage,
  ]);

  const handleReset = useCallback(() => {
    setCurrentAnalysis(null);
    setText('');
    setUrl('');
    setError('');
    setAnalysisProgress(0);
    resetFileState();
  }, [setCurrentAnalysis, setAnalysisProgress, resetFileState]);

  /* ---------------------------------------------------------------------- */
  /* Rendu                                                                   */
  /* ---------------------------------------------------------------------- */

  if (isLockedByMaintenance()) {
    return (
      <div className="analyze-page">
        <div className="container container-sm">
          <div className="empty-state card">
            <Lock size={40} strokeWidth={1.5} />
            <h3>Maintenance en cours</h3>
            <p>{setting('maintenance_message', 'VerifyNet est momentanément indisponible.')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user && !anonymousAllowed) {
    return (
      <div className="analyze-page">
        <div className="container container-sm">
          <div className="empty-state card">
            <Lock size={40} strokeWidth={1.5} />
            <h3>Connexion requise</h3>
            <p>L’analyse anonyme est désactivée. Créez un compte gratuit pour vérifier une information.</p>
            <div className="row">
              <Link to="/signup" className="btn btn-primary">Créer un compte</Link>
              <Link to="/login" className="btn btn-secondary">Se connecter</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isFileTab = tab === 'image' || tab === 'document';
  const canAnalyze =
    !isAnalyzing &&
    !extracting &&
    (isFileTab ? extractedValue.trim().length >= 20 : true);

  const showForm = !isAnalyzing && !currentAnalysis;

  return (
    <div className="analyze-page">
      <div className="container">
        <motion.div
          className="analyze-header"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1>Vérifiez une information</h1>
          <p>
            Un texte, un lien, une capture d’écran ou un document : VerifyNet croise
            les sources et vous répond.
          </p>
        </motion.div>

        {showForm && (
          <motion.div
            className="analyze-form"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
          >
            {/* Quota */}
            {user && usage?.authenticated && !usage.unlimited && (
              <div className="analyze-quota">
                <Gauge size={15} />
                <span>
                  <strong>{usage.remaining}</strong> analyse{usage.remaining !== 1 ? 's' : ''} restante
                  {usage.remaining !== 1 ? 's' : ''} aujourd’hui
                </span>
                <div className="progress-track analyze-quota-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${Math.min((usage.used / usage.limit) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {!user && (
              <div className="analyze-anon-notice">
                <Sparkles size={15} />
                <span>
                  Vous analysez en mode invité, limité à{' '}
                  {settingNumber('max_anonymous_per_day', 5)} vérifications par jour.
                </span>
                <Link to="/signup" className="analyze-anon-link">Créer un compte</Link>
              </div>
            )}

            {/* Onglets */}
            <div className="tabs" role="tablist" aria-label="Type de contenu à analyser">
              {availableTabs.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  className={`tab ${tab === t.id ? 'active' : ''}`}
                  onClick={() => switchTab(t.id)}
                >
                  <t.icon size={17} />
                  {t.label}
                </button>
              ))}
            </div>

            <div className="input-area" role="tabpanel">
              {tab === 'text' && (
                <>
                  <textarea
                    className="text-input"
                    placeholder="Collez le texte à vérifier — une publication, un message transféré, une rumeur, toute affirmation qui vous semble douteuse."
                    value={text}
                    onChange={(e) => setText(e.target.value.slice(0, maxTextLength))}
                    rows={9}
                    aria-label="Texte à analyser"
                  />
                  <div className="analyze-counter">
                    {text.length}/{maxTextLength}
                  </div>
                </>
              )}

              {tab === 'url' && (
                <div className="url-input-wrapper">
                  <Link2 size={18} className="url-input-icon" />
                  <input
                    type="url"
                    className="url-input"
                    placeholder="https://exemple.com/article"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && canAnalyze && handleAnalyze()}
                    aria-label="URL à analyser"
                  />
                </div>
              )}

              {isFileTab && !extraction && !extracting && (
                <FileDropzone
                  kind={tab}
                  file={file}
                  onSelect={runExtraction}
                  onReject={(message) => {
                    setError(message);
                    toast.error(message, 'Fichier refusé');
                  }}
                  maxSizeMb={maxUploadMb}
                  disabled={extracting}
                />
              )}

              {isFileTab && extracting && (
                <ExtractionProgress
                  progress={extractProgress.progress}
                  message={extractProgress.message}
                  onCancel={() => {
                    abortRef.current?.abort();
                    resetFileState();
                  }}
                />
              )}

              {isFileTab && extraction && !extracting && (
                <ExtractedText
                  value={extractedValue}
                  onChange={setExtractedValue}
                  meta={{ ...extraction, fileName: file?.name }}
                  warnings={extraction.warnings}
                  onReset={resetFileState}
                  maxLength={maxTextLength}
                />
              )}

              {error && (
                <p className="error-msg" role="alert">
                  <AlertTriangle size={15} />
                  {error}
                </p>
              )}

              <div className="form-actions">
                <button
                  className="btn btn-primary btn-lg"
                  onClick={handleAnalyze}
                  disabled={!canAnalyze}
                >
                  <Search size={18} />
                  {isFileTab && !extraction ? 'Importez un fichier' : 'Analyser'}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {isAnalyzing && (
            <AnalysisProgress key="progress" progress={analysisProgress} step={analysisStep} />
          )}
          {currentAnalysis && !isAnalyzing && (
            <AnalysisResults key="results" data={currentAnalysis} onReset={handleReset} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
