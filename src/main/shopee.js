/**
 * shopee.js — Integração com Shopee Open Platform API v2
 */

const crypto  = require('crypto');
const fetch   = require('node-fetch');
const http    = require('http');
const { shell } = require('electron');
const Store   = require('electron-store');

const store = new Store();

const PROD_HOST = 'https://partner.shopeemobile.com';
const TEST_HOST = 'https://partner.test-stable.shopeemobile.com';
const CALLBACK_PORT = 3003;
const REDIRECT_URL  = `http://localhost:${CALLBACK_PORT}/callback`;

let _authServer = null;

// ─── Helpers ────────────────────────────────────────────────────────

function host() {
  return store.get('shopee.sandbox') ? TEST_HOST : PROD_HOST;
}

function creds() {
  return {
    partnerId:  Number(store.get('shopee.partner_id')  || 0),
    partnerKey: String(store.get('shopee.partner_key') || ''),
  };
}

function sign(path, ts, accessToken = '', shopId = '') {
  const { partnerId, partnerKey } = creds();
  const base = `${partnerId}${path}${ts}${accessToken}${String(shopId)}`;
  return crypto.createHmac('sha256', partnerKey).update(base).digest('hex');
}

async function apiGet(path, extra = {}) {
  const { partnerId } = creds();
  const accessToken = store.get('shopee.access_token') || '';
  const shopId      = store.get('shopee.shop_id')      || '';
  const ts = Math.floor(Date.now() / 1000);
  const s  = sign(path, ts, accessToken, shopId);
  const params = new URLSearchParams({
    partner_id:   partnerId,
    timestamp:    ts,
    sign:         s,
    access_token: accessToken,
    shop_id:      shopId,
    ...extra,
  });
  const res = await fetch(`${host()}${path}?${params}`);
  const data = await res.json();
  if (data.error && data.error !== 'error_auth') throw new Error(data.message || data.error);
  return data;
}

// ─── Credenciais ────────────────────────────────────────────────────

function salvarCredenciais(partnerId, partnerKey, sandbox = false) {
  store.set('shopee.partner_id', partnerId);
  store.set('shopee.partner_key', partnerKey);
  store.set('shopee.sandbox', sandbox);
}

function getStatus() {
  return {
    configurado: !!(store.get('shopee.partner_id') && store.get('shopee.partner_key')),
    conectado:   !!(store.get('shopee.conectado')),
    shop_id:    store.get('shopee.shop_id')    || null,
    shop_name:  store.get('shopee.shop_name')  || null,
    partner_id: store.get('shopee.partner_id') || '',
    sandbox:    store.get('shopee.sandbox')    || false,
  };
}

// ─── OAuth ──────────────────────────────────────────────────────────

async function gerarUrlAuth() {
  const { partnerId } = creds();
  if (!partnerId) throw new Error('Partner ID não configurado');
  const path = '/api/v2/shop/auth_partner';
  const ts   = Math.floor(Date.now() / 1000);
  const s    = sign(path, ts);
  return `${host()}${path}?partner_id=${partnerId}&timestamp=${ts}&sign=${s}&redirect=${encodeURIComponent(REDIRECT_URL)}`;
}

async function iniciarAuth(mainWindow) {
  // Fechar servidor anterior se existir
  if (_authServer) { try { _authServer.close(); } catch {} _authServer = null; }

  const url = await gerarUrlAuth();
  shell.openExternal(url);

  return new Promise((resolve, reject) => {
    _authServer = http.createServer(async (req, res) => {
      try {
        const reqUrl  = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
        const code    = reqUrl.searchParams.get('code');
        const shopId  = reqUrl.searchParams.get('shop_id');

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html><head><meta charset="utf-8">
          <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f0f0f;color:#fff}
          .box{text-align:center;padding:40px;background:#1a1a1a;border-radius:16px;max-width:400px}
          h2{color:#22c55e;margin-bottom:8px}p{color:#aaa;font-size:14px}</style>
        </head><body><div class="box">
          <div style="font-size:48px;margin-bottom:16px">✅</div>
          <h2>Shopee Conectada!</h2>
          <p>Pode fechar esta janela e voltar ao PDV Vargas.</p>
        </div></body></html>`);

        _authServer.close();
        _authServer = null;

        if (!code || !shopId) throw new Error('Parâmetros inválidos na resposta da Shopee');

        const tokens = await trocarToken(Number(shopId), code);
        const info   = await getShopInfo();
        if (info?.shop_name) store.set('shopee.shop_name', info.shop_name);

        resolve({ ok: true, shop_id: shopId, shop_name: info?.shop_name || `Loja ${shopId}` });
      } catch (e) {
        _authServer?.close();
        _authServer = null;
        reject(e);
      }
    });

    _authServer.on('error', (e) => { reject(e); });
    _authServer.listen(CALLBACK_PORT);
  });
}

async function trocarToken(shopId, code) {
  const { partnerId } = creds();
  const path = '/api/v2/auth/token/get';
  const ts   = Math.floor(Date.now() / 1000);
  const s    = sign(path, ts);

  const res = await fetch(
    `${host()}${path}?partner_id=${partnerId}&timestamp=${ts}&sign=${s}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ code, shop_id: shopId, partner_id: partnerId }),
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.message || data.error);

  store.set('shopee.shop_id',      String(shopId));
  store.set('shopee.access_token', data.access_token);
  store.set('shopee.refresh_token',data.refresh_token);
  store.set('shopee.token_expires', Date.now() + ((data.expire_in || 14400) * 1000));
  store.set('shopee.conectado',    true);

  return data;
}

async function desconectar() {
  store.delete('shopee.access_token');
  store.delete('shopee.refresh_token');
  store.delete('shopee.shop_id');
  store.delete('shopee.shop_name');
  store.delete('shopee.token_expires');
  store.set('shopee.conectado', false);
}

// ─── API calls ──────────────────────────────────────────────────────

async function getShopInfo() {
  const data = await apiGet('/api/v2/shop/get_shop_info');
  return data.response;
}

async function getAnuncios(page = 0) {
  const data = await apiGet('/api/v2/product/get_item_list', {
    offset:      page * 50,
    page_size:   50,
    item_status: 'NORMAL',
  });
  return data.response || { item: [], total_count: 0 };
}

async function getPedidos(status = 'READY_TO_SHIP') {
  const ts     = Math.floor(Date.now() / 1000);
  const tsFrom = ts - 30 * 86400; // últimos 30 dias
  const data   = await apiGet('/api/v2/order/get_order_list', {
    time_range_field: 'create_time',
    time_from:  tsFrom,
    time_to:    ts,
    page_size:  50,
    cursor:     '',
    order_status: status,
  });
  return data.response || { order_list: [], more: false };
}

module.exports = {
  salvarCredenciais, getStatus,
  gerarUrlAuth, iniciarAuth, desconectar,
  getShopInfo, getAnuncios, getPedidos,
};
