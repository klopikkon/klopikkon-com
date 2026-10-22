import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
  ".xml": "application/xml",
};

/**
 * Serve the git repo root so absolute /amt/redesign/ URLs resolve.
 * @param {string} repoRoot
 */
export function startServer(repoRoot) {
  const root = path.resolve(repoRoot);
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      if (rel.includes("\0")) {
        res.writeHead(400).end("bad path");
        return;
      }
      let resolved = path.resolve(root, rel);
      if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
        res.writeHead(403).end("forbidden");
        return;
      }
      let stat;
      try {
        stat = fs.statSync(resolved);
      } catch {
        res.writeHead(404).end("not found");
        return;
      }
      if (stat.isDirectory()) {
        resolved = path.join(resolved, "index.html");
        if (!fs.existsSync(resolved)) {
          res.writeHead(404).end("not found");
          return;
        }
      }
      const type = MIME[path.extname(resolved).toLowerCase()] || "application/octet-stream";
      res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
      const stream = fs.createReadStream(resolved);
      stream.on("error", () => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
      stream.pipe(res);
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        origin: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}
