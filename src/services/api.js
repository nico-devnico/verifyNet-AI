const API_BASE = '/api';

// Function to handle SSE analysis
const analyzeWithSSE = async (endpoint, data, onProgress) => {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('[Analyze API] Starting request to', API_BASE + endpoint);
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[Analyze API] Response error:', response.status, errorData);
        reject(new Error(errorData.error || 'Erreur de requête'));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let resolved = false;

      const processChunk = (chunk) => {
        buffer += chunk;
        const events = buffer.split('\n\n');
        buffer = events.pop(); // Keep incomplete event in buffer

        for (const eventStr of events) {
          if (!eventStr.trim()) continue;

          const lines = eventStr.split('\n');
          let eventType = null;
          let dataStr = '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (trimmed.startsWith('event:')) {
              eventType = trimmed.substring('event:'.length).trim();
            } else if (trimmed.startsWith('data:')) {
              dataStr += trimmed.substring('data:'.length).trim();
            }
          }

          if (eventType && dataStr) {
            try {
              const eventData = JSON.parse(dataStr);
              console.log('[Analyze API] Event received:', eventType, eventData);

              if (eventType === 'progress' && onProgress) {
                onProgress(eventData.progress, eventData.step);
              } else if (eventType === 'complete' && !resolved) {
                resolved = true;
                console.log('[Analyze API] Resolving with result');
                resolve(eventData);
                return;
              } else if (eventType === 'error' && !resolved) {
                resolved = true;
                reject(new Error(eventData.error));
                return;
              }
            } catch (e) {
              console.error('[Analyze API] Failed to parse event data:', e, dataStr);
            }
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('[Analyze API] Stream done');
          // Process any remaining buffer
          if (buffer && !resolved) {
            processChunk('');
          }
          break;
        }
        processChunk(decoder.decode(value, { stream: true }));
      }
      
      // If we finished the stream without resolving, reject
      if (!resolved) {
        reject(new Error('La connexion a été fermée avant la fin de l\'analyse'));
      }
    } catch (err) {
      console.error('[Analyze API] Error:', err);
      reject(err);
    }
  });
};

export const analyzeText = async (text, onProgress) => {
  return await analyzeWithSSE('/analyze/text', { text }, onProgress);
};

export const analyzeUrl = async (url, onProgress) => {
  return await analyzeWithSSE('/analyze/url', { url }, onProgress);
};

export const healthCheck = async () => {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
};
