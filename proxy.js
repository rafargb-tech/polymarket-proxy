// proxy.js
const express = require("express");
const fetch = require("node-fetch");
const app = express();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ── /tennis ────────────────────────────────────────────────────────────────
app.get("/tennis", async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const url = "https://gamma-api.polymarket.com/events?active=true&closed=false&limit=100&series_id=10365";
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
      }
    });
    const events = await r.json();

    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const filtered = events.filter(e => {
      const end = e.endDate ? e.endDate.split("T")[0] : null;
      if (!end) return true;
      if (dateFrom && end < dateFrom) return false;
      if (dateTo && end > dateTo) return false;
      return true;
    });

    const matches = filtered.map(e => {
      const vsMatch = (e.title || "").match(/^(.+?)\s+vs\.?\s+(.+?)(?:\s*[\(\?:]|$)/i);
      const p1 = vsMatch ? vsMatch[1].trim() : e.title;
      const p2 = vsMatch ? vsMatch[2].trim() : "";
      let prob1 = 0.5, prob2 = 0.5;
      try {
        // Buscar específicamente el market moneyline
        const markets = e.markets || [];
        const moneyline = markets.find(m =>
          m.sportsMarketType === "moneyline" ||
          m.groupItemThreshold === "0"
        ) || markets[0];
        if (moneyline) {
          const prices = JSON.parse(moneyline.outcomePrices || "[]");
          if (prices.length >= 2) {
            prob1 = parseFloat(prices[0]);
            prob2 = parseFloat(prices[1]);
          }
        }
      } catch {}
      return {
        p1, p2, prob1, prob2,
        tournament: e.title || "",
        date: e.endDate ? e.endDate.split("T")[0] : null,
        volume: e.volume || "0",
        url: `https://polymarket.com/event/${e.slug}`,
        updatedAt: e.updatedAt || null
      };
    });

    // Filtrar partidos ya resueltos (odds extremas)
    const active = matches.filter(m =>
      m.prob1 > 0.01 && m.prob1 < 0.99 &&
      m.prob2 > 0.01 && m.prob2 < 0.99
    );

    active.sort((a, b) => parseFloat(b.volume) - parseFloat(a.volume));
    res.json(active);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── /rankings ──────────────────────────────────────────────────────────────
function slugToName(slug) {
  return slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

app.get("/rankings", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 500;
    const url = `https://www.atptour.com/en/rankings/singles?rankRange=1-${limit}`;
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.atptour.com/",
      }
    });
    const html = await r.text();
    const overviewRegex = /\/en\/players\/([a-z0-9-]+)\/[a-z0-9]+\/overview/g;
    const seen = new Set();
    const rows = [];
    let m;
    while ((m = overviewRegex.exec(html)) !== null) {
      const slug = m[1];
      if (seen.has(slug)) continue;
      seen.add(slug);
      if (slug.includes("${") || slug.includes("getProfile")) continue;
      rows.push({ rank: rows.length + 1, name: slugToName(slug) });
      if (rows.length >= limit) break;
    }
    if (rows.length > 0) return res.json(rows);
    res.status(502).json({ error: "No se pudo parsear", htmlLength: html.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── /rankings-debug ────────────────────────────────────────────────
});
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Proxy en puerto ${PORT}`));
