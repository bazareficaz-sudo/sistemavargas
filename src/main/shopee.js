/**
 * shopee.js — Shopee Open Platform API v2 (multi-conta)
 */

const crypto  = require('crypto');
const fetch   = require('node-fetch');
const { shell } = require('electron');
const Store   = require('electron-store');

const store = new Store();

const PROD_HOST     = 'https://partner.shopeemobile.com';
const TEST_HOST     = 'https://partner.test-stable.shopeemobile.com';
const REDIRECT_URL = 'https://sistemavargas.com.br';

let _pendingResolve = null;
let _pendingReject  = null;
let _pendingId      = null; // contaId aguardando callback OAuth

// ─── Repositório de contas ───────────────────────────────────────────

function listarContas(canal) {
  const all = store.get('marketplace.contas') || [];
  return canal ? all.filter(c => c.canal === canal) : all;
}

function getConta(id) {
  return (store.get('marketplace.contas') || []).find(c => c.id === id) || null;
}

function salvarConta(dados) {
  const contas = store.get('marketplace.contas') || [];
  const idx = contas.findIndex(c => c.id === dados.id);
  if (idx >= 0) contas[idx] = { ...contas[idx], ...dados };
  else contas.push({ ...dados, criado_em: new Date().toISOString() });
  store.set('marketplace.contas', contas);
  return getConta(dados.id);
}

function removerConta(id) {
  const contas = (store.get('marketplace.contas') || []).filter(c => c.id !== id);
  store.set('marketplace.contas', contas);
}

// ─── Helpers de assinatura ─────────────────────────────────────────

function _host(conta) {
  return conta.sandbox ? TEST_HOST : PROD_HOST;
}

function _sign(partnerKey, path, ts, accessToken = '', shopId = '', partnerId) {
  const base = `${partnerId}${path}${ts}${String(accessToken)}${String(shopId || '')}`;
  return crypto.createHmac('sha256', String(partnerKey)).update(base).digest('hex');
}

async function _refreshToken(contaId) {
  const conta = getConta(contaId);
  if (!conta?.refresh_token) throw new Error('Sem refresh_token — reconecte a conta');
  const ts   = Math.floor(Date.now() / 1000);
  const path = '/api/v2/auth/access_token/get';
  const s    = _sign(conta.partner_key, path, ts, '', '', conta.partner_id);
  const res  = await fetch(`${_host(conta)}${path}?partner_id=${conta.partner_id}&timestamp=${ts}&sign=${s}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ refresh_token: conta.refresh_token, partner_id: Number(conta.partner_id), shop_id: Number(conta.shop_id) }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.message || data.error);
  salvarConta({ ...conta, access_token: data.access_token, refresh_token: data.refresh_token || conta.refresh_token, token_expires: Date.now() + ((data.expire_in || 14400) * 1000) });
  console.log(`[Shopee] Token renovado para conta ${contaId}`);
  return data.access_token;
}

async function _apiGet(contaId, path, extra = {}, _retry = true) {
  let conta = getConta(contaId);
  if (!conta) throw new Error('Conta não encontrada');

  // Renovar token se expirado (com 5 min de antecedência)
  if (conta.token_expires && Date.now() > conta.token_expires - 300000) {
    try { await _refreshToken(contaId); conta = getConta(contaId); } catch(e) { console.warn('[Shopee] Falha ao renovar token:', e.message); }
  }

  const ts  = Math.floor(Date.now() / 1000);
  const s   = _sign(conta.partner_key, path, ts, conta.access_token || '', conta.shop_id || '', conta.partner_id);
  const params = new URLSearchParams({
    partner_id:   conta.partner_id,
    timestamp:    ts,
    sign:         s,
    access_token: conta.access_token || '',
    shop_id:      conta.shop_id      || '',
    ...extra,
  });
  const res  = await fetch(`${_host(conta)}${path}?${params}`);
  const data = await res.json();

  // Token inválido — tenta renovar uma vez
  if (_retry && data.error === 'error_auth') {
    console.warn('[Shopee] Token inválido, tentando renovar...');
    await _refreshToken(contaId);
    return _apiGet(contaId, path, extra, false);
  }

  if (data.error && data.error !== '') throw new Error(data.message || data.error);
  return data;
}

// ─── OAuth ─────────────────────────────────────────────────────────

async function iniciarAuth(contaId) {
  const conta = getConta(contaId);
  if (!conta?.partner_id || !conta?.partner_key) throw new Error('Credenciais incompletas');

  // Cancelar auth anterior pendente
  if (_pendingReject) { _pendingReject(new Error('Nova autenticação iniciada')); }
  _pendingId = contaId;

  const ts   = Math.floor(Date.now() / 1000);
  const path = '/api/v2/shop/auth_partner';
  const s    = _sign(conta.partner_key, path, ts, '', '', conta.partner_id);
  const url  = `${_host(conta)}${path}?partner_id=${conta.partner_id}&timestamp=${ts}&sign=${s}&redirect=${encodeURIComponent(REDIRECT_URL)}`;

  shell.openExternal(url);

  return new Promise((resolve, reject) => {
    _pendingResolve = resolve;
    _pendingReject  = reject;
    // Timeout de 5 minutos
    setTimeout(() => reject(new Error('Tempo esgotado aguardando autorização da Shopee')), 5 * 60 * 1000);
  });
}

// Chamado pelo deep link vargas://shopee-auth?code=X&shop_id=Y
async function receberCallback(code, shopId) {
  if (!_pendingId || !_pendingResolve) {
    console.warn('[Shopee] Callback recebido sem auth pendente');
    return;
  }
  const resolve = _pendingResolve;
  const reject  = _pendingReject;
  const contaId = _pendingId;
  _pendingResolve = null; _pendingReject = null; _pendingId = null;

  try {
    const tokens  = await _trocarToken(getConta(contaId), Number(shopId), code);
    const updated = { ...getConta(contaId), shop_id: String(shopId), access_token: tokens.access_token, refresh_token: tokens.refresh_token, token_expires: Date.now() + ((tokens.expire_in || 14400) * 1000), conectado: true };
    salvarConta(updated);

    try {
      const info = await getShopInfo(contaId);
      if (info?.shop_name) salvarConta({ ...getConta(contaId), shop_name: info.shop_name });
    } catch {}

    const final = getConta(contaId);
    resolve({ ok: true, shop_id: shopId, shop_name: final?.shop_name || `Loja ${shopId}` });
  } catch(e) {
    reject(e);
  }
}

async function _trocarToken(conta, shopId, code) {
  const ts   = Math.floor(Date.now() / 1000);
  const path = '/api/v2/auth/token/get';
  const s    = _sign(conta.partner_key, path, ts, '', '', conta.partner_id);
  const res  = await fetch(`${_host(conta)}${path}?partner_id=${conta.partner_id}&timestamp=${ts}&sign=${s}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ code, shop_id: shopId, partner_id: Number(conta.partner_id) }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.message || data.error);
  return data;
}

// Troca code+shop_id por tokens (entrada manual pelo usuário)
async function trocarCodigo(contaId, code, shopId) {
  try {
    const conta   = getConta(contaId);
    if (!conta) throw new Error('Conta não encontrada');
    const tokens  = await _trocarToken(conta, Number(shopId), code);
    const updated = { ...conta, shop_id: String(shopId), access_token: tokens.access_token, refresh_token: tokens.refresh_token, token_expires: Date.now() + ((tokens.expire_in || 14400) * 1000), conectado: true };
    salvarConta(updated);
    try { const info = await getShopInfo(contaId); if (info?.shop_name) salvarConta({ ...getConta(contaId), shop_name: info.shop_name }); } catch {}
    const final = getConta(contaId);
    return { ok: true, shop_name: final?.shop_name || `Loja ${shopId}` };
  } catch(e) { return { ok: false, erro: e.message }; }
}

async function desconectar(id) {
  const conta = getConta(id);
  if (!conta) return;
  salvarConta({ ...conta, conectado: false, access_token: null, refresh_token: null, shop_id: null, shop_name: null });
}

// ─── API calls ─────────────────────────────────────────────────────

async function getShopInfo(contaId) {
  const data = await _apiGet(contaId, '/api/v2/shop/get_shop_info');
  return data.response;
}

async function getAnuncios(contaId, page = 0) {
  const lista = await _apiGet(contaId, '/api/v2/product/get_item_list', {
    offset: page * 50, page_size: 50, item_status: 'NORMAL',
  });
  const items = lista.response?.item || [];
  if (!items.length) return { item: [], total_count: 0 };
  const ids = items.map(i => i.item_id).join(',');
  try {
    const det = await _apiGet(contaId, '/api/v2/product/get_item_base_info', { item_id_list: ids });
    const detalhes = det.response?.item_list || [];
    return { item: detalhes, total_count: lista.response?.total_count || detalhes.length };
  } catch {
    return { item: items, total_count: lista.response?.total_count || items.length };
  }
}

async function getItemDetalhe(contaId, itemId) {
  const det = await _apiGet(contaId, '/api/v2/product/get_item_base_info', { item_id_list: String(itemId) });
  return det.response?.item_list?.[0] || null;
}

// Importa TODOS os anúncios da Shopee para o banco local (todos os status)
async function importarTodosAnuncios(contaId, onProgress) {
  const db = require('./database');
  const STATUSES = ['NORMAL', 'UNLIST', 'BANNED'];
  let importados = 0, totalGeral = 0;

  for (const status of STATUSES) {
    let offset = 0, total = 0;
    do {
      const lista = await _apiGet(contaId, '/api/v2/product/get_item_list', {
        offset, page_size: 100, item_status: status,
      });
      const items = lista.response?.item || [];
      total = lista.response?.total_count || 0;
      totalGeral = Math.max(totalGeral, importados + (total - offset));
      if (!items.length) break;

      // Buscar detalhes em lotes de 50 (limite da API)
      let detalhes = [];
      for (let b = 0; b < items.length; b += 50) {
        const lote = items.slice(b, b + 50);
        const ids  = lote.map(i => i.item_id).join(',');
        try {
          const det = await _apiGet(contaId, '/api/v2/product/get_item_base_info', { item_id_list: ids });
          detalhes.push(...(det.response?.item_list || lote));
        } catch { detalhes.push(...lote); }
      }

      db.mktAnuncios.salvarLote(contaId, 'shopee', detalhes);
      importados += detalhes.length;
      offset += 100;
      if (onProgress) onProgress(importados, totalGeral || importados);
    } while (offset < total);
  }

  return { importados, total: totalGeral };
}

// Verifica se há novos anúncios na Shopee que não estão no banco (todos os status)
async function verificarNovosAnuncios(contaId) {
  const db = require('./database');
  const existentes = new Set(db.mktAnuncios.itemIdsExistentes(contaId));
  let totalNovos = 0;

  for (const status of ['NORMAL', 'UNLIST', 'BANNED']) {
    const lista = await _apiGet(contaId, '/api/v2/product/get_item_list', {
      offset: 0, page_size: 100, item_status: status,
    });
    const items = lista.response?.item || [];
    const novos = items.filter(i => !existentes.has(String(i.item_id)));
    if (!novos.length) continue;

    let detalhes = [];
    for (let b = 0; b < novos.length; b += 50) {
      const lote = novos.slice(b, b + 50);
      const ids  = lote.map(i => i.item_id).join(',');
      try {
        const det = await _apiGet(contaId, '/api/v2/product/get_item_base_info', { item_id_list: ids });
        detalhes.push(...(det.response?.item_list || lote));
      } catch { detalhes.push(...lote); }
    }
    db.mktAnuncios.salvarLote(contaId, 'shopee', detalhes);
    totalNovos += detalhes.length;
    detalhes.forEach(d => existentes.add(String(d.item_id)));
  }

  return { novos: totalNovos };
}

async function getPedidos(contaId, status = 'READY_TO_SHIP') {
  const ts  = Math.floor(Date.now() / 1000);
  const data = await _apiGet(contaId, '/api/v2/order/get_order_list', {
    time_range_field: 'create_time',
    time_from: ts - 30 * 86400,
    time_to:   ts,
    page_size: 50,
    cursor:    '',
    order_status: status,
  });
  return data.response || { order_list: [], more: false };
}

// Busca detalhes completos de pedidos pela lista de order_sn
async function getDetalhePedidos(contaId, orderSns) {
  if (!orderSns.length) return [];
  // Shopee aceita até 50 por chamada
  const todos = [];
  for (let i = 0; i < orderSns.length; i += 50) {
    const lote = orderSns.slice(i, i + 50);
    try {
      const res = await _apiGet(contaId, '/api/v2/order/get_order_detail', {
        order_sn_list: lote.join(','),
        response_optional_fields: 'buyer_username,pay_time,recipient_address,actual_shipping_fee,package_list,shipping_carrier,payment_method,total_amount,checkout_shipping_carrier,item_list',
      });
      todos.push(...(res.response?.order_list || []));
    } catch(e) { console.warn('[Shopee] Erro ao buscar detalhe de pedidos:', e.message); }
  }
  return todos;
}

// Mapeia pedido Shopee → estrutura local
function _mapearPedido(o) {
  const addr = o.recipient_address || {};
  const itens = (o.item_list || []).map(i => ({
    marketplace_anuncio_id: String(i.item_id || ''),
    sku_marketplace:        i.item_sku || i.model_sku || '',
    variation_id:           String(i.model_id || ''),
    variation_descricao:    i.model_name || '',
    produto_nome:           i.item_name || '',
    produto_sku:            i.item_sku || '',
    quantidade:             i.model_quantity_purchased || 1,
    quantidade_conferida:   0,
    preco_unitario:         i.model_discounted_price || 0,
    thumbnail_url:          i.image_info?.image_url || '',
    nao_mapeado:            true,
  }));

  const statusMap = {
    UNPAID:         'emitir',
    READY_TO_SHIP:  'emitir',
    PROCESSED:      'em_separacao',
    SHIPPED:        'enviado',
    COMPLETED:      'finalizado',
    CANCELLED:      'cancelado',
    IN_CANCEL:      'cancelado',
  };

  return {
    pedido_id:        o.order_sn,
    status_shopee:    o.order_status,
    status_pagamento: o.pay_time ? 'paid' : 'pending',
    cliente_nome:     o.buyer_username || addr.name || 'Cliente Shopee',
    cliente_telefone: addr.phone || '',
    endereco_entrega: [addr.full_address, addr.district, addr.city, addr.state].filter(Boolean).join(', '),
    cliente_cidade:   addr.city || '',
    cliente_estado:   addr.state || '',
    valor_total:      o.total_amount || 0,
    valor_produtos:   (o.item_list || []).reduce((s, i) => s + (i.model_discounted_price || 0) * (i.model_quantity_purchased || 1), 0),
    valor_frete:      o.actual_shipping_fee || o.estimated_shipping_fee || 0,
    valor_desconto:   0,
    transportadora:   o.shipping_carrier || '',
    metodo_envio:     o.checkout_shipping_carrier || o.shipping_carrier || '',
    codigo_rastreio:  o.package_list?.[0]?.shipping_carrier || '',
    shipping_id:      o.package_list?.[0]?.package_number || '',
    data_pedido:      o.create_time ? new Date(o.create_time * 1000).toISOString() : null,
    data_prazo_envio: o.ship_by_date ? new Date(o.ship_by_date * 1000).toISOString().split('T')[0] : null,
    itens,
    dados_raw:        o,
    _status_base44:   statusMap[o.order_status] || 'emitir',
  };
}

// Importa pedidos recentes e grava no banco local
async function importarPedidos(contaId, diasAtras = 30) {
  const db = require('./database');
  const STATUSES = ['UNPAID', 'READY_TO_SHIP', 'PROCESSED', 'SHIPPED', 'COMPLETED', 'CANCELLED'];
  const ts = Math.floor(Date.now() / 1000);
  const timeFrom = ts - diasAtras * 86400;
  const allSns = [];

  for (const status of STATUSES) {
    let cursor = '', hasMore = true;
    while (hasMore) {
      try {
        const res = await _apiGet(contaId, '/api/v2/order/get_order_list', {
          time_range_field: 'create_time', time_from: timeFrom, time_to: ts,
          page_size: 50, cursor, order_status: status,
        });
        const list = res.response?.order_list || [];
        allSns.push(...list.map(o => o.order_sn));
        hasMore = res.response?.more || false;
        cursor  = res.response?.next_cursor || '';
      } catch { hasMore = false; }
    }
  }

  if (!allSns.length) return { importados: 0 };

  const detalhes = await getDetalhePedidos(contaId, allSns);
  const mapeados = detalhes.map(_mapearPedido);
  db.mktPedidos.salvarLote(contaId, 'shopee', mapeados);
  return { importados: mapeados.length };
}

// Busca APENAS pedidos novos (após o último importado)
async function buscarPedidosNovos(contaId) {
  const db = require('./database');
  const ultima = db.mktPedidos.getUltimaData(contaId);
  const timeFrom = ultima
    ? Math.floor(new Date(ultima).getTime() / 1000) - 300 // 5 min de overlap
    : Math.floor(Date.now() / 1000) - 2 * 86400; // últimas 48h se sem histórico
  const ts = Math.floor(Date.now() / 1000);

  const allSns = [];
  for (const status of ['UNPAID', 'READY_TO_SHIP', 'PROCESSED']) {
    try {
      const res = await _apiGet(contaId, '/api/v2/order/get_order_list', {
        time_range_field: 'create_time', time_from: timeFrom, time_to: ts,
        page_size: 50, cursor: '', order_status: status,
      });
      allSns.push(...(res.response?.order_list || []).map(o => o.order_sn));
    } catch {}
  }

  if (!allSns.length) return { novos: 0 };
  const detalhes = await getDetalhePedidos(contaId, allSns);
  const mapeados = detalhes.map(_mapearPedido);
  db.mktPedidos.salvarLote(contaId, 'shopee', mapeados);
  return { novos: mapeados.length, pedidos: mapeados };
}

module.exports = {
  listarContas, getConta, salvarConta, removerConta,
  iniciarAuth, receberCallback, trocarCodigo, desconectar,
  getShopInfo, getAnuncios, getItemDetalhe,
  importarTodosAnuncios, verificarNovosAnuncios,
  getPedidos, getDetalhePedidos, importarPedidos, buscarPedidosNovos,
};
