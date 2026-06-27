import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Search, CheckCircle2, RotateCcw, AlertTriangle, Shield, Globe, Share2, ExternalLink, XCircle, HelpCircle, Download } from 'lucide-react';
import { getScoreClassification, getScoreColor } from '../../utils/helpers';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import './AnalysisResults.css';

const fadeIn = (delay = 0) => ({ initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.5 } });

const generatePDF = (data) => {
  console.log('📄 Début de la génération du PDF...');
  console.log('Données reçues:', data);
  
  try {
    const doc = new jsPDF();
    const score = data.finalScore ?? data.final_score ?? data.score ?? 0;
    const verdict = data.verdict;
    const claim = data.claim;
    const mainTopic = data.mainTopic;
    const analysis = data.analysis || {};
    const consultedSources = data.consultedSources || data.consulted_sources || [];
    const recommendations = data.recommendations || [];
    const detailedConclusion = data.detailedConclusion;
    const sourceSummary = data.sourceSummary;
    const reasoning = data.reasoning;

    console.log('✅ jsPDF initialisé');

    // En-tête simple
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('VerifyNet - Rapport d\'analyse', 14, 20);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, 14, 30);

    let yPosition = 40;

    // Section Score
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Résultat', 14, yPosition);
    yPosition += 8;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Score: ${score}/100`, 14, yPosition);
    yPosition += 6;
    doc.text(`Verdict: ${verdict || 'Analyse terminée'}`, 14, yPosition);
    yPosition += 10;

    // Affirmation
    if (claim) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Affirmation analysée', 14, yPosition);
      yPosition += 8;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const claimLines = doc.splitTextToSize(claim, 180);
      doc.text(claimLines, 14, yPosition);
      yPosition += (claimLines.length * 6) + 8;
    }

    // Résumé des sources
    if (sourceSummary) {
      if (yPosition > 250) { doc.addPage(); yPosition = 20; }
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Résumé des sources', 14, yPosition);
      yPosition += 8;
      doc.setFontSize(10);
      const summaryLines = doc.splitTextToSize(sourceSummary, 180);
      doc.text(summaryLines, 14, yPosition);
      yPosition += (summaryLines.length * 6) + 8;
    }

    // Raisonnement
    if (reasoning) {
      if (yPosition > 250) { doc.addPage(); yPosition = 20; }
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Raisonnement de l\'IA', 14, yPosition);
      yPosition += 8;
      doc.setFontSize(10);
      const reasoningLines = doc.splitTextToSize(reasoning, 180);
      doc.text(reasoningLines, 14, yPosition);
      yPosition += (reasoningLines.length * 6) + 8;
    }

    // Conclusion
    if (detailedConclusion) {
      if (yPosition > 250) { doc.addPage(); yPosition = 20; }
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Conclusion détaillée', 14, yPosition);
      yPosition += 8;
      doc.setFontSize(10);
      const conclusionLines = doc.splitTextToSize(detailedConclusion, 180);
      doc.text(conclusionLines, 14, yPosition);
      yPosition += (conclusionLines.length * 6) + 8;
    }

    // Sources
    if (consultedSources.length > 0) {
      if (yPosition > 150) { doc.addPage(); yPosition = 20; }
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Sources consultées', 14, yPosition);
      yPosition += 12;
      
      // Afficher les sources avec liens cliquables
      consultedSources.slice(0, 10).forEach((source, index) => {
        if (yPosition > 270) {
          doc.addPage();
          yPosition = 20;
        }
        
        // Titre de la source
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(20, 184, 166); // Couleur primaire
        
        const titleText = source.title?.substring(0, 80) || 'Sans titre';
        doc.text(titleText, 14, yPosition);
        
        // Ajouter le lien cliquable
        if (source.url) {
          try {
            doc.link(14, yPosition - 6, 180, 8, { url: source.url });
          } catch (e) {
            console.log('Could not add link to PDF:', e);
          }
        }
        
        yPosition += 7;
        
        // Domaine et fiabilité
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        
        const metaText = `${source.domain || 'N/A'} - ${source.reliabilityLabel || 'Fiabilité inconnue'}`;
        doc.text(metaText, 14, yPosition);
        yPosition += 6;
        
        // URL complète
        if (source.url) {
          doc.setFontSize(8);
          doc.setTextColor(60, 120, 216); // Bleu pour les liens
          const urlText = source.url.length > 80 ? source.url.substring(0, 80) + '...' : source.url;
          doc.text(urlText, 14, yPosition);
          yPosition += 10;
        } else {
          yPosition += 4;
        }
      });
      
      // Si plus de sources, mentionner
      if (consultedSources.length > 10) {
        if (yPosition > 275) { doc.addPage(); yPosition = 20; }
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text(`... et ${consultedSources.length - 10} autres sources consultées (voir la page web pour la liste complète)`, 14, yPosition);
      }
    }

    console.log('✅ PDF généré avec succès, téléchargement en cours...');
    doc.save(`rapport-verifynet-${Date.now()}.pdf`);
    console.log('✅ PDF téléchargé !');

  } catch (error) {
    console.error('❌ Erreur lors de la génération du PDF:', error);
    alert(`Erreur lors de la génération du PDF: ${error.message}`);
  }
};

export default function AnalysisResults({ data, onReset }) {
  const [pdfError, setPdfError] = useState('');
  const score = data.finalScore ?? data.final_score ?? data.score ?? 0;
  const verdict = data.verdict;
  const summary = data.summary;
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

  const handleDownloadPDF = () => {
    setPdfError('');
    try {
      generatePDF(data);
    } catch (error) {
      console.error('❌ Erreur lors du téléchargement:', error);
      setPdfError(`Erreur: ${error.message}`);
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
        {pdfError && (
          <div className="error-message" style={{ color: 'red', marginBottom: '16px', padding: '12px', borderRadius: '8px', background: 'rgba(255,0,0,0.1)' }}>
            {pdfError}
          </div>
        )}
        <button className="btn btn-secondary btn-lg" onClick={handleDownloadPDF}><Download size={18} /> Télécharger le rapport PDF</button>
        <button className="btn btn-primary btn-lg" onClick={onReset}><RotateCcw size={18} /> Nouvelle analyse</button>
      </motion.div>
    </motion.div>
  );
}
