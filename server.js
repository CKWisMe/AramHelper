const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 4174);
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

async function sendFile(requestPath, response) {
  const safePath = requestPath === '/' ? '/index.html' : requestPath;
  const filePath = path.join(ROOT, safePath);
  const resolvedPath = path.resolve(filePath);

  if (!resolvedPath.startsWith(ROOT)) {
    response.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'FORBIDDEN' }));
    return;
  }

  try {
    const file = await fs.readFile(resolvedPath);
    const extension = path.extname(resolvedPath);
    response.writeHead(200, {
      'content-type': MIME_TYPES[extension] || 'application/octet-stream'
    });
    response.end(file);
  } catch (_error) {
    response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'NOT_FOUND' }));
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  await sendFile(url.pathname, response);
});

server.listen(PORT, () => {
  console.log(`ARAM static helper running at http://127.0.0.1:${PORT}`);
});
