import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Scan, BarChart3, Globe2, ShieldCheck, Clock3, Zap, ArrowRight, ChevronDown, Sparkles, FileText, Link2, Search, Fingerprint } from 'lucide-react';
import './Landing.css';

const fadeUp = { hidden: { opacity: 0, y: 30 }, visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.5 } }) };

const features = [
  { Icon: Scan, title: 'Analyse en un clic', desc: 'Un copier-coller, un lien, et vous avez votre verdict. Pas de friction, pas de formulaire interminable.' },
  { Icon: BarChart3, title: 'Score lisible', desc: 'De 0 à 100, avec une classification qui parle à tout le monde — pas besoin d\'être journaliste pour comprendre.' },
  { Icon: Globe2, title: 'Extraction web', desc: 'On va chercher le vrai contenu de l\'article, on nettoie les pubs et le bruit. Que l\'essentiel.' },
  { Icon: ShieldCheck, title: 'Vérification croisée', desc: 'Les affirmations sont comparées à des sources officielles, médias reconnus et bases de fact-checking.' },
  { Icon: Clock3, title: 'Historique & filtres', desc: 'Chaque analyse est sauvegardée. Retrouvez, filtrez, recherchez — votre mémoire contre la désinfo.' },
  { Icon: Zap, title: 'Réponse en 2 secondes', desc: 'Pipeline IA optimisé. Pas d\'attente, pas de loading infini. Vous cliquez, vous savez.' },
];

const stats = [
  { value: '50K+', label: 'Analyses lancées' },
  { value: '98%', label: 'Taux de précision' },
  { value: '~2s', label: 'Temps moyen' },
  { value: '150+', label: 'Sources croisées' },
];

const faqs = [
  { q: 'Comment ça marche concrètement ?', a: "Vous collez un texte ou un lien. Notre IA extrait les affirmations principales, les analyse une par une, les compare à des sources fiables, et vous donne un score avec des explications. Le tout en quelques secondes." },
  { q: 'Est-ce que je peux analyser n\'importe quoi ?', a: "Publications Facebook, messages WhatsApp transférés, articles de blog, captures d'écran transcrites, rumeurs qui circulent… Si c'est du texte, on peut l'analyser. Pour les URLs, on extrait le contenu automatiquement." },
  { q: 'Le score est-il garanti ?', a: "Non, et on ne va pas vous mentir là-dessus. C'est un indicateur solide basé sur plusieurs signaux, mais aucun outil n'est infaillible. Notre job c'est de vous donner les éléments pour que vous jugiez — pas de juger à votre place." },
  { q: 'Qu\'est-ce que vous faites de mes données ?', a: "Rien. Votre historique reste sur votre navigateur. On ne collecte pas vos textes, on ne revend rien. Le chiffrement est actif sur toutes les requêtes." },
  { q: 'C\'est gratuit ?', a: "Oui pour un usage personnel avec un nombre raisonnable d'analyses par jour. On travaille sur un plan pro pour les rédactions et les ONG." },
];

export default function Landing() {
  const [openFaq, setOpenFaq] = useState(null);

  return (
    <div className="landing">
      {/* Hero */}
      <section className="hero">
        <div className="hero-glow" />
        <div className="container hero-inner">
          <motion.div className="hero-content" initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.15 } } }}>
            <motion.div className="hero-badge" variants={fadeUp} custom={0}>
              <span className="badge badge-info"><Sparkles size={14} /> Propulsé par l'IA</span>
            </motion.div>
            <motion.h1 className="hero-title" variants={fadeUp} custom={1}>
              Ne partagez plus<br />sans <span className="gradient-text">vérifier.</span>
            </motion.h1>
            <motion.p className="hero-subtitle" variants={fadeUp} custom={2}>
              Collez un texte ou un lien. VerifyNet analyse, vérifie les sources, et vous dit en 2 secondes si vous pouvez faire confiance — ou pas.
            </motion.p>
            <motion.div className="hero-actions" variants={fadeUp} custom={3}>
              <Link to="/analyze" className="btn btn-primary btn-lg">
                Lancer une analyse
                <ArrowRight size={18} />
              </Link>
              <a href="#features" className="btn btn-ghost btn-lg">Voir comment ça marche</a>
            </motion.div>
            <motion.p className="hero-footnote" variants={fadeUp} custom={4}>
              Gratuit · Aucune inscription requise
            </motion.p>
          </motion.div>
          <motion.div className="hero-visual" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
            <div className="hero-card">
              <div className="hero-card-header">
                <div className="dots">
                  <span /><span /><span />
                </div>
                <span className="hero-card-url">verifynet.app/analyze</span>
              </div>
              <div className="hero-card-body">
                <div className="mock-input">
                  <Link2 size={16} className="mock-input-icon" />
                  <span className="mock-input-text">https://info-doutable.com/urgence-sante</span>
                </div>
                <div className="mock-divider" />
                <div className="mock-result">
                  <div className="mock-score-ring">
                    <svg width="72" height="72" viewBox="0 0 72 72">
                      <circle cx="36" cy="36" r="30" fill="none" stroke="var(--border)" strokeWidth="5" />
                      <circle cx="36" cy="36" r="30" fill="none" stroke="var(--danger)" strokeWidth="5" strokeLinecap="round" strokeDasharray="188.5" strokeDashoffset={188.5 - (188.5 * 28) / 100} transform="rotate(-90 36 36)" />
                    </svg>
                    <span className="mock-score-num">28</span>
                  </div>
                  <div className="mock-verdict">
                    <span className="badge badge-danger">Très douteux</span>
                    <span className="mock-verdict-sub">3 affirmations non vérifiées</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="stats-section">
        <div className="container">
          <div className="stats-grid">
            {stats.map((s, i) => (
              <motion.div key={i} className="stat-item" initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.07, duration: 0.4 }}>
                <span className="stat-value">{s.value}</span>
                <span className="stat-label">{s.label}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="section features-section" id="features">
        <div className="container">
          <div className="section-head">
            <span className="section-tag">Fonctionnalités</span>
            <h2 className="section-title">Tout ce qu'il faut pour ne plus se faire avoir</h2>
            <p className="section-subtitle">Un outil pensé pour aller vite et rester précis, même quand le contenu est complexe.</p>
          </div>
          <div className="features-grid">
            {features.map((f, i) => (
              <motion.div key={i} className="feature-card" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06, duration: 0.45 }}>
                <div className="feature-icon-wrap">
                  <f.Icon size={22} />
                </div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="section how-section">
        <div className="container">
          <div className="section-head">
            <span className="section-tag">Processus</span>
            <h2 className="section-title">Quatre étapes, zéro bullshit</h2>
            <p className="section-subtitle">De l'input brut au rapport complet — voilà ce qui se passe sous le capot.</p>
          </div>
          <div className="steps-grid">
            {[
              { Icon: FileText, title: 'Collez votre contenu', desc: 'Texte copié d\'un message, capture d\'écran transcrite, ou lien direct vers un article.' },
              { Icon: Search, title: 'Extraction intelligente', desc: 'L\'IA isole les affirmations, identifie les sources citées et repère les éléments suspects.' },
              { Icon: Fingerprint, title: 'Fact-checking', desc: 'Chaque affirmation est confrontée aux bases de données de fact-checking et sources officielles.' },
              { Icon: BarChart3, title: 'Rapport détaillé', desc: 'Score de 0 à 100, verdict clair, explications accessibles. Vous savez quoi en penser.' },
            ].map((s, i) => (
              <motion.div key={i} className="step-card" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1, duration: 0.5 }}>
                <div className="step-header">
                  <span className="step-num">0{i + 1}</span>
                  <div className="step-icon-wrap"><s.Icon size={18} /></div>
                </div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section faq-section">
        <div className="container">
          <div className="section-head">
            <span className="section-tag">FAQ</span>
            <h2 className="section-title">Les questions qu'on nous pose souvent</h2>
          </div>
          <div className="faq-list">
            {faqs.map((f, i) => (
              <motion.div key={i} className="faq-item" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.04 }}>
                <button className="faq-question" onClick={() => setOpenFaq(openFaq === i ? null : i)} aria-expanded={openFaq === i}>
                  <span>{f.q}</span>
                  <ChevronDown size={18} className={`faq-chevron ${openFaq === i ? 'rotated' : ''}`} />
                </button>
                {openFaq === i && (
                  <motion.div className="faq-answer" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} transition={{ duration: 0.25 }}>
                    <p>{f.a}</p>
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section cta-section">
        <div className="container cta-inner">
          <h2>Un doute sur une info ?</h2>
          <p>Vérifiez avant de partager. Ça prend 2 secondes.</p>
          <Link to="/analyze" className="btn btn-primary btn-lg">
            Analyser maintenant
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}
