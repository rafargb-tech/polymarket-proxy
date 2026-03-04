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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Proxy en puerto ${PORT}`));
