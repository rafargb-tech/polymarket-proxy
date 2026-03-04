// proxy.js
// npm install express cors node-fetch@2
// node proxy.js

const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors({
  origin: "*",
  methods: ["GET", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));


app.get("/tennis", async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;

    // ATP series_id=10365, WTA series_id a explorar luego
    const url = "https://gamma-api.polymarket.com/events?active=true&closed=false&limit=100&series_id=10365";
    console.log("Fetching:", url);
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const events = await r.json();
    console.log(`Total eventos: ${events.length}`);

    // Filtrar por fechas
    const filtered = events.filter(e => {
      const end = e.endDate ? e.endDate.split("T")[0] : null;
      if (!end) return true;
      if (dateFrom && end < dateFrom) return false;
      if (dateTo && end > dateTo) return false;
      return true;
    });
    console.log(`Filtrados por fecha (${dateFrom} - ${dateTo}): ${filtered.length}`);

    const matches = filtered.map(e => {
      const vsMatch = (e.title || "").match(/^(.+?)\s+vs\.?\s+(.+?)(?:\s*[\(\?:]|$)/i);
      const p1 = vsMatch ? vsMatch[1].trim() : e.title;
      const p2 = vsMatch ? vsMatch[2].trim() : "";

      let prob1 = 0.5, prob2 = 0.5;
      try {
        const market = e.markets?.[0];
        if (market) {
          const outcomes = JSON.parse(market.outcomes || "[]");
          const prices = JSON.parse(market.outcomePrices || "[]");
          // El primer outcome puede ser el nombre del jugador o "Yes"
          // Si hay exactamente 2, asignamos prob1 al ganador favorito
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
        url: `https://polymarket.com/event/${e.slug}`
      };
    });

    res.json(matches);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(3001, () => console.log("✅ Proxy en http://localhost:3001"));
