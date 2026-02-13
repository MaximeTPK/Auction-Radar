const https = require('https');
const http = require('http');

// Your 12 auction houses — primary: LiveAuctioneers, fallback: direct website
const HOUSES = [
  { id: 1,  name: "NYE & CO",          primary: "https://www.liveauctioneers.com/auctioneer/3731/nye-and-company/",                 fallback: "https://www.nyeandcompany.com/auctions/upcoming-auctions/" },
  { id: 2,  name: "VOGT AUCTIONS",     primary: "https://www.liveauctioneers.com/auctioneer/6949/vogt-auction-texas/",              fallback: "https://vogtauction.com/auctions" },
  { id: 3,  name: "ARARITY",           primary: "https://www.liveauctioneers.com/auctioneer/7583/ararity-auctions/",                fallback: "https://www.ararityauctions.com/auctions/" },
  { id: 4,  name: "EVERARD",           primary: "https://www.liveauctioneers.com/auctioneer/4098/everard/",                         fallback: "https://auctions.everard.com/auctions" },
  { id: 5,  name: "FREEMAN YODER",     primary: "https://www.liveauctioneers.com/auctioneer/8025/freeman-yoder/",                   fallback: "https://freemanyoderauctions.com/auctions/" },
  { id: 6,  name: "PALM BEACH MODERN", primary: "https://www.liveauctioneers.com/auctioneer/1045/palm-beach-modern-auctions/",      fallback: "https://www.modernauctions.com/" },
  { id: 7,  name: "JULIENS",           primary: "https://www.liveauctioneers.com/auctioneer/1013/juliens-auctions/",                fallback: "https://www.julienslive.com/auctions" },
  { id: 8,  name: "CORAL GABLES",      primary: "https://www.liveauctioneers.com/auctioneer/6343/coral-gables-auction/",            fallback: "https://www.coral-gables-auction.com/" },
  { id: 9,  name: "CUTLER BAY",        primary: "https://www.liveauctioneers.com/auctioneer/6715/cutler-bay-auctions/",             fallback: null },
  { id: 10, name: "INTERVENDUE",       primary: "https://www.liveauctioneers.com/auctioneer/6970/intervendue/",                     fallback: "https://www.intervendue.com/auction/" },
  { id: 11, name: "BIDDLE AUCTION",    primary: "https://www.liveauctioneers.com/auctioneer/6521/c-biddle-auction-gallery-inc/",    fallback: "https://www.cbiddleauction.com/" },
  { id: 12, name: "HOWARD & THOMAS",   primary: "https://www.liveauctioneers.com/auctioneer/6806/howard-and-thomas-auction-house/", fallback: "https://howardandthomas.com/" },
];

// Fetch a page with browser-like headers, following redirects
function fetchPage(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      timeout: 12000
    }, (res) => {
      // Follow redirects
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return fetchPage(res.headers.location).then(resolve);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ html: data, status: res.statusCode }));
    });
    req.on('error', () => resolve({ html: '', status: 0 }));
    req.on('timeout', () => { req.destroy(); resolve({ html: '', status: 0 }); });
  });
}

// Check if page is a Cloudflare block or empty
function isBlocked(html, status) {
  if (!html || html.length < 200) return true;
  if (status === 403 || status === 429 || status === 503) return true;
  // Cloudflare challenge pages
  if (html.includes('cf-browser-verification') || html.includes('Checking your browser') || html.includes('cf_clearance')) return true;
  if (html.includes('Enable JavaScript and cookies to continue')) return true;
  if (html.includes('Just a moment')) return true;
  return false;
}

// Extract upcoming sale dates from HTML
function extractDates(html, houseId) {
  const sales = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
  const house = HOUSES.find(h => h.id === houseId);
  const found = new Set();

  // 1. ISO format: 2026-02-21
  for (const m of html.matchAll(/(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))/g)) {
    const d = new Date(m[1] + 'T12:00:00');
    if (d >= today && d <= maxDate) found.add(m[1]);
  }

  // 2. Written month: February 21, 2026 / Feb. 21 2026
  const monthMap = {
    january:'01', february:'02', march:'03', april:'04', may:'05', june:'06',
    july:'07', august:'08', september:'09', october:'10', november:'11', december:'12',
    jan:'01', feb:'02', mar:'03', apr:'04', jun:'06', jul:'07', aug:'08',
    sep:'09', oct:'10', nov:'11', dec:'12'
  };
  const writtenRe = /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\.?\s+(\d{1,2}),?\s+(202[5-9])/gi;
  for (const m of html.matchAll(writtenRe)) {
    const month = monthMap[m[1].toLowerCase()];
    if (!month) continue;
    const iso = `${m[3]}-${month}-${m[2].padStart(2,'0')}`;
    const d = new Date(iso + 'T12:00:00');
    if (d >= today && d <= maxDate) found.add(iso);
  }

  // 3. US numeric: 02/21/2026
  for (const m of html.matchAll(/\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(202[5-9])\b/g)) {
    const iso = `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
    const d = new Date(iso + 'T12:00:00');
    if (d >= today && d <= maxDate) found.add(iso);
  }

  // Build sale objects — deduplicated and sorted
  Array.from(found).sort().forEach((date, i) => {
    sales.push({
      id: houseId * 1000 + i,
      houseId,
      date,
      title: 'Upcoming Sale',
      url: house?.primary || '#',
      auto: true
    });
  });

  return sales;
}

// Main handler — called by Vercel cron or manual Sync
module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const results = [];
  const errors = [];
  const log = [];

  for (const house of HOUSES) {
    try {
      // Try LiveAuctioneers first
      let { html, status } = await fetchPage(house.primary);
      let source = 'LiveAuctioneers';

      if (isBlocked(html, status)) {
        // Fallback to direct site
        if (house.fallback) {
          const fb = await fetchPage(house.fallback);
          html = fb.html;
          status = fb.status;
          source = 'direct site';
        }
      }

      if (isBlocked(html, status)) {
        errors.push(house.name);
        log.push(`${house.name}: blocked on both sources (status ${status})`);
        continue;
      }

      const sales = extractDates(html, house.id);
      results.push(...sales);
      log.push(`${house.name}: ${sales.length} dates found via ${source}`);

    } catch (e) {
      errors.push(house.name);
      log.push(`${house.name}: error — ${e.message}`);
    }
  }

  return res.status(200).json({
    success: true,
    scraped_at: new Date().toISOString(),
    total: results.length,
    sales: results,
    errors: errors.length ? errors : undefined,
    log // visible in Vercel logs for debugging
  });
};
