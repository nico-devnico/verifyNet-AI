const API_BASE = '/api';

export const analyzeText = async (text, onProgress) => {
  if (onProgress) {
    onProgress(10, 'Initialisation...');
  }

  try {
    if (onProgress) onProgress(30, 'Analyse en cours...');
    
    const response = await fetch(`${API_BASE}/analyze/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Erreur de requête');
    }

    if (onProgress) onProgress(100, 'Terminé !');
    
    return await response.json();
  } catch (err) {
    console.error('[Analyze API] Error:', err);
    throw err;
  }
};

export const analyzeUrl = async (url, onProgress) => {
  if (onProgress) {
    onProgress(10, 'Initialisation...');
  }

  try {
    if (onProgress) onProgress(30, 'Récupération du contenu...');
    
    const response = await fetch(`${API_BASE}/analyze/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Erreur de requête');
    }

    if (onProgress) onProgress(100, 'Terminé !');
    
    return await response.json();
  } catch (err) {
    console.error('[Analyze API] Error:', err);
    throw err;
  }
};

export const healthCheck = async () => {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
};
