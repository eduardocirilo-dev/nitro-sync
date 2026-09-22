// nitro-sync — guarda o progresso de treino (MongoDB) e serve-o a qualquer aparelho.
// Endpoints:
//   GET  /saude                          → { ok: true, mongo: true|false }
//   GET  /estado/:chave                  → { <devId>: <doc>, ... }
//   PUT  /estado/:chave/:devId           → grava o documento desse aparelho
// Sem MONGODB_URI a aplicação corre em memória (útil para testar).

const express = require('express');
const { MongoClient } = require('mongodb');

const PORT = process.env.PORT || 10000;
const URI = process.env.MONGODB_URI || '';
const ORIGENS = (process.env.ORIGENS || 'https://eduardocirilo-dev.github.io,http://localhost:8080,http://127.0.0.1:8080')
  .split(',').map(s => s.trim()).filter(Boolean);
const LIMITE_BYTES = 256 * 1024;

// ---------- armazenamento ----------
function criaMemoria() {
  const m = new Map();
  return {
    tipo: 'memoria',
    async todos(chave) {
      const out = {};
      for (const [k, doc] of m) {
        const [c, dev] = k.split('\u0000');
        if (c === chave) out[dev] = doc;
      }
      return out;
    },
    async grava(chave, dev, doc) { m.set(chave + '\u0000' + dev, doc); },
    async saude() { return true; },
  };
}

async function criaMongo(uri) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const col = client.db(process.env.MONGODB_DB || 'nitro').collection('estado');
  await col.createIndex({ chave: 1, dev: 1 }, { unique: true });
  return {
    tipo: 'mongo',
    async todos(chave) {
      const out = {};
      const docs = await col.find({ chave }, { projection: { _id: 0, dev: 1, doc: 1 } }).toArray();
      for (const d of docs) out[d.dev] = d.doc;
      return out;
    },
    async grava(chave, dev, doc) {
      await col.updateOne({ chave, dev }, { $set: { chave, dev, doc, at: new Date() } }, { upsert: true });
    },
    async saude() { await client.db().command({ ping: 1 }); return true; },
  };
}

// ---------- servidor ----------
const app = express();
app.use(express.json({ limit: LIMITE_BYTES }));
app.use((req, res, next) => {
  const o = req.headers.origin;
  if (o && (ORIGENS.includes(o) || ORIGENS.includes('*'))) {
    res.set('Access-Control-Allow-Origin', o);
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

let store = criaMemoria();

const chaveOk = s => typeof s === 'string' && /^[a-z0-9-]{6,64}$/i.test(s);
const devOk = s => typeof s === 'string' && /^[a-z0-9-]{6,64}$/i.test(s);

app.get('/saude', async (_req, res) => {
  let responde = false;
  try { responde = await store.saude(); } catch (e) { responde = false; }
  res.json({ ok: true, guarda: store.tipo, a_responder: responde, mongo: store.tipo === 'mongo',
             pista: pistaMongo });
});

app.get('/diagnostico', (_req, res) => {
  res.json({ guarda: store.tipo, pista: pistaMongo || 'sem erro' });
});

// Traduzir o erro do Mongo para uma acção concreta (o log do Render fica legível para ele)
let pistaMongo = '';
function explicarErroMongo(msg) {
  const m = String(msg || '');
  if (/tlsv1 alert internal error|SSL alert number 80|ssl3_read_bytes/i.test(m)) {
    return 'A ligação TLS foi recusada pelo MongoDB. Motivo quase sempre: o endereço do Render não está autorizado. Abrir MongoDB Atlas → SECURITY → Database & Network Access → IP Access List → ADD IP ADDRESS → ALLOW ACCESS FROM ANYWHERE (0.0.0.0/0).';
  }
  if (/authentication failed|bad auth/i.test(m)) {
    return 'Password ou utilizador errados no MONGODB_URI (Database Access → confirma o utilizador e a password).';
  }
  if (/ENOTFOUND|querySrv/i.test(m)) {
    return 'O endereço do MONGODB_URI não existe ou está mal copiado (falta pedaços?). Copiar outra vez em Connect → Drivers.';
  }
  if (/timed out|Server selection/i.test(m)) {
    return 'Não cheguei ao servidor do MongoDB a tempo. Normalmente também é o IP Access List.';
  }
  return 'Erro inesperado: ' + m.slice(0, 200);
}

app.get('/estado/:chave', async (req, res) => {
  if (!chaveOk(req.params.chave)) return res.status(400).json({ erro: 'chave invalida' });
  try {
    res.json(await store.todos(req.params.chave));
  } catch (e) {
    console.error('GET /estado falhou:', e.message);
    res.status(503).json({ erro: 'indisponivel' });
  }
});

app.put('/estado/:chave/:dev', async (req, res) => {
  if (!chaveOk(req.params.chave) || !devOk(req.params.dev)) return res.status(400).json({ erro: 'chave invalida' });
  const doc = req.body;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return res.status(400).json({ erro: 'corpo invalido' });
  try {
    await store.grava(req.params.chave, req.params.dev, doc);
    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /estado falhou:', e.message);
    res.status(503).json({ erro: 'indisponivel' });
  }
});

app.get('/', (_req, res) => res.type('text/plain').send('nitro-sync a funcionar'));

(async () => {
  if (URI) {
    try {
      store = await criaMongo(URI);
      console.log('ligado ao MongoDB');
    } catch (e) {
      pistaMongo = explicarErroMongo(e.message);
      console.error('MongoDB falhou: ' + e.message);
      console.error('>>> O QUE FAZER: ' + pistaMongo);
      store = criaMemoria();
    }
  } else {
    console.log('sem MONGODB_URI — modo memória');
  }
  app.listen(PORT, () => console.log('nitro-sync à escuta na porta ' + PORT + ' (' + store.tipo + ')'));
})();
