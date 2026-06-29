const { getJson } = require('serpapi');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');

const RELIABLE_SOURCES = {
  high: [
    'reuters.com',
    'apnews.com',
    'bbc.com',
    'bbc.co.uk',
    'ft.com',
    'aljazeera.com',
    'lemonde.fr',
    'theguardian.com',
    'dw.com',
    'cameroon-tribune.cm',
    'journalducameroun.com',
    'actucameroun.com',
    'cameroon-info.net',
    'crtv.cm',
    'ecomatin.net',
    'africanews.com',
    'jeuneafrique.com',
    'theafricareport.com',
    'allafrica.com',
    'africaintelligence.com',
    'radiookapi.org',
    'gabonreview.com',
    'agi.africa',
  ],
  institutional: [
    'who.int',
    'unesco.org',
    'worldbank.org',
    'imf.org',
    'gouv.fr',
    'gov.uk',
    'whitehouse.gov',
    'us.gov',
    'europa.eu',
    'un.org',
    'prc.cm',
    'spm.gov.cm',
    'minsante.cm',
    'mincom.gov.cm',
    'minebas.gov.cm',
    'minesec.gov.cm',
    'elecam.cm',
  ],
  scientific: [
    'scholar.google.com',
    'nature.com',
    'sciencedirect.com',
    'ieee.org',
    'arxiv.org',
  ],
  factchecking: [
    'snopes.com',
    'politifact.com',
    'factcheck.org',
    'factcheck.afp.com',
    'fullfact.org',
    'africacheck.org',
    'pesacheck.org',
    'dubawa.org',
  ],
  useWithCaution: [
    'reddit.com',
    'wikipedia.org',
  ],
};

// Fallback sources when no API is available
const FALLBACK_SOURCES = [
  { title: 'BBC News', domain: 'bbc.com', url: 'https://www.bbc.com', reliability: 'high' },
  { title: 'Le Monde', domain: 'lemonde.fr', url: 'https://www.lemonde.fr', reliability: 'high' },
  { title: 'Reuters', domain: 'reuters.com', url: 'https://www.reuters.com', reliability: 'high' },
  { title: 'Associated Press', domain: 'apnews.com', url: 'https://apnews.com', reliability: 'high' },
  { title: 'WHO', domain: 'who.int', url: 'https://www.who.int', reliability: 'institutional' },
];

function generateSearchQueries(claim, mainTopic, country) {
  const queries = [];
  
  let searchQuery = claim;
  if (!searchQuery || searchQuery === 'null' || searchQuery.trim() === '') {
    searchQuery = mainTopic;
  }
  
  if (country) {
    queries.push(`${country} ${searchQuery}`);
  } else {
    queries.push(searchQuery);
  }
  
  if (mainTopic) {
    queries.push(`${mainTopic} actualités`);
    queries.push(`${mainTopic} vérification`);
  }
  
  queries.push(`${searchQuery} vérification`);
  queries.push(`${searchQuery} fact check`);
  
  return queries;
}

async function resolveFinalUrl(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response.url;
  } catch (error) {
    console.log(`[WebSearch] URL resolution failed for ${url}, using original:`, error.message);
    return url;
  }
}

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

async function fetchPageContent(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(20000),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    
    return article ? article.textContent.slice(0, 8000) : null;
  } catch (error) {
    console.error(`[WebSearch] Error fetching ${url}:`, error.message);
    return null;
  }
}

// Return fallback sources when API fails
function getFallbackSearchResults() {
  console.log('[WebSearch] Using fallback sources');
  return {
    reliableSources: FALLBACK_SOURCES.slice(0, 3),
    otherSources: FALLBACK_SOURCES.slice(3),
    allSources: FALLBACK_SOURCES,
    circulatingOn: [
      { site: 'facebook.com', type: 'social' },
      { site: 'twitter.com', type: 'social' },
    ],
    firstAppearance: 'Date inconnue (nécessite analyse temporelle approfondie)',
  };
}

async function searchWeb(claim, mainTopic, country) {
  let searchClaim = claim;
  if (!searchClaim || searchClaim === 'null' || searchClaim.trim() === '') {
    searchClaim = mainTopic;
  }
  
  const queries = generateSearchQueries(searchClaim, mainTopic, country);
  const apiKey = process.env.SERPAPI_KEY;
  
  // Check if API key is available
  if (!apiKey || apiKey.trim() === '') {
    console.warn('[WebSearch] No SerpAPI key found, using fallback');
    return getFallbackSearchResults();
  }
  
  let allResults = [];
  
  console.log(`[WebSearch] Performing real search for claim: "${claim}"`);
  
  try {
    for (let qIndex = 0; qIndex < Math.min(queries.length, 2); qIndex++) {
      const query = queries[qIndex];
      
      try {
        const searchResult = await getJson({
          q: query,
          api_key: apiKey,
          num: 10,
          hl: 'fr',
          gl: 'fr',
        });
        
        if (searchResult.organic_results) {
          allResults = allResults.concat(
            searchResult.organic_results.map(result => {
              const domain = new URL(result.link).hostname;
              
              let reliability = 'useWithCaution';
              if (RELIABLE_SOURCES.high.some(s => domain.includes(s))) {
                reliability = 'high';
              } else if (RELIABLE_SOURCES.institutional.some(s => domain.includes(s))) {
                reliability = 'institutional';
              } else if (RELIABLE_SOURCES.scientific.some(s => domain.includes(s))) {
                reliability = 'scientific';
              } else if (RELIABLE_SOURCES.factchecking.some(s => domain.includes(s))) {
                reliability = 'factchecking';
              }
              
              return {
                title: result.title,
                domain,
                url: result.link,
                snippet: result.snippet,
                position: result.position,
                reliability,
                date: result.date || null,
              };
            })
          );
        }
      } catch (searchError) {
        console.error(`[WebSearch] Error searching for "${query}":`, searchError.message);
      }
    }
  } catch (err) {
    console.error('[WebSearch] Search failed completely, using fallback:', err.message);
    return getFallbackSearchResults();
  }
  
  // If no results from API, use fallback
  if (allResults.length === 0) {
    console.warn('[WebSearch] No results from API, using fallback');
    return getFallbackSearchResults();
  }
  
  const seenUrls = new Set();
  const uniqueResults = allResults.filter(result => {
    if (!isValidUrl(result.url)) return false;
    if (seenUrls.has(result.url)) return false;
    seenUrls.add(result.url);
    return true;
  });
  
  const reliableResults = uniqueResults.filter(result => 
    ['high', 'institutional', 'scientific', 'factchecking'].includes(result.reliability)
  ).slice(0, 25);
  
  const otherResults = uniqueResults.filter(result => 
    !reliableResults.some(r => r.url === result.url)
  ).slice(0, 25);
  
  console.log(`[WebSearch] Found ${reliableResults.length} reliable sources and ${otherResults.length} other sources`);
  
  return {
    reliableSources: reliableResults,
    otherSources: otherResults,
    allSources: uniqueResults.slice(0, 50),
    circulatingOn: [
      { site: 'facebook.com', type: 'social' },
      { site: 'twitter.com', type: 'social' },
    ],
    firstAppearance: 'Date inconnue (nécessite analyse temporelle approfondie)',
  };
}

module.exports = { searchWeb, RELIABLE_SOURCES, generateSearchQueries, fetchPageContent, resolveFinalUrl, isValidUrl };
