import express from "express";
import { config } from "./config";
import { initDb } from "./db";
import { agentRoutes } from "./routes/agents";
import { productRoutes } from "./routes/products";
import { jobRoutes } from "./routes/jobs";
import { activityRoutes } from "./routes/activity";
import { leaderboardRoutes } from "./routes/leaderboard";
import { adminRoutes } from "./routes/admin";

const app = express();

// CORS — allow frontend origins
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, X-Admin-Key");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// Routes
app.use("/agents", agentRoutes);
app.use("/products", productRoutes);
app.use("/jobs", jobRoutes);
app.use("/activity", activityRoutes);
app.use("/leaderboard", leaderboardRoutes);
app.use("/admin", adminRoutes);

// Initialize database and start server
initDb();

app.listen(config.port, () => {
  console.log(`ClawMarket API listening on port ${config.port}`);
  console.log(`Solana RPC: ${config.rpcUrl}`);
});

export default app;
