export const getScoreClassification = (score) => {
  if (score >= 81) return { label: 'Très crédible', color: 'success', class: 'badge-success' };
  if (score >= 61) return { label: 'Crédible', color: 'success', class: 'badge-success' };
  if (score >= 41) return { label: 'À vérifier', color: 'warning', class: 'badge-warning' };
  if (score >= 21) return { label: 'Très douteux', color: 'danger', class: 'badge-danger' };
  return { label: 'Fake News probable', color: 'danger', class: 'badge-danger' };
};

export const getScoreColor = (score) => {
  if (score >= 61) return 'var(--success)';
  if (score >= 41) return 'var(--warning)';
  return 'var(--danger)';
};

export const formatDate = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const truncate = (str, len = 100) => {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
};

export const sanitizeInput = (input) => {
  return input.replace(/<[^>]*>/g, '').trim();
};

export const isValidUrl = (str) => {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch { return false; }
};
