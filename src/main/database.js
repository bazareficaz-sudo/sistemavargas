/**
 * database.js — Camada SQLite local (offline-first)
 * Otimizado para grandes volumes: índices em nome, ean, sku
 * WAL mode para escritas concorrentes rápidas
 */

const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(app.getPath('userData'), 'pdv-vargas.db');
let db;

// ─── Inicializar banco ────────────────────────────────────────────
function initialize() {
  db = new Database(DB_PATH);

  // Performance: WAL mode + cache generoso para 14k produtos
  db.pragma('journal_mode = WAL');
  db.pragma('cache_size = -32000'); // 32MB cache
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');

  createTables();
  runMigrations();
  createIndexes();
  console.log(`[DB] SQLite inicializado em: ${DB_PATH}`);
}

function createTables() {
  db.exec(`
    -- Produtos (14k+)
    CREATE TABLE IF NOT EXISTS produtos (
      id TEXT PRIMARY KEY,
      remote_id TEXT UNIQUE,
      nome TEXT NOT NULL,
      nome_lower TEXT, -- coluna pré-processada para busca rápida
      sku TEXT,
      ean TEXT,
      preco_venda REAL NOT NULL DEFAULT 0,
      preco_custo REAL DEFAULT 0,
      unidade TEXT DEFAULT 'UN',
      categoria TEXT,
      marca TEXT,
      foto_url TEXT,
      ativo INTEGER DEFAULT 1,
      disponivel_pdv INTEGER DEFAULT 1,
      permite_fracao INTEGER DEFAULT 0,
      updated_at TEXT,
      synced_at TEXT,
      sync_status TEXT DEFAULT 'synced' -- 'synced' | 'pending' | 'conflict'
    );

    -- Estoque por depósito
    CREATE TABLE IF NOT EXISTS estoque (
      id TEXT PRIMARY KEY,
      produto_id TEXT NOT NULL,
      deposito_id TEXT,
      empresa_id TEXT,
      quantidade REAL DEFAULT 0,
      quantidade_minima REAL DEFAULT 0,
      updated_at TEXT,
      FOREIGN KEY (produto_id) REFERENCES produtos(id)
    );

    -- Clientes
    CREATE TABLE IF NOT EXISTS clientes (
      id TEXT PRIMARY KEY,
      remote_id TEXT UNIQUE,
      nome TEXT NOT NULL,
      nome_lower TEXT,
      cpf_cnpj TEXT,
      telefone TEXT,
      email TEXT,
      limite_credito REAL DEFAULT 0,
      saldo_credito REAL DEFAULT 0,
      updated_at TEXT,
      synced_at TEXT,
      sync_status TEXT DEFAULT 'synced'
    );

    -- Vendas
    CREATE TABLE IF NOT EXISTS vendas (
      id TEXT PRIMARY KEY,
      remote_id TEXT UNIQUE,
      numero INTEGER,
      cliente_id TEXT,
      empresa_id TEXT,
      deposito_id TEXT,
      operador_id TEXT,
      operador_nome TEXT,
      vendedor_id TEXT,
      vendedor_nome TEXT,
      vendedor_codigo TEXT,
      status TEXT DEFAULT 'concluida', -- concluida | cancelada | pendente
      subtotal REAL NOT NULL,
      desconto REAL DEFAULT 0,
      total REAL NOT NULL,
      forma_pagamento TEXT, -- dinheiro | pix | credito | debito | credito_cliente | misto
      valor_pago REAL,
      troco REAL DEFAULT 0,
      observacao TEXT,
      created_at TEXT NOT NULL,
      synced_at TEXT,
      sync_status TEXT DEFAULT 'pending' -- sempre pending até confirmar com servidor
    );

    -- Itens de venda
    CREATE TABLE IF NOT EXISTS venda_itens (
      id TEXT PRIMARY KEY,
      venda_id TEXT NOT NULL,
      produto_id TEXT NOT NULL,
      produto_nome TEXT,
      produto_sku TEXT,
      quantidade REAL NOT NULL,
      preco_unitario REAL NOT NULL,
      desconto REAL DEFAULT 0,
      total REAL NOT NULL,
      FOREIGN KEY (venda_id) REFERENCES vendas(id),
      FOREIGN KEY (produto_id) REFERENCES produtos(id)
    );

    -- Movimentações de estoque
    CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
      id TEXT PRIMARY KEY,
      remote_id TEXT UNIQUE,
      produto_id TEXT NOT NULL,
      deposito_id TEXT,
      tipo TEXT NOT NULL, -- entrada | saida | ajuste | venda | cancelamento
      quantidade REAL NOT NULL,
      quantidade_anterior REAL,
      quantidade_posterior REAL,
      referencia_id TEXT, -- venda_id ou outro
      referencia_tipo TEXT,
      operador_id TEXT,
      observacao TEXT,
      created_at TEXT NOT NULL,
      sync_status TEXT DEFAULT 'pending'
    );

    -- Pagamentos de crédito cliente
    CREATE TABLE IF NOT EXISTS credito_movimentacoes (
      id TEXT PRIMARY KEY,
      remote_id TEXT UNIQUE,
      cliente_id TEXT NOT NULL,
      venda_id TEXT,
      tipo TEXT NOT NULL, -- credito | debito
      valor REAL NOT NULL,
      saldo_anterior REAL,
      saldo_posterior REAL,
      observacao TEXT,
      created_at TEXT NOT NULL,
      sync_status TEXT DEFAULT 'pending'
    );

    -- Contas a receber do cliente (CreditoCliente do Base44)
    CREATE TABLE IF NOT EXISTS creditos_cliente (
      id TEXT PRIMARY KEY,          -- remote_id do Base44
      empresa_id TEXT,
      cliente_id TEXT,              -- remote_id do cliente
      cliente_nome TEXT,
      cliente_telefone TEXT,
      venda_origem_id TEXT,
      venda_origem_numero INTEGER,
      valor_original REAL NOT NULL DEFAULT 0,
      saldo_atual REAL DEFAULT 0,
      status TEXT DEFAULT 'aberto', -- aberto | usado_parcialmente | usado_totalmente | estornado | cancelado
      origem TEXT,                  -- troca | devolucao | ajuste_manual
      observacao TEXT,
      created_date TEXT,
      updated_date TEXT
    );

    -- Fila de sync (operações offline pendentes)
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      entidade TEXT NOT NULL, -- venda | estoque | credito
      operacao TEXT NOT NULL, -- create | update | delete
      payload TEXT NOT NULL, -- JSON
      tentativas INTEGER DEFAULT 0,
      erro TEXT,
      created_at TEXT NOT NULL,
      processado INTEGER DEFAULT 0
    );

    -- Vendedores
    CREATE TABLE IF NOT EXISTS vendedores (
      id TEXT PRIMARY KEY,
      codigo TEXT UNIQUE NOT NULL,
      nome TEXT NOT NULL,
      comissao REAL DEFAULT 0,
      ativo INTEGER DEFAULT 1,
      updated_date TEXT
    );

    -- Faltas / Encomendas
    CREATE TABLE IF NOT EXISTS faltas (
      id TEXT PRIMARY KEY,
      remote_id TEXT UNIQUE,
      produto_id TEXT,
      produto_nome TEXT NOT NULL,
      produto_sku TEXT,
      cliente_nome TEXT,
      cliente_telefone TEXT,
      quantidade_solicitada REAL DEFAULT 1,
      observacao TEXT,
      status TEXT DEFAULT 'pendente',
      origem TEXT DEFAULT 'pdv',
      usuario_nome TEXT,
      created_at TEXT NOT NULL,
      synced_at TEXT,
      sync_status TEXT DEFAULT 'pending'
    );

    -- Config local
    CREATE TABLE IF NOT EXISTS config (
      chave TEXT PRIMARY KEY,
      valor TEXT
    );
  `);
}

function runMigrations() {
  // Adiciona colunas novas sem quebrar banco existente
  const migrations = [
    'ALTER TABLE produtos ADD COLUMN disponivel_pdv INTEGER DEFAULT 1',
    'ALTER TABLE vendas ADD COLUMN vendedor_id TEXT',
    'ALTER TABLE vendas ADD COLUMN vendedor_nome TEXT',
    'ALTER TABLE vendas ADD COLUMN vendedor_codigo TEXT',
    `CREATE TABLE IF NOT EXISTS faltas (
      id TEXT PRIMARY KEY, remote_id TEXT UNIQUE,
      produto_id TEXT, produto_nome TEXT NOT NULL, produto_sku TEXT,
      cliente_nome TEXT, cliente_telefone TEXT,
      quantidade_solicitada REAL DEFAULT 1, observacao TEXT,
      status TEXT DEFAULT 'pendente', origem TEXT DEFAULT 'pdv',
      usuario_nome TEXT, created_at TEXT NOT NULL,
      synced_at TEXT, sync_status TEXT DEFAULT 'pending'
    )`,
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch { /* coluna já existe */ }
  }
}

function createIndexes() {
  db.exec(`
    -- Índices críticos para busca de 14k produtos em <50ms
    CREATE INDEX IF NOT EXISTS idx_produtos_nome_lower ON produtos(nome_lower);
    CREATE INDEX IF NOT EXISTS idx_produtos_ean ON produtos(ean);
    CREATE INDEX IF NOT EXISTS idx_produtos_sku ON produtos(sku);
    CREATE INDEX IF NOT EXISTS idx_produtos_ativo ON produtos(ativo);
    CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON produtos(categoria);

    -- Índices clientes
    CREATE INDEX IF NOT EXISTS idx_clientes_nome_lower ON clientes(nome_lower);
    CREATE INDEX IF NOT EXISTS idx_clientes_cpf ON clientes(cpf_cnpj);
    CREATE INDEX IF NOT EXISTS idx_creditos_cliente_id ON creditos_cliente(cliente_id);
    CREATE INDEX IF NOT EXISTS idx_creditos_status ON creditos_cliente(status);

    -- Índices estoque
    CREATE INDEX IF NOT EXISTS idx_estoque_produto ON estoque(produto_id);

    -- Índices vendas
    CREATE INDEX IF NOT EXISTS idx_vendas_created ON vendas(created_at);
    CREATE INDEX IF NOT EXISTS idx_vendas_sync ON vendas(sync_status);
    CREATE INDEX IF NOT EXISTS idx_vendas_cliente ON vendas(cliente_id);

    -- Fila sync
    CREATE INDEX IF NOT EXISTS idx_queue_processado ON sync_queue(processado);
  `);
}

// ─── PRODUTOS ─────────────────────────────────────────────────────
const produtos = {
  // Busca full-text otimizada — retorna max 100 resultados
  buscar(query) {
    // Apenas produtos ativos E disponíveis no PDV
    const filtroBase = 'p.ativo = 1 AND p.disponivel_pdv = 1';

    if (!query || query.trim() === '') {
      return db.prepare(`
        SELECT p.*, e.quantidade as estoque
        FROM produtos p
        LEFT JOIN estoque e ON e.produto_id = p.id
        WHERE ${filtroBase}
        ORDER BY p.nome LIMIT 100
      `).all();
    }
    const q = query.trim().toLowerCase();
    // Busca por EAN primeiro (digitação de código de barras)
    if (/^\d{8,14}$/.test(query.trim())) {
      const byEan = db.prepare(`
        SELECT p.*, e.quantidade as estoque
        FROM produtos p
        LEFT JOIN estoque e ON e.produto_id = p.id
        WHERE p.ean = ? AND ${filtroBase} LIMIT 1
      `).get(query.trim());
      if (byEan) return [byEan];
    }
    // Quebrar em palavras e exigir que o nome contenha TODAS elas
    const palavras = q.split(/\s+/).filter(Boolean);

    if (palavras.length <= 1) {
      return db.prepare(`
        SELECT p.*, e.quantidade as estoque
        FROM produtos p
        LEFT JOIN estoque e ON e.produto_id = p.id
        WHERE ${filtroBase} AND (
          p.nome_lower LIKE ? OR
          p.sku LIKE ? OR
          p.ean LIKE ? OR
          p.marca LIKE ?
        )
        ORDER BY
          CASE WHEN p.nome_lower LIKE ? THEN 0 ELSE 1 END,
          p.nome
        LIMIT 100
      `).all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `${q}%`);
    }

    // Busca multi-palavra: monta condição AND para cada palavra no nome
    const nomeConditions = palavras.map(() => `p.nome_lower LIKE ?`).join(' AND ');
    const nomeParams = palavras.map(p => `%${p}%`);

    const sql = `
      SELECT p.*, e.quantidade as estoque
      FROM produtos p
      LEFT JOIN estoque e ON e.produto_id = p.id
      WHERE ${filtroBase} AND (
        (${nomeConditions}) OR
        p.sku LIKE ? OR
        p.ean LIKE ?
      )
      ORDER BY
        CASE WHEN p.nome_lower LIKE ? THEN 0 ELSE 1 END,
        p.nome
      LIMIT 100
    `;
    return db.prepare(sql).all(...nomeParams, `%${q}%`, `%${q}%`, `${palavras[0]}%`);
  },

  getById(id) {
    return db.prepare(`
      SELECT p.*, e.quantidade as estoque, e.quantidade_minima
      FROM produtos p
      LEFT JOIN estoque e ON e.produto_id = p.id
      WHERE p.id = ?
    `).get(id);
  },

  getByEan(ean) {
    return db.prepare(`
      SELECT p.*, e.quantidade as estoque
      FROM produtos p
      LEFT JOIN estoque e ON e.produto_id = p.id
      WHERE p.ean = ? AND p.ativo = 1 LIMIT 1
    `).get(ean);
  },

  total() {
    return db.prepare('SELECT COUNT(*) as total FROM produtos WHERE ativo = 1 AND disponivel_pdv = 1').get().total;
  },

  salvar(produto) {
    const id = produto.id || uuidv4();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT OR REPLACE INTO produtos
      (id, remote_id, nome, nome_lower, sku, ean, preco_venda, preco_custo,
       unidade, categoria, marca, foto_url, ativo, permite_fracao, updated_at, sync_status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      id, produto.remote_id || null,
      produto.nome, produto.nome?.toLowerCase(),
      produto.sku || null, produto.ean || null,
      produto.preco_venda || 0, produto.preco_custo || 0,
      produto.unidade || 'UN', produto.categoria || null,
      produto.marca || null, produto.foto_url || null,
      produto.ativo !== false ? 1 : 0,
      produto.permite_fracao ? 1 : 0,
      now, 'pending'
    );
    return id;
  },

  atualizar(id, dados) {
    const sets = Object.keys(dados).map(k => `${k} = ?`).join(', ');
    const vals = Object.values(dados);
    if (dados.nome) { vals.push(dados.nome.toLowerCase()); }
    db.prepare(`UPDATE produtos SET ${sets}${dados.nome ? ', nome_lower = ?' : ''}, updated_at = ?, sync_status = 'pending' WHERE id = ?`)
      .run(...vals, new Date().toISOString(), id);
    return true;
  },

  // Upsert em lote para sync (muito mais rápido que inserções individuais)
  upsertBatch(lista) {
    const stmtProd = db.prepare(`
      INSERT OR REPLACE INTO produtos
      (id, remote_id, nome, nome_lower, sku, ean, preco_venda, preco_custo,
       unidade, categoria, marca, foto_url, ativo, disponivel_pdv, permite_fracao, updated_at, synced_at, sync_status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const stmtEst = db.prepare(`
      INSERT OR REPLACE INTO estoque (id, produto_id, quantidade, quantidade_minima, updated_at)
      VALUES (
        COALESCE((SELECT id FROM estoque WHERE produto_id = ?), ?),
        ?, ?, ?, ?
      )
    `);
    const transaction = db.transaction((items) => {
      for (const p of items) {
        // Verificar se já existe pelo remote_id
        const existing = db.prepare('SELECT id FROM produtos WHERE remote_id = ?').get(p.id);
        const localId = existing?.id || uuidv4();
        const now = new Date().toISOString();

        stmtProd.run(
          localId, p.id,
          p.nome, p.nome?.toLowerCase(),
          p.sku || null, p.ean || null,
          p.preco_venda || 0, p.preco_custo || 0,
          p.unidade || 'UN', p.categoria || null,
          p.marca || null, p.foto_url || null,
          p.ativo !== false ? 1 : 0,
          p.disponivel_pdv !== false ? 1 : 0,
          p.permite_fracao ? 1 : 0,
          p.updated_at || now, now, 'synced'
        );

        // Atualizar estoque se vier no payload
        if (p.estoque !== undefined && p.estoque !== null) {
          stmtEst.run(localId, uuidv4(), localId, p.estoque, p.estoque_minimo || 0, now);
        }
      }
    });
    transaction(lista);
  }
};

// ─── CLIENTES ─────────────────────────────────────────────────────
const clientes = {
  buscar(query) {
    if (!query) return db.prepare('SELECT * FROM clientes ORDER BY nome LIMIT 50').all();
    const q = query.toLowerCase();
    return db.prepare(`
      SELECT * FROM clientes
      WHERE nome_lower LIKE ? OR cpf_cnpj LIKE ? OR telefone LIKE ?
      ORDER BY nome LIMIT 50
    `).all(`%${q}%`, `%${q}%`, `%${q}%`);
  },

  getById(id) {
    return db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
  },

  getCredito(clienteId) {
    const cliente = db.prepare('SELECT limite_credito, saldo_credito FROM clientes WHERE id = ?').get(clienteId);
    const movs = db.prepare('SELECT * FROM credito_movimentacoes WHERE cliente_id = ? ORDER BY created_at DESC LIMIT 20').all(clienteId);
    return { ...cliente, movimentacoes: movs };
  },

  salvar(cliente) {
    const id = cliente.id || uuidv4();
    const existente = cliente.id
      ? db.prepare('SELECT remote_id FROM clientes WHERE id = ?').get(cliente.id)
      : null;
    const remoteId = cliente.remote_id || existente?.remote_id || null;

    db.prepare(`
      INSERT OR REPLACE INTO clientes
      (id, remote_id, nome, nome_lower, cpf_cnpj, telefone, email, limite_credito, saldo_credito, updated_at, sync_status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      id, remoteId,
      cliente.nome, cliente.nome?.toLowerCase(),
      cliente.cpf_cnpj || null, cliente.telefone || null, cliente.email || null,
      cliente.limite_credito || 0, cliente.saldo_credito || 0,
      new Date().toISOString(), remoteId ? 'synced' : 'pending'
    );

    // Agendar upload para Base44 se ainda não tem remote_id
    if (!remoteId) {
      const jaNaFila = db.prepare(
        "SELECT id FROM sync_queue WHERE entidade='cliente' AND payload LIKE ? AND processado=0"
      ).get(`%${id}%`);
      if (!jaNaFila) {
        db.prepare(`INSERT INTO sync_queue (id, entidade, operacao, payload, created_at) VALUES (?,?,?,?,?)`)
          .run(uuidv4(), 'cliente', 'create', JSON.stringify({ cliente_id: id }), new Date().toISOString());
      }
    }

    return id;
  },

  upsertBatch(lista) {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO clientes
      (id, remote_id, nome, nome_lower, cpf_cnpj, telefone, email, limite_credito, saldo_credito, updated_at, synced_at, sync_status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const t = db.transaction(items => {
      for (const c of items) {
        stmt.run(c.local_id || uuidv4(), c.id, c.nome, c.nome?.toLowerCase(),
          c.cpf_cnpj || null, c.telefone || null, c.email || null,
          c.limite_credito || 0, c.saldo_credito || 0,
          c.updated_at || new Date().toISOString(), new Date().toISOString(), 'synced');
      }
    });
    t(lista);
  }
};

// ─── VENDEDORES ───────────────────────────────────────────────────
const vendedores = {
  upsertBatch(lista) {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO vendedores (id, codigo, nome, comissao, ativo, updated_date)
      VALUES (?,?,?,?,?,?)
    `);
    const t = db.transaction(items => {
      for (const v of items) {
        stmt.run(v.id, v.codigo, v.nome, v.comissao || 0, v.ativo !== false ? 1 : 0, v.updated_date || null);
      }
    });
    t(lista);
  },

  getByCodigo(codigo) {
    return db.prepare('SELECT * FROM vendedores WHERE codigo = ? AND ativo = 1').get(codigo);
  },

  listar() {
    return db.prepare('SELECT * FROM vendedores WHERE ativo = 1 ORDER BY nome').all();
  }
};

// ─── CRÉDITOS CLIENTE (Contas a Receber) ──────────────────────────
const creditosCliente = {
  upsertBatch(lista) {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO creditos_cliente
      (id, empresa_id, cliente_id, cliente_nome, cliente_telefone,
       venda_origem_id, venda_origem_numero,
       valor_original, saldo_atual, status, origem, observacao, created_date, updated_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const t = db.transaction(items => {
      for (const c of items) {
        stmt.run(
          c.id, c.empresa_id || null,
          c.cliente_id || null, c.cliente_nome || null, c.cliente_telefone || null,
          c.venda_origem_id || null, c.venda_origem_numero || null,
          c.valor_original || 0, c.saldo_atual ?? c.valor_original ?? 0,
          c.status || 'aberto', c.origem || null, c.observacao || null,
          c.created_date || null, c.updated_date || null
        );
      }
    });
    t(lista);
  },

  // Retorna todos os créditos abertos de um cliente (remote_id)
  getAbertosDoCliente(clienteRemoteId) {
    return db.prepare(`
      SELECT * FROM creditos_cliente
      WHERE cliente_id = ? AND status IN ('aberto', 'usado_parcialmente')
      ORDER BY created_date ASC
    `).all(clienteRemoteId);
  },

  // Resumo de créditos por cliente para mostrar na lista
  resumoPorCliente(clienteRemoteId) {
    return db.prepare(`
      SELECT
        COUNT(*) as total_registros,
        SUM(saldo_atual) as total_saldo,
        SUM(valor_original) as total_original
      FROM creditos_cliente
      WHERE cliente_id = ? AND status IN ('aberto', 'usado_parcialmente')
    `).get(clienteRemoteId) || { total_registros: 0, total_saldo: 0, total_original: 0 };
  },

  // Atualizar saldo local após recebimento
  atualizarSaldo(remoteId, novoSaldo, novoStatus) {
    db.prepare(`
      UPDATE creditos_cliente SET saldo_atual = ?, status = ?, updated_date = ? WHERE id = ?
    `).run(novoSaldo, novoStatus, new Date().toISOString(), remoteId);
  }
};

// ─── VENDAS ───────────────────────────────────────────────────────
const vendas = {
  registrar(venda) {
    const id = uuidv4();
    const now = new Date().toISOString();

    // Número sequencial com base no terminal (evita colisão entre terminais)
    const base = venda._numero_base || 0;
    const ultimoGlobal = db.prepare('SELECT MAX(numero) as num FROM vendas').get();
    const proximo = Math.max(base + 1, (ultimoGlobal?.num || 0) + 1);
    const numero = proximo;

    const registrarVenda = db.transaction(() => {
      // Inserir venda
      db.prepare(`
        INSERT INTO vendas
        (id, numero, cliente_id, empresa_id, deposito_id, operador_id, operador_nome,
         vendedor_id, vendedor_nome, vendedor_codigo,
         status, subtotal, desconto, total, forma_pagamento, valor_pago, troco, observacao, created_at, sync_status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(id, numero,
        venda.cliente_id || null, venda.empresa_id || null,
        venda.deposito_id || null, venda.operador_id || null, venda.operador_nome || null,
        venda.vendedor_id || null, venda.vendedor_nome || null, venda.vendedor_codigo || null,
        'concluida', venda.subtotal, venda.desconto || 0, venda.total,
        venda.forma_pagamento, venda.valor_pago || venda.total,
        venda.troco || 0, venda.observacao || null, now, 'pending'
      );

      // Inserir itens e baixar estoque
      for (const item of venda.itens) {
        db.prepare(`
          INSERT INTO venda_itens (id, venda_id, produto_id, produto_nome, produto_sku, quantidade, preco_unitario, desconto, total)
          VALUES (?,?,?,?,?,?,?,?,?)
        `).run(uuidv4(), id, item.produto_id, item.produto_nome, item.produto_sku || null,
          item.quantidade, item.preco_unitario, item.desconto || 0, item.total);

        // Baixar estoque local
        const estoqueAtual = db.prepare('SELECT quantidade FROM estoque WHERE produto_id = ?').get(item.produto_id);
        const qtdAnterior = estoqueAtual?.quantidade || 0;
        const qtdPosterior = qtdAnterior - item.quantidade;

        db.prepare('UPDATE estoque SET quantidade = ? WHERE produto_id = ?')
          .run(qtdPosterior, item.produto_id);

        // Registrar movimentação
        db.prepare(`
          INSERT INTO movimentacoes_estoque
          (id, produto_id, deposito_id, tipo, quantidade, quantidade_anterior, quantidade_posterior, referencia_id, referencia_tipo, created_at, sync_status)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)
        `).run(uuidv4(), item.produto_id, venda.deposito_id || null,
          'venda', item.quantidade, qtdAnterior, qtdPosterior, id, 'venda', now, 'pending');
      }

      // Lançar crédito do cliente se necessário
      if (venda.forma_pagamento === 'credito_cliente' || venda.usa_credito) {
        const cli = db.prepare('SELECT saldo_credito FROM clientes WHERE id = ?').get(venda.cliente_id);
        if (cli) {
          const saldoAnterior = cli.saldo_credito;
          const saldoPosterior = saldoAnterior - venda.total;
          db.prepare('UPDATE clientes SET saldo_credito = ? WHERE id = ?').run(saldoPosterior, venda.cliente_id);
          db.prepare(`
            INSERT INTO credito_movimentacoes
            (id, cliente_id, venda_id, tipo, valor, saldo_anterior, saldo_posterior, created_at, sync_status)
            VALUES (?,?,?,?,?,?,?,?,?)
          `).run(uuidv4(), venda.cliente_id, id, 'debito', venda.total, saldoAnterior, saldoPosterior, now, 'pending');
        }
      }

      // Enfileirar para sync com Base44
      db.prepare(`
        INSERT INTO sync_queue (id, entidade, operacao, payload, created_at)
        VALUES (?,?,?,?,?)
      `).run(uuidv4(), 'venda', 'create', JSON.stringify({ venda_id: id }), now);
    });

    registrarVenda();
    return { id, numero };
  },

  listar(filtros = {}) {
    let where = '1=1';
    const params = [];
    if (filtros.data_inicio) { where += ' AND v.created_at >= ?'; params.push(filtros.data_inicio); }
    if (filtros.data_fim) { where += ' AND v.created_at <= ?'; params.push(filtros.data_fim + 'T23:59:59'); }
    if (filtros.cliente_id) { where += ' AND v.cliente_id = ?'; params.push(filtros.cliente_id); }
    if (filtros.status) { where += ' AND v.status = ?'; params.push(filtros.status); }

    return db.prepare(`
      SELECT v.*, c.nome as cliente_nome
      FROM vendas v
      LEFT JOIN clientes c ON c.id = v.cliente_id
      WHERE ${where}
      ORDER BY v.created_at DESC
      LIMIT ${filtros.limit || 100}
    `).all(...params);
  },

  getById(id) {
    const venda = db.prepare(`
      SELECT v.*, c.remote_id as cliente_remote_id
      FROM vendas v
      LEFT JOIN clientes c ON c.id = v.cliente_id
      WHERE v.id = ?
    `).get(id);
    if (!venda) return null;
    venda.itens = db.prepare('SELECT * FROM venda_itens WHERE venda_id = ?').all(id);
    return venda;
  },

  cancelar(id, motivo) {
    const venda = this.getById(id);
    if (!venda || venda.status === 'cancelada') return false;

    const cancelar = db.transaction(() => {
      db.prepare("UPDATE vendas SET status = 'cancelada', observacao = ?, sync_status = 'pending' WHERE id = ?")
        .run(motivo, id);

      // Estornar estoque
      for (const item of venda.itens) {
        db.prepare('UPDATE estoque SET quantidade = quantidade + ? WHERE produto_id = ?')
          .run(item.quantidade, item.produto_id);
        db.prepare(`
          INSERT INTO movimentacoes_estoque
          (id, produto_id, tipo, quantidade, referencia_id, referencia_tipo, observacao, created_at, sync_status)
          VALUES (?,?,'cancelamento',?,?,?,'Cancelamento de venda',?,?)
        `).run(uuidv4(), item.produto_id, item.quantidade, id, 'cancelamento', new Date().toISOString(), 'pending');
      }

      db.prepare(`INSERT INTO sync_queue (id, entidade, operacao, payload, created_at) VALUES (?,?,?,?,?)`)
        .run(uuidv4(), 'venda', 'update', JSON.stringify({ venda_id: id, status: 'cancelada', motivo }), new Date().toISOString());
    });
    cancelar();
    return true;
  },

  totaisHoje() {
    const hoje = new Date().toISOString().split('T')[0];
    return db.prepare(`
      SELECT
        COUNT(*) as total_vendas,
        SUM(total) as total_valor,
        SUM(CASE WHEN forma_pagamento = 'dinheiro' THEN total ELSE 0 END) as dinheiro,
        SUM(CASE WHEN forma_pagamento = 'pix' THEN total ELSE 0 END) as pix,
        SUM(CASE WHEN forma_pagamento IN ('credito','debito') THEN total ELSE 0 END) as cartao,
        SUM(CASE WHEN status = 'cancelada' THEN 1 ELSE 0 END) as canceladas
      FROM vendas
      WHERE created_at LIKE ? AND status != 'cancelada'
    `).get(`${hoje}%`);
  }
};

// ─── ESTOQUE ──────────────────────────────────────────────────────
const estoque = {
  get(produtoId) {
    return db.prepare('SELECT * FROM estoque WHERE produto_id = ?').get(produtoId);
  },

  movimentar(mov) {
    const atual = db.prepare('SELECT quantidade FROM estoque WHERE produto_id = ?').get(mov.produto_id);
    const qtdAnterior = atual?.quantidade || 0;
    const qtdPosterior = mov.tipo === 'entrada' ? qtdAnterior + mov.quantidade : qtdAnterior - mov.quantidade;

    db.prepare('UPDATE estoque SET quantidade = ? WHERE produto_id = ?').run(qtdPosterior, mov.produto_id);
    const id = uuidv4();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO movimentacoes_estoque
      (id, produto_id, tipo, quantidade, quantidade_anterior, quantidade_posterior, observacao, created_at, sync_status)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(id, mov.produto_id, mov.tipo, mov.quantidade, qtdAnterior, qtdPosterior, mov.observacao || null, now, 'pending');
    db.prepare('INSERT INTO sync_queue (id, entidade, operacao, payload, created_at) VALUES (?,?,?,?,?)')
      .run(uuidv4(), 'estoque', 'create', JSON.stringify({ mov_id: id }), now);
    return { id, quantidade_posterior: qtdPosterior };
  },

  alertas() {
    return db.prepare(`
      SELECT p.id, p.nome, p.sku, e.quantidade, e.quantidade_minima
      FROM estoque e
      JOIN produtos p ON p.id = e.produto_id
      WHERE e.quantidade <= e.quantidade_minima AND p.ativo = 1
      ORDER BY e.quantidade ASC LIMIT 50
    `).all();
  },

  upsertBatch(lista) {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO estoque (id, produto_id, deposito_id, empresa_id, quantidade, quantidade_minima, updated_at)
      VALUES (?,?,?,?,?,?,?)
    `);
    const t = db.transaction(items => {
      for (const e of items) {
        // Buscar id local pelo produto remote_id
        const prod = db.prepare('SELECT id FROM produtos WHERE remote_id = ?').get(e.produto_id);
        if (!prod) continue;
        const existing = db.prepare('SELECT id FROM estoque WHERE produto_id = ?').get(prod.id);
        stmt.run(existing?.id || uuidv4(), prod.id, e.deposito_id || null, e.empresa_id || null,
          e.quantidade || 0, e.quantidade_minima || 0, e.updated_at || new Date().toISOString());
      }
    });
    t(lista);
  }
};

// ─── FALTAS / ENCOMENDAS ─────────────────────────────────────────
const faltas = {
  registrar(falta) {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO faltas
      (id, produto_id, produto_nome, produto_sku, cliente_nome, cliente_telefone,
       quantidade_solicitada, observacao, status, origem, usuario_nome, created_at, sync_status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      id, falta.produto_id || null, falta.produto_nome, falta.produto_sku || null,
      falta.cliente_nome || null, falta.cliente_telefone || null,
      falta.quantidade_solicitada || 1, falta.observacao || null,
      falta.status || 'pendente', falta.origem || 'pdv',
      falta.usuario_nome || null, new Date().toISOString(), 'pending'
    );
    db.prepare(`INSERT INTO sync_queue (id, entidade, operacao, payload, created_at) VALUES (?,?,?,?,?)`)
      .run(uuidv4(), 'falta', 'create', JSON.stringify({ falta_id: id }), new Date().toISOString());
    return id;
  },

  listar(filtros = {}) {
    let where = '1=1';
    const params = [];
    if (filtros.status) { where += ' AND status = ?'; params.push(filtros.status); }
    if (filtros.busca) {
      where += ' AND (produto_nome LIKE ? OR cliente_nome LIKE ?)';
      params.push(`%${filtros.busca}%`, `%${filtros.busca}%`);
    }
    return db.prepare(`
      SELECT * FROM faltas WHERE ${where}
      ORDER BY created_at DESC LIMIT ${filtros.limit || 200}
    `).all(...params);
  },

  atualizarStatus(id, status) {
    db.prepare("UPDATE faltas SET status = ?, sync_status = 'pending' WHERE id = ?").run(status, id);
    const falta = db.prepare('SELECT remote_id FROM faltas WHERE id = ?').get(id);
    if (falta?.remote_id) {
      db.prepare(`INSERT INTO sync_queue (id, entidade, operacao, payload, created_at) VALUES (?,?,?,?,?)`)
        .run(uuidv4(), 'falta', 'update', JSON.stringify({ falta_id: id, status }), new Date().toISOString());
    }
  },

  upsertFromRemote(lista) {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO faltas
      (id, remote_id, produto_id, produto_nome, produto_sku, cliente_nome, cliente_telefone,
       quantidade_solicitada, observacao, status, origem, usuario_nome, created_at, synced_at, sync_status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const t = db.transaction(items => {
      for (const f of items) {
        const localId = db.prepare('SELECT id FROM faltas WHERE remote_id = ?').get(f.id)?.id || uuidv4();
        stmt.run(localId, f.id, f.produto_id || null, f.produto_nome, f.produto_sku || null,
          f.cliente_nome || null, f.cliente_telefone || null,
          f.quantidade_solicitada || 1, f.observacao || null,
          f.status || 'pendente', f.origem || 'pdv', f.usuario_nome || null,
          f.created_date || new Date().toISOString(), new Date().toISOString(), 'synced');
      }
    });
    t(lista);
  },

  contarPendentes() {
    return db.prepare("SELECT COUNT(*) as total FROM faltas WHERE status = 'pendente'").get().total;
  },
};

// ─── SYNC QUEUE ──────────────────────────────────────────────────
const syncQueue = {
  getPendentes() {
    return db.prepare(`
      SELECT * FROM sync_queue WHERE processado = 0
      ORDER BY
        CASE entidade WHEN 'cliente' THEN 0 WHEN 'venda' THEN 1 ELSE 2 END ASC,
        created_at ASC
      LIMIT 50
    `).all();
  },
  marcarProcessado(id) {
    db.prepare('UPDATE sync_queue SET processado = 1 WHERE id = ?').run(id);
  },
  marcarErro(id, erro, tentativas) {
    db.prepare('UPDATE sync_queue SET erro = ?, tentativas = ? WHERE id = ?').run(erro, tentativas, id);
  }
};

module.exports = {
  initialize,
  db: () => db,
  produtos,
  clientes,
  vendedores,
  creditosCliente,
  vendas,
  estoque,
  faltas,
  sync: syncQueue
};
