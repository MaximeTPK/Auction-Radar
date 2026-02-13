const https = require('https');
const http = require('http');

// Your 12 auction houses with their public calendar URLs
const HOUSES = [
  { id: 1,  name: "NYE & CO",          url: "https://www.nyeandcompany.com/auctions/upcoming-auctions/" },
  { id: 2,  name: "VOGT AUCTIONS",     url: "https://vogtauction.com/auctions" },
  { id: 3,  name: "ARARITY",           url: "https://www.ararityauctions.com/auctions/" },
  { id: 4,  name: "EVERARD",           url: "https://www.liveauctioneers.com/auctioneer/everard/" },
  { id: 5,  name: "FREEMAN YODER",     url: "https://www.liveauctioneers.com/auctioneer/freeman-yoder/" },
  { id: 6,  name: "PALM BEACH MODERN", url: "https://www.modernauctions.com/" },
  { id: 7,  name: "JULIENS",           url: "https://www.julienslive.com/auctions" },
  { id: 8,  name: "CORAL GABLES",      url: "https://www.liveauctioneers.com/auctioneer/coral-gables-auctions/" },
  { id: 9,  name: "CUTLER BAY",        url: "https://www.liveauctioneers.com/auctioneer/6715/cutler-bay-auctions/" },
  { id: 10, name: "INTERVENDUE",       url: "https://www.liveauctioneers.com/auctioneer/6970/intervendue/" },
  { id: 11, name: "BIDDLE AUCTION",    url: "https://www.liveauctioneers.com/auctioneer/6521/c-biddle-auction-gallery-inc/" },
  { id: 12, name: "HOWARD & THOMAS",   url: "https://www.liveauctioneers.com/auctioneer/howard-thomas/" },
];

function fetchPage(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

// Extract dates from HTML — looks for common date patterns
function extractDates(html, houseId) {
  const sales = [];
  const today = new Date();
  today.setHours(0,0,0,0);

  // Patterns to find dates in HTML
  const patterns = [
    // ISO format: 2026-02-21
    /(\d{4}-\d{2}-\d{2})/g,
    // US format: February 21, 2026 / Feb 21, 2026
    /(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(202[5-9])/gi,
    // Numeric: 02/21/2026
    /(\d{1,2})\/(\d{1,2})\/(202[5-9])/g,
  ];

  const found = new Set();

  // ISO dates
  const isoMatches = html.matchAll(/(\d{4}-\d{2}-\d{2})/g);
  for (const m of isoMatches) {
    const d = new Date(m[1] + 'T12:00:00');
    if (d >= today && d <= new Date(today.getTime() + 90*24*60*60*1000)) {
      found.add(m[1]);
    }
  }

  // Written month dates
  const monthNames = {
    january:'01',february:'02',march:'03',april:'04',may:'05',june:'06',
    july:'07',august:'08',september:'09',october:'10',november:'11',december:'12',
    jan:'01',feb:'02',mar:'03',apr:'04',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'
  };

  const writtenPattern = /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)[,\s]+(\d{1,2})[,\s]+(202[5-9])/gi;
  const writtenMatches = html.matchAll(writtenPattern);
  for (const m of writtenMatches) {
    const month = monthNames[m[1].toLowerCase()];
    const day = m[2].padStart(2,'0');
    const year = m[3];
    if (month) {
      const iso = `${year}-${month}-${day}`;
      const d = new Date(iso + 'T12:00:00');
      if (d >= today && d <= new Date(today.getTime() + 90*24*60*60*1000)) {
        found.add(iso);
      }
    }
  }

  // Deduplicate and build sale objects
  const sorted = Array.from(found).sort();
  sorted.forEach((date, i) => {
    sales.push({
      id: houseId * 1000 + i,
      houseId,
      date,
      title: 'Upcoming Sale',
      url: HOUSES.find(h => h.id === houseId)?.url || '#',
      push: false,
      auto: true
    });
  });

  return sales;
}

// Main scrape function — called by Vercel cron
module.exports = async (req, res) => {
  // Allow GET for testing, POST for cron
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const results = [];
  const errors = [];

  for (const house of HOUSES) {
    try {
      console.log(`Scraping ${house.name}...`);
      const html = await fetchPage(house.url);
      if (html) {
        const sales = extractDates(html, house.id);
        results.push(...sales);
        console.log(`  → Found ${sales.length} dates`);
      } else {
        errors.push(house.name);
      }
    } catch (e) {
      errors.push(house.name);
      console.error(`Error scraping ${house.name}:`, e.message);
    }
  }

  return res.status(200).json({
    success: true,
    scraped_at: new Date().toISOString(),
    sales: results,
    errors: errors.length ? errors : undefined
  });
};
