// proxy.js
const express = require("express");
const fetch = require("node-fetch");
const app = express();

// CORS manual — acepta cualquier origen
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ── /tennis — partidos Polymarket ──────────────────────────────────────────
app.get("/tennis", async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const url = "https://gamma-api.polymarket.com/events?active=true&closed=false&limit=100&series_id=10365";
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const events = await r.json();
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
        const prices = JSON.parse(e.markets?.[0]?.outcomePrices || "[]");
        if (prices.length >= 2) { prob1 = parseFloat(prices[0]); prob2 = parseFloat(prices[1]); }
      } catch {}
      return {
        p1, p2, prob1, prob2,
        tournament: e.title || "",
        date: e.endDate ? e.endDate.split("T")[0] : null,
        volume: e.volume || "0",
        url: `https://polymarket.com/event/${e.slug}`
      };
    }).sort((a, b) => parseFloat(b.volume) - parseFloat(a.volume));
    res.json(matches);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── /rankings — ranking ATP completo desde atptour.com ────────────────────
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

    // La ATP carga los rankings en una tabla con data-rank, data-player
    // Parseamos con regex el JSON embebido en el HTML
    const jsonMatch = html.match(/var rankingData\s*=\s*(\[[\s\S]*?\]);/) ||
                      html.match(/"rankingData"\s*:\s*(\[[\s\S]*?\])[,}]/) ||
                      html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/);

    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[1]);
      const rankings = (Array.isArray(data) ? data : Object.values(data).find(Array.isArray) || [])
        .map(p => ({
          rank: p.rank || p.Rank || p.ranking,
          name: p.player?.fullName || p.playerName || p.name || p.fullName || "",
        }))
        .filter(p => p.rank && p.name);
      return res.json(rankings);
    }

    // Fallback: parsear la tabla HTML directamente
    const rows = [];
    const rowRegex = /<tr[^>]*class="[^"]*ranking-item[^"]*"[\s\S]*?<\/tr>/gi;
    const rankRegex = /data-rank="(\d+)"/;
    const nameRegex = /class="[^"]*player-cell[^"]*"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/;

    let match;
    while ((match = rowRegex.exec(html)) !== null) {
      const row = match[0];
      const rankM = row.match(rankRegex);
      const nameM = row.match(nameRegex);
      if (rankM && nameM) {
        rows.push({ rank: parseInt(rankM[1]), name: nameM[1].trim() });
      }
    }

    if (rows.length > 0) return res.json(rows);

    // Si todo falla, devolver error descriptivo
    res.status(502).json({ error: "No se pudo parsear el ranking de ATP", htmlLength: html.length });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => consol
