import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ShieldCheck, LinkIcon, FileSearch, Loader2, Copy, Check, CalendarDays,
} from 'lucide-react';

import { getSharedAnalysis } from '../services/analyses';
import AnalysisResults from '../components/analysis/AnalysisResults';
import { getScoreClassification } from '../utils/helpers';
import './SharedReport.css';

/**
 * Rapport partagé par lien public. Lisible sans compte : la fonction SQL
 * `get_shared_analysis` n'expose que les rapports dont le propriétaire a
 * explicitement activé le partage et qui n'ont pas été modérés.
 */
export default function SharedReport() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'loading', data: null, error: '' });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getSharedAnalysis(slug);
        if (cancelled) return;
        setState(
          data
            ? { status: 'ready', data, error: '' }
            : { status: 'missing', data: null, error: '' }
        );
      } catch (err) {
        if (!cancelled) setState({ status: 'error', data: null, error: err.message });
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers refusé par le navigateur : le lien reste dans la barre d'adresse.
    }
  };

  if (state.status === 'loading') {
    return (
      <div className="shared-page container">
        <div className="shared-loading">
          <Loader2 size={30} className="spinner" />
          <p>Chargement du rapport…</p>
        </div>
      </div>
    );
  }

  if (state.status !== 'ready') {
    return (
      <div className="shared-page container">
        <div className="empty-state">
          <FileSearch size={38} strokeWidth={1.5} />
          <h2>Rapport introuvable</h2>
          <p>
            {state.status === 'error'
              ? state.error
              : 'Ce lien de partage a été désactivé par son auteur, ou le rapport a été retiré par la modération.'}
          </p>
          <Link to="/analyze" className="btn btn-primary">
            Lancer ma propre analyse
          </Link>
        </div>
      </div>
    );
  }

  const { data } = state;
  const score = data.score ?? data.result?.finalScore ?? 0;
  const cls = getScoreClassification(score);

  return (
    <div className="shared-page container">
      <motion.header
        className="shared-header card"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="shared-header-main">
          <span className="badge badge-info"><ShieldCheck size={13} /> Rapport public</span>
          <h1>Analyse partagée</h1>
          <p>
            Ce rapport a été généré par VerifyNet et rendu public par son auteur.
            Il n’a pas été modifié depuis sa création.
          </p>
          <div className="shared-meta">
            <span><CalendarDays size={14} /> {new Date(data.created_at).toLocaleDateString('fr-FR', {
              day: 'numeric', month: 'long', year: 'numeric',
            })}</span>
            {data.file_name && <span><LinkIcon size={14} /> {data.file_name}</span>}
          </div>
        </div>

        <div className="shared-header-side">
          <div className={`shared-score ${cls.class}`}>
            <strong>{score}</strong>
            <span>/100</span>
          </div>
          <p className="shared-verdict">{data.verdict || cls.label}</p>
          <button className="btn btn-secondary btn-sm" onClick={copyLink}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Lien copié' : 'Copier le lien'}
          </button>
        </div>
      </motion.header>

      {data.result ? (
        <AnalysisResults
          data={data.result}
          onReset={() => navigate('/analyze')}
          showSignupHint={false}
        />
      ) : (
        <div className="alert alert-warning">
          <div>Le détail de cette analyse n’est plus disponible.</div>
        </div>
      )}

      <div className="shared-cta card">
        <div>
          <h2>Vérifiez vos propres informations</h2>
          <p>Texte, lien, image ou document : VerifyNet croise les sources et note la fiabilité.</p>
        </div>
        <Link to="/analyze" className="btn btn-primary btn-lg">Analyser gratuitement</Link>
      </div>
    </div>
  );
}
