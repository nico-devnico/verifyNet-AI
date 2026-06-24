import { motion } from 'framer-motion';
import { FileText, Search, CheckCircle2, RotateCcw, AlertTriangle, Shield, Globe, Share2, ExternalLink, XCircle, HelpCircle } from 'lucide-react';
import { getScoreClassification, getScoreColor } from '../../utils/helpers';
import './AnalysisResults.css';

const fadeIn = (delay = 0) => ({ initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.5 } });

export default function AnalysisResults({ data, onReset }) {
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
  const recommendations = data.recommendations || [];
  const consultedSources = data.consultedSources || data.consulted_sources || [];
  const firstAppearance = data.firstAppearance || data.first_appearance;
  const circulationPlatforms = data.circulationPlatforms || data.circulation_platforms || [];
  const possibleIntentions = data.possibleIntentions || [];
  const relatedTopics = data.relatedTopics || [];
  const topicSummary = data.topicSummary;
  const classification = getScoreClassification(score);
  const scoreColor = getScoreColor(score);

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

      {/* Nuanced Analysis */}
      <motion.div className="result-section" {...fadeIn(0.15)}>
        <h3><Search size={18} /> Analyse détaillée</h3>
        
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
        <motion.div className="result-section" {...fadeIn(0.2)}>
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

      {/* Source Summary */}
      {sourceComparison.totalSources > 0 && (
        <motion.div className="result-section" {...fadeIn(0.25)}>
          <h3><Shield size={18} /> Résumé des sources</h3>
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

      {/* Reasoning */}
      {reasoning && (
        <motion.div className="result-section" {...fadeIn(0.35)}>
          <h3><Shield size={18} /> Raisonnement</h3>
          <p className="reasoning-text">{reasoning}</p>
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
      <motion.div className="result-actions" {...fadeIn(0.5)}>
        <button className="btn btn-primary btn-lg" onClick={onReset}><RotateCcw size={18} /> Nouvelle analyse</button>
      </motion.div>
    </motion.div>
  );
}
