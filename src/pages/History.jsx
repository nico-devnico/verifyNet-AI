import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, Trash2, FileText } from 'lucide-react';
import useStore from '../store';
import { getScoreClassification, formatDate, truncate } from '../utils/helpers';
import './History.css';

export default function History() {
  const { history, removeAnalysis, clearHistory } = useStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const filtered = useMemo(() => {
    let items = history;
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((a) => a.input?.toLowerCase().includes(q));
    }
    if (filter === 'text') items = items.filter((a) => a.type === 'text');
    if (filter === 'url') items = items.filter((a) => a.type === 'url');
    if (filter === 'reliable') items = items.filter((a) => a.score >= 61);
    if (filter === 'doubtful') items = items.filter((a) => a.score < 41);
    return items;
  }, [history, search, filter]);

  return (
    <div className="history-page">
      <div className="container">
        <motion.div className="page-header" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1>Vos analyses</h1>
          <p>{history.length} vérification{history.length !== 1 ? 's' : ''} au compteur</p>
        </motion.div>

        {history.length > 0 && (
          <div className="history-controls">
            <div className="search-box">
              <Search size={16} />
              <input type="search" placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Rechercher dans l'historique" />
            </div>
            <div className="filter-tabs">
              {['all', 'text', 'url', 'reliable', 'doubtful'].map((f) => (
                <button key={f} className={`filter-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                  {f === 'all' ? 'Tout' : f === 'text' ? 'Texte' : f === 'url' ? 'URL' : f === 'reliable' ? 'Fiable' : 'Douteux'}
                </button>
              ))}
            </div>
            <button className="btn btn-ghost" onClick={clearHistory}>Tout effacer</button>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="empty-state">
            <FileText size={44} strokeWidth={1.5} />
            <p>{history.length === 0 ? 'Aucune analyse pour le moment.' : 'Aucun résultat trouvé.'}</p>
          </div>
        ) : (
          <div className="history-list">
            {filtered.map((item, i) => {
              const cls = getScoreClassification(item.score);
              return (
                <motion.div key={item.id} className="history-item card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                  <div className="history-item-left">
                    <span className={`badge ${cls.class}`}>{item.score}/100</span>
                    <div>
                      <p className="history-input">{truncate(item.input, 80)}</p>
                      <span className="history-meta">{formatDate(item.date)} · {item.type === 'text' ? 'Texte' : 'URL'}</span>
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-icon" onClick={() => removeAnalysis(item.id)} aria-label="Supprimer">
                    <Trash2 size={16} />
                  </button>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
