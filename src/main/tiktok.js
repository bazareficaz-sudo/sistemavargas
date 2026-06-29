/**
 * tiktok.js — TikTok Shop Open API v2 (multi-conta)
 * Docs: https://partner.tiktokshop.com/docv2
 */

const crypto  = require('crypto');
const fetch   = require('node-fetch');
const { shell } = require('electron');
const Store   = require('electron-store');

const store = new Store();

const APP_KEY    = '6k63nslih1hqg';
const APP_SECRET = '12014883bb2d0aa03cdb74985d61661d83283fc8';

// Hosts conforme ambiente
const HOSTS = {
  prod:    { api: 'https://open-api.tiktokglobalshop.com', token: 'https://open-api.tiktokglobalshop.com', oauth: 'https://auth.tiktok-shops.com' },
  sandbox: { api: 'https://open-api.tiktokglobalshop.com', token: 'https://open-api.tiktokglobalshop.com', oauth: 'https://auth.tiktok-shops.com' },
};

const REDIRECT_URL = 'https://sistemavargas.com.br/tiktok-callback';

// ─── Repositório de contas ───────────────────────────────────────────

function listarContas() {
  return (store.get('marketplace.contas') || []).filter(c => c.canal === 'tiktok');
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

function _apiHost(conta)   { return conta?.sandbox ? HOSTS.sandbox.api   : HOSTS.prod.api; }
function _tokenHost(conta) { return conta?.sandbox ? HOSTS.sandbox.token : HOSTS.prod.token; }
function _oauthHost(conta) { return conta?.sandbox ? HOSTS.sandbox.oauth : HOSTS.prod.oauth; }

// ─── Assinatura HMAC-SHA256 ──────────────────────────────────────────
// Fórmula: HMAC_SHA256( APP_SECRET + path + sorted_params + body_str + APP_SECRET )

function _sign(path, params = {}, bodyStr = '') {
  const filtered = Object.keys(params)
    .filter(k => !['sign', 'access_token'].includes(k))
    .sort()
    .map(k => `${k}${params[k]}`)
    .join('');

  const input = APP_SECRET + path + filtered + bodyStr + APP_SECRET;
  return crypto.createHmac('sha256', APP_SECRET).update(input).digest('hex');
}

function _baseParams(accessToken = '') {
  const p = {
    app_key:   APP_KEY,
    timestamp: String(Math.floor(Date.now() / 1000)),
    version:   '202309',
  };
  if (accessToken) p.access_token = accessToken;
  return p;
}

// ─── Chamadas de API ─────────────────────────────────────────────────

async function _apiGet(contaId, path, extraParams = {}) {
  const conta = getConta(contaId);
  if (!conta) throw new Error('Conta TikTok não encontrada');

  const token = await _ensureToken(contaId);
  const params = { ..._baseParams(token), ...extraParams };
  // shop_cipher é necessário em chamadas de loja
  if (conta.shop_cipher && !params.shop_cipher) params.shop_cipher = conta.shop_cipher;
  params.sign = _sign(path, params);

  const url = new URL(`${_apiHost(conta)}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  console.log('[TikTok] GET', url.toString());
  const res = await fetch(url.toString(), {
    headers: { 'Content-Type': 'application/json', 'x-tts-access-token': token },
    timeout: 30000,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`TikTok GET ${path}: resposta inválida: ${text.slice(0,150)}`); }
  if (json.code !== 0) throw new Error(`TikTok API ${path} erro ${json.code}: ${json.message}`);
  return json.data;
}

async function _apiPost(contaId, path, body = {}) {
  const conta = getConta(contaId);
  if (!conta) throw new Error('Conta TikTok não encontrada');

  const token = await _ensureToken(contaId);
  const params = { ..._baseParams(token) };
  if (conta.shop_cipher && !params.shop_cipher) params.shop_cipher = conta.shop_cipher;
  const bodyStr = JSON.stringify(body);
  params.sign = _sign(path, params, bodyStr);

  const url = new URL(`${_apiHost(conta)}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  console.log('[TikTok] POST', url.toString());
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tts-access-token': token },
    body: bodyStr,
    timeout: 30000,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`TikTok POST ${path}: resposta inválida: ${text.slice(0,150)}`); }
  if (json.code !== 0) throw new Error(`TikTok API ${path} erro ${json.code}: ${json.message}`);
  return json.data;
}

// ─── Token Management ────────────────────────────────────────────────

async function _ensureToken(contaId) {
  const conta = getConta(contaId);
  if (!conta) throw new Error('Conta não encontrada');
  const agora = Math.floor(Date.now() / 1000);
  if (conta.access_token && conta.token_expires_at && agora < conta.token_expires_at - 300) {
    return conta.access_token;
  }
  if (conta.refresh_token) return _refreshToken(contaId);
  throw new Error('Sem token — reconecte a conta TikTok Shop');
}

async function _refreshToken(contaId) {
  const conta = getConta(contaId);
  const path = '/api/v2/token/refresh';
  const ts   = String(Math.floor(Date.now() / 1000));
  const body = { refresh_token: conta.refresh_token, grant_type: 'refresh_token' };
  const bodyStr = JSON.stringify(body);
  const params  = { app_key: APP_KEY, timestamp: ts };
  const sign    = _sign(path, params, bodyStr);

  const url = new URL(`${_tokenHost(conta)}${path}`);
  url.searchParams.set('app_key', APP_KEY);
  url.searchParams.set('timestamp', ts);
  url.searchParams.set('sign', sign);

  const res  = await fetch(url.toString(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyStr, timeout: 15000 });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`Refresh token inválido: ${text.slice(0,150)}`); }
  if (json.code !== 0) throw new Error(`Erro ao renovar token TikTok: ${json.message}`);

  const d = json.data;
  salvarConta({
    ...conta,
    access_token:     d.access_token,
    refresh_token:    d.refresh_token || conta.refresh_token,
    token_expires_at: Math.floor(Date.now() / 1000) + (d.access_token_expire_in || 86400),
    conectado:        true,
  });
  console.log(`[TikTok] Token renovado para conta ${contaId}`);
  return d.access_token;
}

// ─── OAuth ──────────────────────────────────────────────────────────

function getAuthUrl(contaId) {
  const conta = getConta(contaId);
  const state  = contaId || 'tiktok_' + Date.now();
  const host   = conta?.sandbox ? HOSTS.sandbox.oauth : HOSTS.prod.oauth;
  const params = new URLSearchParams({ app_key: APP_KEY, state });
  return `${host}/oauth/authorize?${params.toString()}`;
}

async function trocarCodigo(contaId, code) {
  const conta = getConta(contaId) || {};
  const path  = '/api/v2/token/get';
  const ts    = String(Math.floor(Date.now() / 1000));
  const body  = { auth_code: code, grant_type: 'authorized_code' };
  const bodyStr = JSON.stringify(body);
  const params  = { app_key: APP_KEY, timestamp: ts };
  const sign    = _sign(path, params, bodyStr);

  const host = _tokenHost(conta);
  const url  = new URL(`${host}${path}`);
  url.searchParams.set('app_key', APP_KEY);
  url.searchParams.set('timestamp', ts);
  url.searchParams.set('sign', sign);

  console.log('[TikTok] trocarCodigo →', url.toString());
  const res  = await fetch(url.toString(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyStr, timeout: 15000 });
  const text = await res.text();
  console.log('[TikTok] trocarCodigo resposta:', text.substring(0, 400));

  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`Resposta inválida do TikTok: ${text.substring(0, 200)}`); }
  if (json.code !== 0) throw new Error(`TikTok erro ${json.code}: ${json.message}`);

  const d = json.data;
  // Pega a primeira loja autorizada
  const loja = d.authorized_shop?.[0] || {};

  salvarConta({
    ...conta,
    id:               contaId,
    canal:            'tiktok',
    access_token:     d.access_token,
    refresh_token:    d.refresh_token,
    token_expires_at: Math.floor(Date.now() / 1000) + (d.access_token_expire_in || 86400),
    shop_id:          loja.shop_id   || d.seller_tiktok_shop_id || '',
    shop_cipher:      loja.cipher    || '',
    shop_name:        loja.shop_name || '',
    region:           loja.region    || 'BR',
    conectado:        true,
  });

  console.log('[TikTok] Conectado! Lojas:', JSON.stringify(d.authorized_shop));
  return getConta(contaId);
}

async function conectar(contaId) {
  const url = getAuthUrl(contaId);
  console.log('[TikTok] OAuth URL:', url);
  shell.openExternal(url);
  return { ok: true, url };
}

// ─── Shop Info ───────────────────────────────────────────────────────

async function getShopInfo(contaId) {
  const conta = getConta(contaId);
  if (!conta) return null;
  // Retorna info já salva no token (sem precisar de chamada extra)
  if (conta.shop_name) return { shop_id: conta.shop_id, shop_name: conta.shop_name, region: conta.region };

  try {
    const data = await _apiGet(contaId, '/api/shop/get_authorized_shop');
    const shop = data?.shops?.[0] || data?.shop || {};
    const nome = shop.shop_name || shop.name || conta.nome || 'TikTok Shop';
    salvarConta({ ...conta, shop_name: nome, shop_id: shop.shop_id || conta.shop_id, shop_cipher: shop.cipher || conta.shop_cipher });
    return { shop_id: shop.shop_id, shop_name: nome, region: shop.region || 'BR' };
  } catch(e) {
    console.warn('[TikTok] getShopInfo:', e.message);
    return { shop_id: conta.shop_id, shop_name: conta.nome || 'TikTok Shop', region: 'BR' };
  }
}

// ─── Anúncios (Produtos) ─────────────────────────────────────────────

async function importarTodosAnuncios(contaId, onProgresso) {
  const db = require('./database');
  let total = 0, importados = 0;
  const STATUS_LIST = ['ACTIVATE', 'SELLER_DEACTIVATED', 'PLATFORM_DEACTIVATED'];

  for (const status of STATUS_LIST) {
    let pageCursor = '';
    do {
      const params = { page_size: 100, status };
      if (pageCursor) params.page_token = pageCursor;

      let data;
      try { data = await _apiGet(contaId, '/api/product/search_items', params); }
      catch(e) { console.warn(`[TikTok] listar produtos status=${status}:`, e.message); break; }

      const products = data?.products || data?.items || [];
      total += products.length;
      if (onProgresso) onProgresso(importados, total);

      if (products.length) {
        // Busca detalhes em lote (max 20 por vez)
        const ids = products.map(p => p.id || p.product_id).filter(Boolean);
        for (let i = 0; i < ids.length; i += 20) {
          const lote = ids.slice(i, i + 20);
          try {
            const det = await _apiPost(contaId, '/api/product/get_product_list', { product_ids: lote });
            const detalhes = det?.products || lote.map(id => products.find(p => (p.id||p.product_id) === id)).filter(Boolean);
            const itens = detalhes.map(p => _mapearAnuncio(p, status));
            db.mktAnuncios.salvarLote(contaId, 'tiktok', itens);
            importados += itens.length;
            if (onProgresso) onProgresso(importados, total);
          } catch(e) {
            // Fallback: salvar sem detalhe
            const itens = lote.map(id => {
              const p = products.find(px => (px.id||px.product_id) === id) || { id };
              return _mapearAnuncio(p, status);
            });
            db.mktAnuncios.salvarLote(contaId, 'tiktok', itens);
            importados += itens.length;
          }
        }
      }

      pageCursor = data?.next_page_token || data?.page_token || '';
    } while (pageCursor);
  }

  return { importados, total };
}

function _mapearAnuncio(p, statusOverride) {
  const statusMap = { ACTIVATE: 'NORMAL', SELLER_DEACTIVATED: 'UNLIST', PLATFORM_DEACTIVATED: 'BANNED' };
  const preco   = p.skus?.[0]?.price?.sale_price || p.skus?.[0]?.price?.original_price || 0;
  const estoque = (p.skus || []).reduce((s, sk) => s + (sk.stock?.available_stock || sk.available_stock || 0), 0);
  const itemId  = String(p.id || p.product_id || '');

  return {
    item_id:    itemId,
    nome:       p.title || p.name || p.product_name || '',
    status:     statusMap[statusOverride || p.status] || 'NORMAL',
    preco:      Number(preco),
    estoque,
    vendas:     p.sales || 0,
    rating:     null,
    imagem_url: p.images?.[0]?.url_list?.[0] || p.main_images?.[0]?.url || p.image?.url_list?.[0] || '',
    dados_json: JSON.stringify({ ...p, item_status: statusMap[statusOverride || p.status] || 'NORMAL' }),
  };
}

// ─── Pedidos ─────────────────────────────────────────────────────────

const STATUS_PEDIDO_MAP = {
  UNPAID:              'emitir',
  AWAITING_SHIPMENT:   'emitir',
  AWAITING_COLLECTION: 'em_separacao',
  IN_TRANSIT:          'enviado',
  DELIVERED:           'enviado',
  COMPLETED:           'finalizado',
  CANCELLED:           'cancelado',
};

async function importarPedidos(contaId, diasAtras = 30) {
  const db   = require('./database');
  const agora = Math.floor(Date.now() / 1000);
  const inicio = agora - (diasAtras * 86400);
  const allOrders = [];

  for (const status of Object.keys(STATUS_PEDIDO_MAP)) {
    let pageCursor = '';
    do {
      const params = { order_status: status, create_time_from: String(inicio), create_time_to: String(agora), page_size: 50 };
      if (pageCursor) params.cursor = pageCursor;

      let data;
      try { data = await _apiPost(contaId, '/api/order/search', params); }
      catch(e) { console.warn(`[TikTok] listar pedidos status=${status}:`, e.message); break; }

      const orders = data?.orders || data?.order_list || [];
      if (orders.length) {
        const ids = orders.map(o => o.order_id || o.id).filter(Boolean);
        const detalhes = await _getDetalhesPedidos(contaId, ids);
        allOrders.push(...detalhes);
      }

      pageCursor = data?.next_cursor || '';
    } while (pageCursor);
  }

  if (!allOrders.length) return { importados: 0 };
  db.mktPedidos.salvarLote(contaId, 'tiktok', allOrders.map(_mapearPedido));
  return { importados: allOrders.length };
}

async function _getDetalhesPedidos(contaId, orderIds) {
  const todos = [];
  for (let i = 0; i < orderIds.length; i += 50) {
    const lote = orderIds.slice(i, i + 50);
    try {
      const data = await _apiPost(contaId, '/api/order/detail/query', { order_id_list: lote });
      todos.push(...(data?.order_list || data?.orders || []));
    } catch(e) { console.warn('[TikTok] detalhe pedidos:', e.message); }
  }
  return todos;
}

function _mapearPedido(o) {
  const addr  = o.recipient_address || o.shipping_address || {};
  const itens = (o.items || o.item_list || []).map(i => ({
    marketplace_anuncio_id: String(i.product_id || i.item_id || ''),
    sku_marketplace:        i.seller_sku || i.sku_id || '',
    variation_id:           String(i.sku_id || ''),
    variation_descricao:    i.sku_name || '',
    produto_nome:           i.product_name || i.title || '',
    produto_sku:            i.seller_sku || '',
    quantidade:             i.quantity || 1,
    quantidade_conferida:   0,
    preco_unitario:         Number(i.sale_price || i.original_price || 0),
    thumbnail_url:          i.product_image || i.image_url || '',
    nao_mapeado:            true,
  }));

  const distritos = (addr.district_info || []).map(d => d.address_name).filter(Boolean);

  return {
    pedido_id:        o.order_id || o.id,
    status_shopee:    o.status   || o.order_status,
    status_pagamento: o.payment_info?.payment_method_name ? 'paid' : 'pending',
    cliente_nome:     addr.name  || o.buyer_uid || 'Cliente TikTok',
    cliente_telefone: addr.phone_number || addr.phone || '',
    endereco_entrega: addr.full_address || distritos.join(', ') || '',
    cliente_cidade:   distritos[1] || '',
    cliente_estado:   distritos[0] || '',
    valor_total:      Number(o.payment_info?.total_amount || o.total_amount || 0),
    valor_produtos:   Number(o.payment_info?.sub_total    || 0),
    valor_frete:      Number(o.payment_info?.shipping_fee || 0),
    valor_desconto:   Number(o.payment_info?.platform_discount || 0),
    transportadora:   o.shipping_provider || o.delivery_option_name || '',
    metodo_envio:     o.delivery_option_name || '',
    codigo_rastreio:  o.tracking_number || '',
    shipping_id:      o.package_id || '',
    data_pedido:      o.create_time ? new Date(o.create_time * 1000).toISOString() : null,
    data_prazo_envio: o.ship_by_date ? new Date(o.ship_by_date * 1000).toISOString().split('T')[0] : null,
    itens,
    dados_raw:        o,
    _status_base44:   STATUS_PEDIDO_MAP[o.status || o.order_status] || 'emitir',
  };
}

async function buscarPedidosNovos(contaId) {
  const db     = require('./database');
  const ultima = db.mktPedidos.getUltimaData(contaId);
  const inicio = ultima ? Math.floor(new Date(ultima).getTime() / 1000) : Math.floor(Date.now() / 1000) - 86400;
  const agora  = Math.floor(Date.now() / 1000);
  const allOrders = [];

  for (const status of ['UNPAID', 'AWAITING_SHIPMENT', 'AWAITING_COLLECTION']) {
    try {
      const data = await _apiPost(contaId, '/api/order/search', {
        order_status: status, create_time_from: String(inicio), create_time_to: String(agora), page_size: 50,
      });
      const orders = data?.orders || data?.order_list || [];
      if (orders.length) {
        const ids = orders.map(o => o.order_id || o.id).filter(Boolean);
        const detalhes = await _getDetalhesPedidos(contaId, ids);
        allOrders.push(...detalhes);
      }
    } catch(e) { console.warn('[TikTok] buscarNovos:', e.message); }
  }

  if (!allOrders.length) return { novos: 0 };
  db.mktPedidos.salvarLote(contaId, 'tiktok', allOrders.map(_mapearPedido));
  return { novos: allOrders.length };
}

module.exports = {
  listarContas, getConta, salvarConta,
  conectar, trocarCodigo, getShopInfo,
  importarTodosAnuncios, importarPedidos, buscarPedidosNovos,
};
