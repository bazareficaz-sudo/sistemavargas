/**
 * api.js — Cliente Base44 (Entities API)
 */

const fetch = require('node-fetch');
const Store = require('electron-store');
const store = new Store();

const APP_ID  = '69fcb430127e4ced004d7e69';
const API_KEY = '67216247308e4b96989b61626f7fd87b';
const BASE_URL = `https://app.base44.com/api/apps/${APP_ID}`;

function headers() {
  return {
    'Content-Type': 'application/json',
    'api_key': API_KEY,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function get(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : v);
  }
  const res = await fetch(url.toString(), { method: 'GET', headers: headers(), timeout: 30000 });
  if (!res.ok) throw new Error(`Base44 GET ${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function post(path, body = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST', headers: headers(), body: JSON.stringify(body), timeout: 30000
  });
  if (!res.ok) throw new Error(`Base44 POST ${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function put(path, body = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PUT', headers: headers(), body: JSON.stringify(body), timeout: 30000
  });
  if (!res.ok) throw new Error(`Base44 PUT ${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── Ping ─────────────────────────────────────────────────────────────

async function ping() {
  try {
    const res = await fetch(`https://app.base44.com/api/apps/${APP_ID}/entities/Produto?limit=1`, {
      method: 'GET', headers: headers(), timeout: 5000
    });
    return res.ok;
  } catch { return false; }
}

// ─── Produtos ─────────────────────────────────────────────────────────

/**
 * Busca todos os produtos ativos.
 * onProgress(totalBaixados) — chamado a cada lote para atualizar UI.
 * Retorna os produtos em lotes via callback para economizar memória em catálogos 14k+.
 */
async function sincronizarProdutos(ultimaSync = null, onBatch = null) {
  const limit = 200;
  let skip = 0;
  let totalBaixados = 0;
  const todos = [];

  const query = { ativo: true };
  if (ultimaSync) query.updated_date = { $gt: ultimaSync };

  while (true) {
    const res = await get('/entities/Produto', { q: query, limit, skip });
    const items = Array.isArray(res) ? res : (res.results || res.data || []);

    if (items.length > 0) {
      totalBaixados += items.length;
      if (onBatch) {
        onBatch(items, totalBaixados);
      } else {
        todos.push(...items);
      }
      skip += items.length;
    }

    if (items.length < limit) break;

    await new Promise(r => setTimeout(r, 150));
  }

  return onBatch ? totalBaixados : todos;
}

async function getProduto(id) {
  return get(`/entities/Produto/${id}`);
}

// ─── Vendas ───────────────────────────────────────────────────────────

/**
 * Registra uma venda no Base44.
 * A venda local já foi salva — aqui só sincroniza.
 */
const EMPRESA_ID = '69fcc1ef22ce2c5e401104a7';

async function registrarVenda(venda) {
  const usuario = store.get('auth.usuario') || {};
  const payload = {
    empresa_id:        usuario.empresa_estoque_id  || venda.empresa_id        || EMPRESA_ID,
    empresa_fiscal_id: usuario.empresa_fiscal_id   || venda.empresa_fiscal_id || null,
    deposito_id:       usuario.deposito_id          || venda.deposito_id       || null,
    numero: venda.numero,
    cliente_id: venda.cliente_remote_id || null,
    cliente_nome: venda.cliente_nome || null,
    status: venda.status || 'finalizada',
    subtotal: venda.subtotal,
    desconto_total: venda.desconto || 0,
    total: venda.total,
    forma_pagamento: venda.forma_pagamento,
    valor_recebido: venda.valor_pago,
    troco: venda.troco || 0,
    observacao: venda.observacao || null,
    terminal_id: store.get('config.terminal_id') || 'PDV-001',
    vendedor_id: venda.vendedor_id || null,
    vendedor_nome: venda.vendedor_nome || null,
    vendedor_codigo: venda.vendedor_codigo || null,
    created_date: venda.created_at,
    itens: (venda.itens || []).map(i => ({
      produto_id: i.produto_remote_id || i.produto_id,
      produto_nome: i.produto_nome,
      produto_sku: i.produto_sku || null,
      quantidade: i.quantidade,
      preco_unitario: i.preco_unitario,
      desconto: i.desconto || 0,
      subtotal: i.total,
    })),
  };
  return post('/entities/Venda', payload);
}

async function editarVenda(remoteId, itens, totais, forma_pagamento) {
  return put(`/entities/Venda/${remoteId}`, {
    subtotal:        totais.subtotal,
    desconto_total:  totais.desconto || 0,
    total:           totais.total,
    forma_pagamento: forma_pagamento,
    valor_recebido:  totais.valor_pago || totais.total,
    troco:           totais.troco || 0,
    itens: itens.map(i => ({
      produto_id:     i.produto_id,
      produto_nome:   i.produto_nome,
      produto_sku:    i.produto_sku || null,
      quantidade:     i.quantidade,
      preco_unitario: i.preco_unitario,
      desconto:       i.desconto || 0,
      subtotal:       i.total,
    })),
  });
}

async function cancelarVenda(remoteId, motivo) {
  return put(`/entities/Venda/${remoteId}`, { status: 'cancelada', motivo_cancelamento: motivo });
}

async function listarVendasCloud(data) {
  // Busca sem filtro de data — filtra localmente depois (mais compatível com Base44)
  const q = { empresa_id: EMPRESA_ID };
  const res = await get('/entities/Venda', { q: JSON.stringify(q), limit: 500, sort: JSON.stringify({ created_date: -1 }) });
  const lista = Array.isArray(res) ? res : (res.results || res.data || []);
  console.log('[CLOUD] Total vendas recebidas:', lista.length, '| campos ex:', lista[0] ? Object.keys(lista[0]).join(',') : 'vazio');
  // Filtrar pela data localmente — aceita created_date ou created_at
  return lista.filter(v => {
    const dt = v.created_date || v.created_at || '';
    return dt.startsWith(data);
  });
}

// ─── Vendedores ───────────────────────────────────────────────────────

async function sincronizarVendedores() {
  const res = await get('/entities/Vendedor', { q: { ativo: true }, limit: 200 });
  return Array.isArray(res) ? res : (res.results || []);
}

// ─── CreditoCliente (Contas a Receber) ────────────────────────────────

async function sincronizarCreditosCliente() {
  const todos = [];
  const limit = 200;
  let skip = 0;
  // Apenas status em aberto/parcial — as pagas não precisam de sync contínuo
  const query = { empresa_id: EMPRESA_ID, status: { $in: ['aberto', 'usado_parcialmente'] } };
  while (true) {
    const res = await get('/entities/CreditoCliente', { q: query, limit, skip, sort_by: '-created_date' });
    const items = Array.isArray(res) ? res : (res.results || []);
    todos.push(...items);
    if (items.length < limit) break;
    skip += items.length;
  }
  return todos;
}

async function getCreditosDoCliente(clienteRemoteId) {
  const query = { cliente_id: clienteRemoteId, status: { $in: ['aberto', 'usado_parcialmente'] } };
  const res = await get('/entities/CreditoCliente', { q: query, limit: 50, sort_by: 'created_date' });
  return Array.isArray(res) ? res : (res.results || []);
}

async function receberCreditoCliente(remoteId, saldoNovo, novoStatus, observacao) {
  return put(`/entities/CreditoCliente/${remoteId}`, {
    saldo_atual: saldoNovo,
    status: novoStatus,
    observacao: observacao || null,
  });
}

// ─── ContaReceber (Fiado / Carteira) ──────────────────────────────────

async function sincronizarContasReceber() {
  const todos = [];
  const limit = 200;
  let skip = 0;
  const query = { empresa_id: EMPRESA_ID, status: 'pendente' };
  while (true) {
    const res = await get('/entities/ContaReceber', { q: query, limit, skip, sort_by: 'vencimento' });
    const items = Array.isArray(res) ? res : (res.results || []);
    todos.push(...items);
    if (items.length < limit) break;
    skip += items.length;
  }
  return todos;
}

async function pagarContaReceber(contaId, formaPagamento, observacao) {
  return put(`/entities/ContaReceber/${contaId}`, {
    status: 'pago',
    data_pagamento: new Date().toISOString().split('T')[0],
    forma_recebimento: formaPagamento || 'dinheiro',
    observacao: observacao || null,
  });
}

async function pagarContaReceberParcial(contaId, valorPago, valorOriginal, formaPagamento, observacao) {
  const valorRestante = Math.round((valorOriginal - valorPago) * 100) / 100;
  // Atualiza o valor da conta para o restante (pagamento parcial)
  return put(`/entities/ContaReceber/${contaId}`, {
    valor: valorRestante,
    observacao: `Pgto parcial R$ ${valorPago.toFixed(2)} (${formaPagamento || 'dinheiro'})${observacao ? ' — ' + observacao : ''}`,
  });
}

async function usarCreditoEmConta(contaId, contaValor, creditoId, creditoSaldoAtual, formaPagamento, observacao) {
  const hoje = new Date().toISOString().split('T')[0];
  if (creditoSaldoAtual >= contaValor) {
    // Crédito cobre a conta inteira — quita a conta, abate o crédito
    await put(`/entities/ContaReceber/${contaId}`, {
      status: 'pago',
      data_pagamento: hoje,
      forma_recebimento: 'credito_loja',
      observacao: observacao || 'Pago com crédito loja',
    });
    const novoSaldo = Math.round((creditoSaldoAtual - contaValor) * 100) / 100;
    await put(`/entities/CreditoCliente/${creditoId}`, {
      saldo_atual: novoSaldo,
      status: novoSaldo <= 0 ? 'usado_totalmente' : 'usado_parcialmente',
    });
    return { quitou: true, saldoCreditoRestante: novoSaldo };
  } else {
    // Crédito não cobre tudo — abate parcialmente a conta, zera o crédito
    const valorRestante = Math.round((contaValor - creditoSaldoAtual) * 100) / 100;
    await put(`/entities/ContaReceber/${contaId}`, {
      valor: valorRestante,
      observacao: `Crédito loja R$ ${creditoSaldoAtual.toFixed(2)} aplicado — restam R$ ${valorRestante.toFixed(2)}`,
    });
    await put(`/entities/CreditoCliente/${creditoId}`, {
      saldo_atual: 0,
      status: 'usado_totalmente',
    });
    return { quitou: false, saldoCreditoRestante: 0, valorRestante };
  }
}

// ─── Clientes ─────────────────────────────────────────────────────────

async function registrarCliente(cliente) {
  const payload = {
    empresa_id: EMPRESA_ID,
    nome: cliente.nome,
    cpf_cnpj: cliente.cpf_cnpj || null,
    telefone: cliente.telefone || null,
    email: cliente.email || null,
    limite_credito: cliente.limite_credito || 0,
    saldo_credito: cliente.saldo_credito || 0,
    ativo: true,
  };
  return post('/entities/Cliente', payload);
}

async function atualizarCliente(remoteId, dados) {
  return put(`/entities/Cliente/${remoteId}`, dados);
}

async function sincronizarClientes(ultimaSync = null) {
  const clientes = [];
  const limit = 200;
  let skip = 0;

  const query = { ativo: true };
  if (ultimaSync) query.updated_date = { $gt: ultimaSync };

  while (true) {
    const res = await get('/entities/Cliente', { q: query, limit, skip });
    const items = Array.isArray(res) ? res : (res.results || []);
    clientes.push(...items);
    if (items.length < limit) break;
    skip += limit;
  }

  return clientes;
}

// ─── Faltas ───────────────────────────────────────────────────────────

async function registrarFalta(falta) {
  return post('/entities/Falta', {
    empresa_id: EMPRESA_ID,
    produto_id: falta.produto_remote_id || null,
    produto_nome: falta.produto_nome,
    produto_sku: falta.produto_sku || null,
    cliente_nome: falta.cliente_nome || null,
    cliente_telefone: falta.cliente_telefone || null,
    quantidade_solicitada: falta.quantidade_solicitada || 1,
    observacao: falta.observacao || null,
    status: falta.status || 'pendente',
    origem: falta.origem || 'pdv',
    usuario_nome: falta.usuario_nome || null,
  });
}

async function atualizarFalta(remoteId, dados) {
  return put(`/entities/Falta/${remoteId}`, dados);
}

async function listarFaltasRemoto() {
  const res = await get('/entities/Falta', {
    q: { empresa_id: EMPRESA_ID, status: { $in: ['pendente', 'notificado', 'comprado'] } },
    limit: 200,
    sort_by: '-created_date',
  });
  return Array.isArray(res) ? res : (res.results || []);
}

// ─── ConfigDesconto ───────────────────────────────────────────────────

async function sincronizarConfigDesconto() {
  const res = await get('/entities/ConfigDesconto', {
    q: { empresa_id: EMPRESA_ID },
    limit: 20,
  });
  return Array.isArray(res) ? res : (res.results || []);
}

// ─── Autenticação PDV ─────────────────────────────────────────────────

async function autenticarPDV(login, senha) {
  try {
    const crypto = require('crypto');
    const senhaHash = crypto.createHash('sha256').update(senha).digest('hex');

    const res = await get('/entities/UsuarioPDV', {
      q: { login, empresa_id: EMPRESA_ID, ativo: true },
      limit: 1,
    });
    const usuarios = Array.isArray(res) ? res : (res.results || []);
    if (usuarios.length === 0) return { erro: 'Operador não encontrado' };

    const u = usuarios[0];
    if (u.senha_hash !== senhaHash) return { erro: 'Senha incorreta' };

    // Base44 armazena configs de empresa/estoque dentro do objeto permissoes
    const perms = u.permissoes || {};
    const usuario = {
      id:                  u.id,
      nome:                u.nome || u.login,
      login:               u.login,
      cargo:               u.cargo || 'Operador',
      empresa_id:          u.empresa_id,
      empresa_nome:        u.empresa_nome || 'Bazar Eficaz',
      // Empresa fiscal: campo empresa_emissao_fiscal_id dentro de permissoes
      empresa_fiscal_id:   perms.empresa_emissao_fiscal_id || u.empresa_fiscal_id || u.empresa_id,
      empresa_fiscal_nome: u.empresa_fiscal_nome || null,
      // Empresa de estoque: campo estoque_empresa_id dentro de permissoes
      empresa_estoque_id:  perms.estoque_empresa_id  || u.empresa_estoque_id  || u.empresa_id,
      empresa_estoque_nome:u.empresa_estoque_nome || null,
      // Depósito: campo estoque_deposito_id dentro de permissoes
      deposito_id:         perms.estoque_deposito_id || u.deposito_id || null,
      deposito_nome:       u.deposito_nome || null,
      unificar_estoque:    perms.unificar_estoque || u.unificar_estoque || false,
      permissoes:          perms,
    };
    // Buscar dados completos da empresa fiscal, estoque, depósito e config fiscal (em paralelo)
    try {
      const [resFiscal, resEstoque, resDep, resCfgFiscal] = await Promise.allSettled([
        get(`/entities/Empresa/${usuario.empresa_fiscal_id}`),
        usuario.empresa_estoque_id !== usuario.empresa_fiscal_id
          ? get(`/entities/Empresa/${usuario.empresa_estoque_id}`) : Promise.resolve(null),
        usuario.deposito_id
          ? get(`/entities/Deposito/${usuario.deposito_id}`) : Promise.resolve(null),
        // ConfigFiscal: série, CSC, id_token para NFC-e
        get('/entities/ConfigFiscal', { q: JSON.stringify({ empresa_id: usuario.empresa_fiscal_id }), limit: 1 }),
      ]);

      if (resFiscal.status === 'fulfilled' && resFiscal.value) {
        const ef = resFiscal.value;
        // Nomes exatos dos campos no Base44 (Empresa)
        usuario.empresa_fiscal_nome      = ef.nome          || usuario.empresa_fiscal_id;
        usuario.empresa_fiscal_fantasia  = ef.fantasia       || ef.nome || null;
        usuario.empresa_fiscal_cnpj      = ef.cnpj           || null;
        usuario.empresa_fiscal_ie        = ef.ie             || null;
        usuario.empresa_fiscal_im        = ef.im             || null;
        usuario.empresa_fiscal_regime    = ef.regime_tributario || 'simples_nacional';
        usuario.empresa_fiscal_uf        = ef.estado         || null;
        usuario.empresa_fiscal_cep       = ef.cep            || null;
        usuario.empresa_fiscal_logradouro= ef.logradouro     || null;
        usuario.empresa_fiscal_numero    = ef.numero         || 'S/N';
        usuario.empresa_fiscal_complemento = ef.complemento  || null;
        usuario.empresa_fiscal_bairro    = ef.bairro         || null;
        usuario.empresa_fiscal_municipio = ef.cidade         || null;  // Base44 usa "cidade"
        usuario.empresa_fiscal_telefone  = ef.telefone       || null;
        usuario.empresa_fiscal_token_focusnfe = ef.token_focusnfe || null;
      } else {
        usuario.empresa_fiscal_nome = usuario.empresa_nome;
      }

      if (resEstoque.status === 'fulfilled' && resEstoque.value) {
        usuario.empresa_estoque_nome = resEstoque.value.nome;
      } else {
        usuario.empresa_estoque_nome = usuario.empresa_fiscal_nome || usuario.empresa_nome;
      }

      if (resDep.status === 'fulfilled' && resDep.value) {
        usuario.deposito_nome = resDep.value.nome;
      }

      // ConfigFiscal: dados para emissão NFC-e
      if (resCfgFiscal.status === 'fulfilled') {
        const cfgList = Array.isArray(resCfgFiscal.value) ? resCfgFiscal.value : (resCfgFiscal.value?.results || []);
        const cfg = cfgList[0];
        if (cfg) {
          usuario.nfce_serie        = cfg.serie_nfce          || '001';
          usuario.nfce_ambiente     = cfg.ambiente             || 'homologacao';
          usuario.nfce_csc          = cfg.csc_nfce             || null;
          usuario.nfce_id_token     = cfg.id_token_nfce        || null;
          usuario.nfce_habilitada   = cfg.habilita_nfce        || false;
          // token FocusNFe pode estar em ConfigFiscal também
          if (!usuario.empresa_fiscal_token_focusnfe && cfg.token_focusnfe) {
            usuario.empresa_fiscal_token_focusnfe = cfg.token_focusnfe;
          }
        }
      }

      // Salvar token e CNPJ nas configs do terminal para acesso rápido
      if (usuario.empresa_fiscal_token_focusnfe)
        store.set('config.fiscal_token', usuario.empresa_fiscal_token_focusnfe);
      if (usuario.empresa_fiscal_cnpj)
        store.set('config.fiscal_cnpj', usuario.empresa_fiscal_cnpj);
      if (usuario.nfce_ambiente)
        store.set('config.fiscal_ambiente', usuario.nfce_ambiente);

    } catch (err) {
      console.warn('[LOGIN] Erro ao buscar dados fiscais:', err.message);
    }

    store.set('auth.token', u.id);
    store.set('auth.usuario', usuario);
    store.set('auth.empresa_id',         usuario.empresa_id);
    store.set('auth.empresa_fiscal_id',  usuario.empresa_fiscal_id);
    store.set('auth.empresa_estoque_id', usuario.empresa_estoque_id);
    store.set('auth.deposito_id',        usuario.deposito_id);
    return { token: u.id, usuario };
  } catch (err) {
    return { erro: 'Erro de conexão: ' + err.message };
  }
}

// ─── Entregas ─────────────────────────────────────────────────────────

async function registrarEntrega(entrega) {
  return post('/entities/Entrega', {
    empresa_id: entrega.empresa_id || EMPRESA_ID,
    empresa_nome: entrega.empresa_nome || null,
    venda_id: entrega.venda_id || null,
    venda_numero: entrega.venda_numero || null,
    terminal_id: entrega.terminal_id || null,
    numero_local: entrega.numero_local || null,
    cliente_id: entrega.cliente_id || null,
    cliente_nome: entrega.cliente_nome || null,
    cliente_telefone: entrega.cliente_telefone || null,
    cliente_whatsapp: entrega.cliente_whatsapp || null,
    cep: entrega.cep || null,
    logradouro: entrega.logradouro || null,
    numero: entrega.numero || null,
    complemento: entrega.complemento || null,
    bairro: entrega.bairro || null,
    cidade: entrega.cidade || null,
    estado: entrega.estado || null,
    observacao: entrega.observacao || null,
    data_agendada: entrega.data_agendada || null,
    turno: entrega.turno || 'qualquer',
    itens: entrega.itens || [],
    valor_total_entrega: entrega.valor_total_entrega || 0,
    status: 'pendente',
    criado_por: entrega.criado_por || null,
    created_date: entrega.created_at || new Date().toISOString(),
  });
}

async function listarEntregasRemoto(empresaId, status = null) {
  const query = { empresa_id: empresaId || EMPRESA_ID };
  if (status) query.status = status;
  const res = await get('/entities/Entrega', { q: query, limit: 200, sort_by: '-created_date' });
  return Array.isArray(res) ? res : (res.results || []);
}

async function atualizarEntrega(remoteId, dados) {
  return put(`/entities/Entrega/${remoteId}`, dados);
}

// ─── ConfigTermometro ─────────────────────────────────────────────────

async function sincronizarConfigTermometro() {
  const res = await get('/entities/ConfigTermometro', {
    q: { empresa_id: EMPRESA_ID },
    limit: 5,
  });
  const items = Array.isArray(res) ? res : (res.results || []);
  return items[0] || null; // Uma config por empresa
}

// ─── Estoque ──────────────────────────────────────────────────────────

async function sincronizarEstoque(ultimaSync = null) {
  // O estoque vem junto com os produtos no campo `estoque`
  // Esta função busca os produtos com estoque atualizado
  const query = { ativo: true, controlar_estoque: true };
  if (ultimaSync) query.updated_date = { $gt: ultimaSync };

  const items = [];
  const limit = 200;
  let skip = 0;

  while (true) {
    const res = await get('/entities/Produto', { q: query, limit, skip });
    const batch = Array.isArray(res) ? res : (res.results || []);
    items.push(...batch);
    if (batch.length < limit) break;
    skip += limit;
  }

  return items;
}

module.exports = {
  registrarFalta,
  atualizarFalta,
  listarFaltasRemoto,
  ping, post,
  sincronizarProdutos,
  registrarCliente,
  atualizarCliente,
  sincronizarClientes,
  autenticarPDV,
  sincronizarConfigDesconto,
  sincronizarConfigTermometro,
  sincronizarEstoque,
  sincronizarVendedores,
  sincronizarCreditosCliente,
  getCreditosDoCliente,
  receberCreditoCliente,
  sincronizarContasReceber,
  pagarContaReceber,
  pagarContaReceberParcial,
  usarCreditoEmConta,
  registrarVenda,
  editarVenda,
  cancelarVenda,
  listarVendasCloud,
  getProduto,
  registrarEntrega,
  listarEntregasRemoto,
  atualizarEntrega,
};
