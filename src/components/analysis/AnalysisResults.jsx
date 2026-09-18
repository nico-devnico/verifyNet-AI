import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FileText, Search, CheckCircle2, RotateCcw, AlertTriangle, Shield, Globe, Share2, ExternalLink, XCircle, HelpCircle, Download, Loader2, Info } from 'lucide-react';
import { getScoreClassification, getScoreColor } from '../../utils/helpers';
import { toast } from '../../store/toast';
import useStore from '../../store';
import './AnalysisResults.css';

const fadeIn = (delay = 0) => ({ initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.5 } });

/* -------------------------------------------------------------------------- */
/* Export PDF                                                                  */
/* -------------------------------------------------------------------------- */

const PDF = {
  margin: 14,
  width: 182,          // A4 (210 mm) moins les deux marges
  bottom: 275,         // au-delà, on passe à la page suivante
  top: 20,
};

/**
 * Rédige le rapport dans un PDF et le télécharge.
 *
 * jspdf pèse près de 400 Ko : on ne le charge qu'au clic, pour ne pas
 * l'imposer aux utilisateurs qui consultent le résultat à l'écran.
 */
async function generatePDF(data) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();

  const score = data.finalScore ?? data.final_score ?? data.score ?? 0;
  const consultedSources = data.consultedSources || data.consulted_sources || [];

  let y = PDF.top;

  /* Réserve `needed` millimètres, en ouvrant une page si nécessaire. */
  const reserve = (needed) => {
    if (y + needed > PDF.bottom) {
      doc.addPage();
      y = PDF.top;
    }
  };

  const heading = (label) => {
    reserve(16);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(label, PDF.margin, y);
    y += 7;
  };

  /* Écrit un paragraphe en le coupant page par page si besoin. */
  const paragraph = (text, { size = 10, lineHeight = 5 } = {}) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', 'normal');
    for (const line of doc.splitTextToSize(String(text), PDF.width)) {
      reserve(lineHeight);
      doc.text(line, PDF.margin, y);
      y += lineHeight;
    }
    y += 5;
  };

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('VerifyNet — Rapport d\'analyse', PDF.margin, y);
  y += 8;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`,
    PDF.margin, y
  );
  y += 12;

  heading('Résultat');
  paragraph(
    `Score de fiabilité : ${score}/100\nVerdict : ${data.verdict || 'Analyse terminée'}`,
    { size: 11, lineHeight: 6 }
  );

  if (data.claim) {
    heading('Affirmation analysée');
    paragraph(data.claim);
  }
  if (data.sourceSummary) {
    heading('Résumé des sources');
    paragraph(data.sourceSummary);
  }
  if (data.reasoning) {
    heading('Raisonnement de l\'IA');
    paragraph(data.reasoning);
  }
  if (data.detailedConclusion) {
    heading('Conclusion détaillée');
    paragraph(data.detailedConclusion);
  }

  if (consultedSources.length > 0) {
    heading(`Sources consultées (${consultedSources.length})`);

    consultedSources.slice(0, 25).forEach((source, index) => {
      reserve(18);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      const title = source.title || source.domain || 'Sans titre';
      const titleLines = doc.splitTextToSize(`${index + 1}. ${title}`, PDF.width);
      doc.text(titleLines, PDF.margin, y);

      // La zone cliquable couvre le titre entier, pas seulement sa première ligne.
      if (source.url) {
        doc.link(PDF.margin, y - 4, PDF.width, titleLines.length * 5, { url: source.url });
      }
      y += titleLines.length * 5;

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `${source.domain || 'domaine inconnu'} — ${source.reliabilityLabel || 'fiabilité inconnue'}`,
        PDF.margin, y
      );
      y += 4;

      if (source.url) {
        const url = source.url.length > 110 ? `${source.url.slice(0, 110)}…` : source.url;
        doc.text(url, PDF.margin, y);
        y += 4;
      }
      y += 3;
    });

    if (consultedSources.length > 25) {
      reserve(8);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.text(
        `… et ${consultedSources.length - 25} autres sources, consultables dans l'application.`,
        PDF.margin, y
      );
    }
  }

  // Pagination : ajoutée en dernier, quand le nombre total est enfin connu.
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`${page} / ${pageCount}`, 196, 289, { align: 'right' });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`rapport-verifynet-${stamp}.pdf`);
}

/*
 * `showSignupHint` : la page de rapport partagé porte déjà son propre appel à
 * l'inscription, et le texte « conservée dans ce navigateur » y serait faux.
 */
export default function AnalysisResults({ data, onReset, showSignupHint = true }) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const score = data.finalScore ?? data.final_score ?? data.score ?? 0;
  const verdict = data.verdict;
  const claim = data.claim;
  const mainTopic = data.mainTopic;
  const country = data.country;
  const analysis = data.analysis || {};
  const sourceComparison = data.sourceComparison || data.source_summary || {};
  const sourceDisagreements = data.sourceDisagreements || data.sourceDisagreements || [];
  const reasoning = data.reasoning;
  const detailedConclusion = data.detailedConclusion;
  const sourceSummary = data.sourceSummary;
  const recommendations = data.recommendations || [];
  const consultedSources = data.consultedSources || data.consulted_sources || [];
  const firstAppearance = data.firstAppearance || data.first_appearance;
  const circulationPlatforms = data.circulationPlatforms || data.circulation_platforms || [];
  const possibleIntentions = data.possibleIntentions || [];
  const relatedTopics = data.relatedTopics || [];
  const topicSummary = data.topicSummary;
  const classification = getScoreClassification(score);
  const scoreColor = getScoreColor(score);

  const { user } = useStore(); // Add this to get the user from store

  const handleDownloadPDF = async () => {
    setPdfBusy(true);
    try {
      await generatePDF(data);
      toast.success('Rapport PDF téléchargé.');
    } catch (error) {
      toast.error(`Le PDF n'a pas pu être généré : ${error.message}`);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <motion.div className="analysis-results" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Score Hero */}
      <motion.div className="result-hero" {...fadeIn(0)}>
        <div className="score-gauge">
          <svg viewBox="0 0 180 180" preserveAspectRatio="xMidYMid meet">
            <circle cx="90" cy="90" r="78" fill="none" stroke="var(--border)" strokeWidth="10" />
            <motion.circle
              cx="90" cy="90" r="78" fill="none" stroke={scoreColor} strokeWidth="10"
              strokeLinecap="round" strokeDasharray={490}
              initial={{ strokeDashoffset: 490 }}
              animate={{ strokeDashoffset: 490 - (490 * score) / 100 }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
              transform="rotate(-90 90 90)"
            />
          </svg>
          <div className="score-value">
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} style={{ color: scoreColor }}>
              {score}
            </motion.span>
            <small>/100</small>
          </div>
        </div>
        <span className={`badge ${classification.class} badge-lg`}>{verdict || classification.label}</span>
        {topicSummary && <p className="result-summary">{topicSummary}</p>}
      </motion.div>

      {/* Claim Analyzed */}
      {claim && (
        <motion.div className="result-section" {...fadeIn(0.1)}>
          <h3><FileText size={18} /> Affirmation analysée</h3>
          <div className="claim-card card">
            <p className="claim-text">"{claim}"</p>
            <div className="claim-meta">
              {mainTopic && <span className="badge badge-secondary">{mainTopic}</span>}
              {country && <span className="badge badge-secondary">{country}</span>}
            </div>
            {possibleIntentions.length > 0 && (
              <div className="intentions-list">
                <span className="propagation-label">Intentions possibles :</span>
                <div className="sites-list">
                  {possibleIntentions.map((intent, idx) => (
                    <span key={idx} className="badge badge-warning">{intent}</span>
                  ))}
                </div>
              </div>
            )}
            {relatedTopics.length > 0 && (
              <div className="topics-list">
                <span className="propagation-label">Sujets connexes :</span>
                <div className="sites-list">
                  {relatedTopics.map((topic, idx) => (
                    <span key={idx} className="badge badge-secondary">{topic}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Résumé des sources scrapées */}
      {sourceSummary && (
        <motion.div className="result-section" {...fadeIn(0.15)}>
          <h3><FileText size={18} /> Résumé des sources</h3>
          <div className="source-summary-text card">
            <p>{sourceSummary}</p>
          </div>
        </motion.div>
      )}

      {/* Raisonnement de l'IA */}
      {reasoning && (
        <motion.div className="result-section" {...fadeIn(0.2)}>
          <h3><Search size={18} /> Raisonnement de l'IA</h3>
          <div className="reasoning-card card">
            <p>{reasoning}</p>
          </div>
        </motion.div>
      )}

      {/* Nuanced Analysis */}
      <motion.div className="result-section" {...fadeIn(0.25)}>
        <h3><Shield size={18} /> Analyse détaillée</h3>
        
        {analysis.verifiedFacts?.length > 0 && (
          <div className="analysis-block analysis-positive">
            <h4><CheckCircle2 size={16} /> Faits vérifiés</h4>
            <ul>
              {analysis.verifiedFacts.map((fact, idx) => <li key={idx}>{fact}</li>)}
            </ul>
          </div>
        )}
        
        {analysis.doubtfulPoints?.length > 0 && (
          <div className="analysis-block analysis-warning">
            <h4><HelpCircle size={16} /> Points douteux</h4>
            <ul>
              {analysis.doubtfulPoints.map((point, idx) => <li key={idx}>{point}</li>)}
            </ul>
          </div>
        )}
        
        {analysis.falseClaims?.length > 0 && (
          <div className="analysis-block analysis-negative">
            <h4><XCircle size={16} /> Affirmations contredites</h4>
            <ul>
              {analysis.falseClaims.map((fc, idx) => <li key={idx}>{fc}</li>)}
            </ul>
          </div>
        )}
        
        {analysis.missingContext && (
          <div className="analysis-block">
            <h4>Contexte manquant</h4>
            <p>{analysis.missingContext}</p>
          </div>
        )}
      </motion.div>

      {/* Source Disagreements */}
      {sourceDisagreements.length > 0 && (
        <motion.div className="result-section" {...fadeIn(0.3)}>
          <h3><AlertTriangle size={18} /> Désaccords entre sources</h3>
          <div className="disagreements-list">
            {sourceDisagreements.map((disagreement, idx) => (
              <div key={idx} className="disagreement-card card">
                <h4>{disagreement.point}</h4>
                {disagreement.reliableSourcesConfirm?.length > 0 && (
                  <div className="disagreement-column confirm">
                    <span className="disagreement-label">Sources qui confirment :</span>
                    <div className="sources-mini-list">
                      {disagreement.reliableSourcesConfirm.map((s, i) => (
                        <span key={i} className="badge badge-success">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
                {disagreement.reliableSourcesDeny?.length > 0 && (
                  <div className="disagreement-column deny">
                    <span className="disagreement-label">Sources qui infirment :</span>
                    <div className="sources-mini-list">
                      {disagreement.reliableSourcesDeny.map((s, i) => (
                        <span key={i} className="badge badge-danger">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
                {disagreement.explanation && <p className="disagreement-explanation">{disagreement.explanation}</p>}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Statistiques des sources */}
      {sourceComparison.totalSources > 0 && (
        <motion.div className="result-section" {...fadeIn(0.35)}>
          <h3><Globe size={18} /> Statistiques des sources</h3>
          <div className="source-summary-grid">
            <div className="source-summary-item"><strong>{sourceComparison.totalSources}</strong><span>sources consultées</span></div>
            {sourceComparison.confirmingHighReliability > 0 && <div className="source-summary-item positive"><strong>{sourceComparison.confirmingHighReliability}</strong><span>confirment</span></div>}
            {sourceComparison.denyingHighReliability > 0 && <div className="source-summary-item negative"><strong>{sourceComparison.denyingHighReliability}</strong><span>infirment</span></div>}
            {sourceComparison.neutralHighReliability > 0 && <div className="source-summary-item neutral"><strong>{sourceComparison.neutralHighReliability}</strong><span>neutres</span></div>}
            {sourceComparison.otherSources > 0 && <div className="source-summary-item"><strong>{sourceComparison.otherSources}</strong><span>autres sources</span></div>}
          </div>
        </motion.div>
      )}

      {/* Consulted Sources */}
      {consultedSources.length > 0 && (
        <motion.div className="result-section" {...fadeIn(0.3)}>
          <h3><Globe size={18} /> Sources consultées ({consultedSources.length})</h3>
          <div className="consulted-sources-list">
            {consultedSources.map((source, idx) => (
              <a key={idx} href={source.url} target="_blank" rel="noopener noreferrer" className={`source-item card ${source.stance} ${source.reliabilityTier}`}>
                <div className="source-item-header">
                  <div>
                    <h4>{source.title}</h4>
                    <span className="source-domain">{source.domain}</span>
                  </div>
                  <ExternalLink size={16} />
                </div>
                <div className="source-badges">
                  <span className={`badge ${
                    source.reliabilityTier === 'high' ? 'badge-success' :
                    source.reliabilityTier === 'institutional' ? 'badge-info' :
                    source.reliabilityTier === 'scientific' ? 'badge-accent' :
                    source.reliabilityTier === 'factchecking' ? 'badge-success' :
                    'badge-warning'
                  }`}>{source.reliabilityLabel}</span>
                  {source.stance && <span className={`badge ${
                    source.stance === 'confirme' ? 'badge-success' :
                    source.stance === 'infirme' ? 'badge-danger' :
                    'badge-secondary'
                  }`}>{source.stance}</span>}
                  {source.credibilityScore !== undefined && <span className="badge badge-secondary">Fiabilité : {source.credibilityScore}/100</span>}
                </div>
                {source.justification && (
                  <div className="source-justification">
                    <p>{source.justification}</p>
                  </div>
                )}
              </a>
            ))}
          </div>
        </motion.div>
      )}

      {/* Detailed Conclusion */}
      {detailedConclusion && (
        <motion.div className="result-section" {...fadeIn(0.35)}>
          <h3><FileText size={18} /> Conclusion détaillée</h3>
          <div className="detailed-conclusion card">
            <p>{detailedConclusion}</p>
          </div>
        </motion.div>
      )}



      {/* Circulation Info */}
      {circulationPlatforms.length > 0 && (
        <motion.div className="result-section" {...fadeIn(0.4)}>
          <h3><Share2 size={18} /> Circulation</h3>
          <div className="propagation-card card">
            <div className="propagation-sites">
              <span className="propagation-label">Plateformes :</span>
              <div className="sites-list">
                {circulationPlatforms.map((platform, idx) => (
                  <span key={idx} className="badge badge-secondary">{platform}</span>
                ))}
              </div>
            </div>
            {firstAppearance && (
              <div className="first-appearance">
                <span className="propagation-label">Première apparition :</span>
                <span>{firstAppearance}</span>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <motion.div className="result-section" {...fadeIn(0.45)}>
          <h3><CheckCircle2 size={18} /> Recommandations</h3>
          <ul className="recommendations-list">
            {recommendations.map((rec, idx) => <li key={idx}>{rec}</li>)}
          </ul>
        </motion.div>
      )}

      {/* Actions */}
      <motion.div className="result-actions" {...fadeIn(0.55)}>
        <button
          className="btn btn-secondary btn-lg"
          onClick={handleDownloadPDF}
          disabled={pdfBusy}
        >
          {pdfBusy
            ? <><Loader2 size={18} className="spinner" /> Préparation du PDF…</>
            : <><Download size={18} /> Télécharger le rapport PDF</>}
        </button>
        <button className="btn btn-primary btn-lg" onClick={onReset}><RotateCcw size={18} /> Nouvelle analyse</button>
      </motion.div>

      {!user && showSignupHint && (
        <motion.p className="result-signup-hint" {...fadeIn(0.6)}>
          <Info size={15} />
          <span>
            Cette analyse n'est conservée que dans ce navigateur.{' '}
            <Link to="/signup">Créez un compte</Link> pour l'archiver, la
            retrouver depuis n'importe quel appareil et la partager par lien.
          </span>
        </motion.p>
      )}
    </motion.div>
  );
}
