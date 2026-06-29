const API_BASE = '/api';

// Function to handle analysis with standard JSON response (for Vercel)
const analyzeWithJSON = async (endpoint, data, onProgress) => {
  try {
    console.log('[Analyze API] Starting request to', API_BASE + endpoint);
    
    // Simulate progress for better UX
    if (onProgress) {
      onProgress(5, 'Initialisation...');
      setTimeout(() => onProgress(20, 'Extraction des informations clés...'), 300);
      setTimeout(() => onProgress(40, 'Recherche web approfondie...'), 800);
      setTimeout(() => onProgress(60, 'Analyse critique des sources...'), 1500);
      setTimeout(() => onProgress(80, 'Analyse finale et conclusion...'), 2500);
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[Analyze API] Response error:', response.status, errorData);
      throw new Error(errorData.error || 'Erreur de requête');
    }

    const result = await response.json();
    console.log('[Analyze API] Analysis complete');
    
    if (onProgress) {
      onProgress(100, 'Analyse terminée !');
    }
    
    return result;
  } catch (err) {
    console.error('[Analyze API] Error:', err);
    throw err;
  }
};

export const analyzeText = async (text, onProgress) => {
  return await analyzeWithJSON('/analyze/text', { text }, onProgress);
};

export const analyzeUrl = async (url, onProgress) => {
  return await analyzeWithJSON('/analyze/url', { url }, onProgress);
};

export const healthCheck = async () => {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
};
