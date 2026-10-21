import { Hono } from "hono";
import { Surreal } from "surrealdb";

const app = new Hono();
export const db = new Surreal();

let isConnected = false;

// Resolve connection parameters from SST Resource bindings or environment variables
function getConfig() {
  let url = process.env.SURREALDB_URL || "ws://localhost:8000/rpc";
  let user = process.env.SURREALDB_USER || "root";
  let pass = process.env.SURREALDB_PASS || "root";
  let ns = process.env.SURREALDB_NS || "test";
  let database = process.env.SURREALDB_DB || "test";

  try {
    // Attempt dynamic SST Resource binding if available
    const { Resource } = require("sst/node/config");
    if (Resource?.SurrealDB) {
      url = Resource.SurrealDB.URL || url;
      user = Resource.SurrealDB.USER || user;
      pass = Resource.SurrealDB.PASS || pass;
      ns = Resource.SurrealDB.NS || ns;
      database = Resource.SurrealDB.DB || database;
    }
  } catch (_) {
    // Fallback to environment variables
  }

  return { url, user, pass, ns, database };
}

// Initialize database connection
export async function initDB() {
  if (isConnected) return;
  const cfg = getConfig();
  try {
    await db.connect(cfg.url);
    if (cfg.user && cfg.pass) {
      await db.signin({
        username: cfg.user,
        password: cfg.pass,
      } as any);
    }
    await db.use({ namespace: cfg.ns, database: cfg.database } as any);
    isConnected = true;
    console.log(`[SurrealDB] Successfully connected to ${cfg.url} (NS: ${cfg.ns}, DB: ${cfg.database})`);
  } catch (error) {
    console.warn(`[SurrealDB] Connection pending or failed (${cfg.url}):`, error instanceof Error ? error.message : error);
  }
}

// Attempt initial connection asynchronously
initDB().catch(() => {});

// Health check endpoint
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    database: isConnected ? "connected" : "disconnected",
    timestamp: new Date().toISOString()
  });
});

// Example endpoint to create a user record
app.post("/users", async (c) => {
  try {
    const body = await c.req.json();
    if (!body || typeof body !== "object") {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const user = await db.create("user", body);
    return c.json({ success: true, data: user }, 201);
  } catch (error) {
    return c.json({ error: "Failed to create user", details: String(error) }, 500);
  }
});

// Example endpoint to get all user records
app.get("/users", async (c) => {
  try {
    const users = await db.select("user");
    return c.json({ success: true, data: users });
  } catch (error) {
    return c.json({ error: "Failed to fetch users", details: String(error) }, 500);
  }
});

// Example endpoint to get single user
app.get("/users/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const [user] = await db.select(`user:${id}`);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }
    return c.json({ success: true, data: user });
  } catch (error) {
    return c.json({ error: "Failed to fetch user", details: String(error) }, 500);
  }
});

export default app;