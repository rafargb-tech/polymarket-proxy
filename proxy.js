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

// Convierte slug a nombre: "carlos-alcaraz" → "Carlos Alcaraz"
function slugToName(slug) {
  return slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ── /rankings ──────────────────────────────────────────────────────────────
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

    // Extraer URLs /en/players/nombre-apellido/id/overview en orden
    // Cada jugador aparece dos veces (overview + rankings-breakdown), tomamos solo overview
    const overviewRegex = /\/en\/players\/([a-z0-9-]+)\/[a-z0-9]+\/overview/g;
    const seen = new Set();
    const rows = [];
    let m;
    while ((m = overviewRegex.exec(html)) !== null) {
      const slug = m[1];
      if (seen.has(slug)) continue;
      seen.add(slug);
      // Excluir slugs de plantillas o variables
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

// ── /rankings-debug ────────────────────────────────────────────────────────
app.get("/rankings-debug", async (req, res) => {
  try {
    const r = await fetch("https://www.atptour.com/en/rankings/singles?rankRange=1-500", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.atptour.com/",
      }
    });
    const html = await r.text();

    const patterns = ["rankingData","__INITIAL_STATE__","playerName","fullName",
      "ranklist","RankList","PlayerName","Alcaraz","ng-init","app-data",
      "api/","/rankings/","rankRange"];
    const jsonPatterns = patterns.map(p => ({
      pattern: p, found: html.includes(p), index: html.indexOf(p)
    }));

    const apiMatches = [...html.matchAll(/["'`](\/[^"'`\s]*(?:api|ranking|player)[^"'`\s]*?)["'`]/gi)]
      .map(m => m[1])
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 40);

    const idx = html.indexOf("Alcaraz");
    const alcarazContext = idx > 0 ? html.substring(idx - 400, idx + 400) : "not found";

    const pnIdx = html.indexOf("PlayerName");
    const playerNameContext = pnIdx > 0 ? html.substring(pnIdx - 200, pnIdx + 500) : "not found";

    // Preview primeros 20 slugs encontrados
    const overviewRegex = /\/en\/players\/([a-z0-9-]+)\/[a-z0-9]+\/overview/g;
    const slugs = [];
    let m;
    while ((m = overviewRegex.exec(html)) !== null && slugs.length < 20) {
      if (!slugs.includes(m[1])) slugs.push(m[1]);
    }

    res.json({ htmlLength: html.length, apiMatches, jsonPatterns, alcarazContext, playerNameContext, slugPreview: slugs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Proxy en puerto ${PORT}`));
