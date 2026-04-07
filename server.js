const http = require("http");
const https = require("https");

const PORT = process.env.PORT || 3000;
const PROXY_SECRET = process.env.PROXY_SECRET;

if (!PROXY_SECRET) {
  console.error("FATAL: PROXY_SECRET environment variable is not set.");
  process.exit(1);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error("Invalid JSON body")); }
    });
    req.on("error", reject);
  });
}

function fetchCompulife(compulifeParams) {
  return new Promise((resolve, reject) => {
    const encoded = encodeURIComponent(JSON.stringify(compulifeParams));
    const url = new URL("https://www.compulifeapi.com/api/request/?COMPULIFE=" + encoded);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: "GET",
      headers: { Accept: "application/json" },
      timeout: 30000,
    };
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body: { message: body } }); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Compulife request timed out")); });
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, service: "compulife-proxy" }));
    return;
  }

  if (req.method !== "POST" || req.url !== "/compulife") {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  const secret = req.headers["x-proxy-secret"];
  if (!secret || secret !== PROXY_SECRET) {
    res.writeHead(401);
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  let body;
  try { body = await readBody(req); }
  catch { res.writeHead(400); res.end(JSON.stringify({ error: "Invalid JSON body" })); return; }

  try {
    const { status, body: data } = await fetchCompulife(body);
    res.writeHead(status);
    res.end(JSON.stringify(data));
  } catch (err) {
    console.error("Compulife fetch error:", err.message);
    res.writeHead(502);
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => { console.log(`Compulife proxy listening on port ${PORT}`); });
