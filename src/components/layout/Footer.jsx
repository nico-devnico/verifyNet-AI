import { Link } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="footer" role="contentinfo">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Link to="/" className="footer-logo">
              <CheckCircle size={24} className="footer-logo-icon" />
              <span>VerifyNet</span>
            </Link>
            <p className="footer-desc">Plateforme intelligente de détection de fake news propulsée par l'IA.</p>
          </div>
          <div className="footer-col">
            <h4>Produit</h4>
            <Link to="/analyze">Analyser</Link>
            <Link to="/history">Historique</Link>
            <Link to="/dashboard">Dashboard</Link>
          </div>
          <div className="footer-col">
            <h4>Ressources</h4>
            <Link to="/about">À propos</Link>
            <Link to="/settings">Paramètres</Link>
          </div>
          <div className="footer-col">
            <h4>Légal</h4>
            <span>Confidentialité</span>
            <span>Conditions</span>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} VerifyNet. Tous droits réservés.</p>
        </div>
      </div>
    </footer>
  );
}
