import cheerio from 'cheerio';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

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
  if (!isValidUrl(url)) {
    throw new Error('URL invalide. Veuillez fournir une URL HTTP ou HTTPS.');
  }

  if (BLOCKED_DOMAINS.some((d) => url.includes(d))) {
    throw new Error('Cette URL nécessite une authentification et ne peut pas être analysée.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
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

    const html = await response.text();

    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (article && article.textContent && article.textContent.trim().length > 50) {
      return {
        title: sanitizeText(article.title || ''),
        content: sanitizeText(article.textContent),
        author: sanitizeText(article.byline || ''),
        date: article.publishedTime || '',
        source: new URL(url).hostname,
        url,
      };
    }

    const $ = cheerio.load(html);

    $('script, style, nav, header, footer, aside, .ad, .ads, .advertisement, .sidebar, .menu, .nav, .cookie, .popup, iframe, noscript').remove();

    const title = $('h1').first().text() || $('title').text() || '';
    const content = $('article').text() || $('main').text() || $('.post-content').text() || $('.article-body').text() || $('body').text() || '';
    const author = $('[rel="author"]').text() || $('.author').text() || $('[itemprop="author"]').text() || '';
    const date = $('time').attr('datetime') || $('[itemprop="datePublished"]').attr('content') || '';

    const cleanContent = sanitizeText(content);

    if (cleanContent.length < 50) {
      throw new Error('Impossible d\'extraire un contenu suffisant de cette page.');
    }

    return {
      title: sanitizeText(title),
      content: cleanContent.slice(0, 8000),
      author: sanitizeText(author),
      date,
      source: new URL(url).hostname,
      url,
    };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Le délai d\'attente a été dépassé.');
    throw err;
  }
}

export { scrapeUrl, isValidUrl, sanitizeText };
