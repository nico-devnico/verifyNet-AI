import { motion } from 'framer-motion';
import { Target, Lock, Accessibility, Zap } from 'lucide-react';
import './About.css';

const values = [
  { Icon: Target, title: 'Précision', desc: 'Des analyses rigoureuses basées sur des sources fiables et vérifiables.' },
  { Icon: Lock, title: 'Confidentialité', desc: 'Vos données restent sur votre appareil. On ne collecte rien.' },
  { Icon: Accessibility, title: 'Accessibilité', desc: 'Utilisable par tous, y compris au clavier et au lecteur d\'écran.' },
  { Icon: Zap, title: 'Rapidité', desc: 'Résultats en 2 secondes. Pas de friction, pas d\'attente.' },
];

export default function About() {
  return (
    <div className="about-page">
      <div className="container container-sm">
        <motion.div className="page-header" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1>À propos de VerifyNet</h1>
          <p>Combattre la désinformation, une vérification à la fois.</p>
        </motion.div>

        <motion.div className="about-content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <section className="about-section">
            <h2>Pourquoi on existe</h2>
            <p>On a tous déjà partagé un article sans le lire, ou transféré un message WhatsApp qui s'est avéré faux. La désinformation se propage plus vite que la vérité — et les outils pour la contrer restent trop lents ou trop techniques. VerifyNet, c'est notre tentative de changer ça.</p>
          </section>

          <section className="about-section">
            <h2>Comment ça marche sous le capot</h2>
            <p>Quand vous lancez une analyse, voilà ce qui se passe :</p>
            <ul className="about-list">
              <li><strong>Extraction.</strong> On isole chaque affirmation du texte ou de l'article.</li>
              <li><strong>Analyse.</strong> L'IA détecte les incohérences, le langage manipulateur, les affirmations extraordinaires sans preuve.</li>
              <li><strong>Fact-checking.</strong> On confronte les affirmations à des sources officielles et des bases de fact-checking reconnues.</li>
              <li><strong>Scoring.</strong> Un score de 0 à 100 avec des explications claires. Pas de jugement binaire.</li>
            </ul>
          </section>

          <section className="about-section">
            <h2>La stack technique</h2>
            <p>Frontend React avec Vite pour la vitesse. Backend Node.js/Express pour le scraping et l'orchestration. L'IA tourne sur Groq avec des modèles open-source performants. Pas de tracking, pas de cookies tiers, pas de monétisation de vos données.</p>
          </section>

          <section className="about-section">
            <h2>Ce en quoi on croit</h2>
            <div className="values-grid">
              {values.map((v, i) => (
                <div key={i} className="value-card">
                  <div className="value-icon"><v.Icon size={20} /></div>
                  <h4>{v.title}</h4>
                  <p>{v.desc}</p>
                </div>
              ))}
            </div>
          </section>
        </motion.div>
      </div>
    </div>
  );
}
