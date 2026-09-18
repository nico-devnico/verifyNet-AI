import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { LogIn, Wrench, Ban, Crown, LogOut, RefreshCw, Mail } from 'lucide-react';

import useStore from '../../store';
import './StatusScreen.css';

/**
 * Écran plein cadre affiché quand l'application n'est pas utilisable :
 * maintenance activée par le super admin, ou compte suspendu. Les deux états
 * sont également appliqués côté serveur ; cet écran évite simplement que
 * l'utilisateur découvre le blocage au moment de lancer une analyse.
 */
function Shell({ tone, Icon, title, children, actions }) {
  return (
    <div className={`status-screen tone-${tone}`}>
      <motion.div
        className="status-card"
        initial={{ opacity: 0, y: 22, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      >
        <span className="status-icon"><Icon size={30} strokeWidth={1.75} /></span>
        <h1>{title}</h1>
        {children}
        {actions && <div className="status-actions">{actions}</div>}
      </motion.div>
    </div>
  );
}

export function MaintenanceScreen() {
  const { setting, user, signOut, isAdmin } = useStore();

  return (
    <Shell
      tone="warning"
      Icon={Wrench}
      title="Maintenance en cours"
      actions={
        <>
          {!user && (
            <Link to="/login" className="btn btn-primary">
              <LogIn size={16} /> Connexion administrateur
            </Link>
          )}
          {isAdmin() && (
            <Link to="/super-admin" className="btn btn-secondary">
              <Crown size={16} /> Console d’administration
            </Link>
          )}
          {user && !isAdmin() && (
            <button className="btn btn-ghost" onClick={signOut}>
              <LogOut size={16} /> Se déconnecter
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => window.location.reload()}>
            <RefreshCw size={16} /> Réessayer
          </button>
        </>
      }
    >
      <p>{setting('maintenance_message', 'VerifyNet est momentanément indisponible.')}</p>
      <p className="status-note">
        Vos analyses déjà enregistrées ne sont pas affectées et resteront
        accessibles dès la réouverture du service.
      </p>
    </Shell>
  );
}

export function SuspendedScreen() {
  const { profile, signOut } = useStore();

  return (
    <Shell
      tone="danger"
      Icon={Ban}
      title="Compte suspendu"
      actions={
        <>
          <a className="btn btn-primary" href="mailto:support@verifynet.app">
            <Mail size={16} /> Contacter le support
          </a>
          <button className="btn btn-secondary" onClick={signOut}>
            <LogOut size={16} /> Se déconnecter
          </button>
        </>
      }
    >
      <p>
        L’accès à VerifyNet a été suspendu pour ce compte par un administrateur.
      </p>
      {profile?.suspension_reason && (
        <div className="status-reason">
          <strong>Motif communiqué</strong>
          <span>{profile.suspension_reason}</span>
        </div>
      )}
      <p className="status-note">
        Si vous pensez qu’il s’agit d’une erreur, écrivez au support en précisant
        l’adresse email associée à votre compte.
      </p>
    </Shell>
  );
}
