// ZERO EXTERNAL DEPENDENCIES scraper! 100% pure Node.js
const BLOCKED_DOMAINS = ['facebook.com/login', 'twitter.com/i/flow/login'];

function isValidUrl(str) {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch { return false; }
}

function sanitizeText(text) {
  if (!text) return '';
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .trim();
}

async function scrapeUrl(url) {
  console.log('[scraper] Starting scrape for:', url);
  
  if (!isValidUrl(url)) {
    throw new Error('URL invalide. Veuillez fournir une URL HTTP ou HTTPS.');
  }

  if (BLOCKED_DOMAINS.some((d) => url.includes(d))) {
    throw new Error('Cette URL nécessite une authentification et ne peut pas être analysée.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    console.log('[scraper] Fetching URL...');
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Impossible d'accéder à l'URL (code ${response.status})`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      throw new Error('Le contenu n\'est pas une page HTML.');
    }

    console.log('[scraper] Reading and processing HTML...');
    const html = await response.text();
    
    // Extract title
    let title = '';
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      title = sanitizeText(titleMatch[1]);
    }
    
    // Extract text content (super simple)
    const content = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
      .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);

    return {
      title: title || new URL(url).hostname,
      content: content.length > 50 ? content : `Contenu récupéré depuis ${url}`,
      author: '',
      date: '',
      source: new URL(url).hostname,
      url,
    };

  } catch (err) {
    clearTimeout(timeout);
    console.error('[scraper] Error:', err.message);
    if (err.name === 'AbortError') throw new Error('Le délai d\'attente a été dépassé.');
    throw err;
  }
}

export { scrapeUrl, isValidUrl, sanitizeText };
