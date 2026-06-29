const API_BASE = '/api';

// Simulate progress steps for better UX
const progressSteps = [
  { progress: 10, step: 'Initialisation...' },
  { progress: 25, step: 'Extraction des informations clés...' },
  { progress: 40, step: 'Recherche web approfondie...' },
  { progress: 55, step: 'Scraping et résumé des sources...' },
  { progress: 70, step: 'Analyse critique des sources...' },
  { progress: 85, step: 'Analyse finale et conclusion nuancée...' },
  { progress: 100, step: 'Rapport complet généré' }
];

const simulateProgress = async (onProgress) => {
  if (!onProgress) return;
  
  for (const step of progressSteps) {
    onProgress(step.progress, step.step);
    await new Promise(resolve => setTimeout(resolve, 600));
  }
};

const analyzeWithoutSSE = async (endpoint, data, onProgress) => {
  try {
    console.log('[Analyze API] Starting request to', API_BASE + endpoint);
    
    // Start progress simulation
    const progressPromise = simulateProgress(onProgress);
    
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
    await progressPromise; // Wait for progress simulation to finish
    
    console.log('[Analyze API] Analysis complete:', result);
    return result;
  } catch (err) {
    console.error('[Analyze API] Error:', err);
    throw err;
  }
};

export const analyzeText = async (text, onProgress) => {
  return await analyzeWithoutSSE('/analyze/text', { text }, onProgress);
};

export const analyzeUrl = async (url, onProgress) => {
  return await analyzeWithoutSSE('/analyze/url', { url }, onProgress);
};

export const healthCheck = async () => {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
};
