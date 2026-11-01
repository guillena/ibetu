// Verifica la conexión TCP a PostgreSQL y Redis y valida los protocolos básicos.
const net = require('net');

const PG = { host: process.env.PG_HOST || '127.0.0.1', port: Number(process.env.PG_PORT || 5432) };
const REDIS = { host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT || 6379) };

function probe({ host, port }, payload, expect, name) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ name, ok: false, detail: 'timeout' });
    }, 3000);
    socket.on('connect', () => {
      if (payload) socket.write(payload);
      else {
        clearTimeout(timer);
        socket.end();
        resolve({ name, ok: true, detail: `${host}:${port}` });
      }
    });
    socket.on('data', (buf) => {
      clearTimeout(timer);
      socket.end();
      const ok = expect(buf);
      resolve({ name, ok, detail: ok ? `${host}:${port}` : 'respuesta inesperada' });
    });
    socket.on('error', (err) => {
      clearTimeout(timer);
      resolve({ name, ok: false, detail: err.code || err.message });
    });
  });
}

(async () => {
  // PostgreSQL: SSLRequest (8 bytes); el servidor responde 'S' o 'N'.
  const sslRequest = Buffer.from([0, 0, 0, 8, 4, 210, 22, 47]);
  const results = await Promise.all([
    probe(PG, sslRequest, (b) => b[0] === 0x53 || b[0] === 0x4e, 'PostgreSQL'),
    probe(REDIS, 'PING\r\n', (b) => b.toString().startsWith('+PONG'), 'Redis'),
  ]);
  let failed = false;
  for (const r of results) {
    console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.name} (${r.detail})`);
    if (!r.ok) failed = true;
  }
  process.exit(failed ? 1 : 0);
})();

