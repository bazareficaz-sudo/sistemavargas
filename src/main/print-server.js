/**
 * print-server.js — Servidor de impressão local em rede
 *
 * CAIXA: inicia servidor HTTP na porta configurada, recebe jobs e imprime localmente.
 * Terminais de venda: POST /imprimir para o IP do CAIXA.
 */

const http = require('http');
const { BrowserWindow } = require('electron');
const Store = require('electron-store');
const fetch = require('node-fetch');

const store = new Store();

let server = null;
const fila = [];
let imprimindo = false;

// ─── Geração do HTML do cupom ────────────────────────────────────────────────

function gerarHtmlCupom(dados) {
  const { numero, empresa_nome, vendedor_nome, cliente_nome, itens = [],
          subtotal = 0, desconto = 0, total = 0, forma_pagamento = '',
          valor_pago = 0, troco = 0, created_at } = dados;

  const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const data = created_at ? new Date(created_at).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR');

  const linhas = itens.map(i => {
    const qtd = Number(i.quantidade || 0);
    const preco = Number(i.preco_unitario || 0);
    const sub = Number(i.subtotal || i.total || 0);
    return `
      <tr>
        <td colspan="2" style="padding-top:4px">${i.produto_nome}</td>
      </tr>
      <tr>
        <td style="color:#555">${Math.abs(qtd)} x R$ ${fmt(preco)}</td>
        <td style="text-align:right;font-weight:bold">R$ ${fmt(Math.abs(sub))}</td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @page { size: 72mm auto; margin: 4mm 3mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 9.5pt;
    color: #000;
    background: #fff;
    width: 72mm;
    margin: 0;
    padding: 0;
  }
  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: bold; }
  .sm     { font-size: 8pt; }
  .lg     { font-size: 13pt; }
  .sep    { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  table   { width: 100%; border-collapse: collapse; }
  td      { vertical-align: top; padding: 1px 0; }
  .total-row td { font-size: 12pt; font-weight: bold; padding-top: 6px; }
</style>
</head>
<body>
  <div class="center bold lg">${empresa_nome || 'PDV VARGAS'}</div>
  <div class="center sm">Venda #${numero}</div>
  <div class="center sm">${data}</div>
  ${vendedor_nome ? `<div class="center sm">Vendedor: ${vendedor_nome}</div>` : ''}
  ${cliente_nome  ? `<div class="center sm">Cliente: ${cliente_nome}</div>`   : ''}
  <hr class="sep">

  <table>${linhas}</table>
  <hr class="sep">

  ${desconto > 0 ? `
  <table><tr>
    <td>Subtotal</td><td class="right">R$ ${fmt(subtotal)}</td>
  </tr><tr>
    <td>Desconto</td><td class="right">- R$ ${fmt(desconto)}</td>
  </tr></table>` : ''}

  <table class="total-row"><tr>
    <td>TOTAL</td><td class="right">R$ ${fmt(Math.abs(total))}</td>
  </tr></table>

  <div style="margin-top:6px;font-size:9pt">
    Pagamento: <strong>${(forma_pagamento || '').toUpperCase()}</strong>
    ${valor_pago > 0 ? `<br>Recebido: R$ ${fmt(valor_pago)}` : ''}
    ${troco > 0     ? `<br>Troco: R$ ${fmt(troco)}`         : ''}
  </div>

  <hr class="sep">
  <div class="center sm" style="margin-top:4px">Obrigado pela preferência!</div>
</body>
</html>`;
}

// ─── Impressão local (via Electron) ─────────────────────────────────────────

async function imprimirLocal(dados) {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      show: false,
      width: 320,
      height: 800,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(gerarHtmlCupom(dados)));

    win.webContents.once('did-finish-load', () => {
      const nomePrinter = store.get('config.impressora_nome') || '';
      const opts = {
        silent: true,
        printBackground: false,
        color: false,
        margins: { marginType: 'none' },
        pageSize: { width: 72000, height: 999000 }, // microns — 72mm × comprimento auto
        scaleFactor: 100,
      };
      if (nomePrinter) opts.deviceName = nomePrinter;

      win.webContents.print(opts, (success, failureReason) => {
        win.destroy();
        if (success) {
          console.log('[PRINT] Impresso com sucesso');
        } else {
          console.warn('[PRINT] Falha:', failureReason);
        }
        resolve({ success, failureReason: failureReason || null });
      });
    });

    win.webContents.once('did-fail-load', (_, code, desc) => {
      win.destroy();
      resolve({ success: false, failureReason: desc });
    });
  });
}

// ─── Fila de impressão ───────────────────────────────────────────────────────

async function processarFila() {
  if (imprimindo || fila.length === 0) return;
  imprimindo = true;
  const job = fila.shift();
  try {
    await imprimirLocal(job);
  } catch (e) {
    console.warn('[PRINT] Erro no job:', e.message);
  }
  imprimindo = false;
  if (fila.length > 0) setImmediate(processarFila);
}

function adicionarNaFila(dados) {
  fila.push(dados);
  processarFila();
}

// ─── Servidor HTTP (modo CAIXA) ──────────────────────────────────────────────

function start(port) {
  if (server) return { ok: true, ja_rodando: true };
  port = port || store.get('config.print_server_porta') || 3001;

  server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'GET' && req.url === '/ping') {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, fila: fila.length, imprimindo }));
      return;
    }

    if (req.method === 'POST' && req.url === '/imprimir') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const dados = JSON.parse(body);
          adicionarNaFila(dados);
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true, posicao_fila: fila.length }));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ erro: e.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ erro: 'Rota não encontrada' }));
  });

  server.on('error', (err) => {
    console.error('[PRINT SERVER] Erro ao iniciar:', err.message);
    server = null;
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[PRINT SERVER] Ativo em 0.0.0.0:${port}`);
  });

  return { ok: true, porta: port };
}

function stop() {
  if (!server) return;
  server.close(() => console.log('[PRINT SERVER] Encerrado'));
  server = null;
}

function isRunning() { return !!server; }

// ─── Envio para servidor remoto (terminais de venda) ─────────────────────────

async function enviarParaServidor(dados) {
  const ip = store.get('config.print_server_ip') || '';
  if (!ip) throw new Error('IP do servidor de impressão não configurado');
  // Aceita URL completa (tunnel Cloudflare) ou IP:porta local
  const url = ip.startsWith('http://') || ip.startsWith('https://')
    ? ip.replace(/\/$/, '') + '/imprimir'
    : `http://${ip}/imprimir`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
    timeout: 6000,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Servidor retornou ${res.status}: ${txt}`);
  }
  return res.json();
}

async function listarImpressoras(win) {
  if (!win) return [];
  try {
    const lista = await win.webContents.getPrintersAsync();
    return lista.map(p => ({ name: p.name, descricao: p.description || p.name, padrao: p.isDefault }));
  } catch {
    return [];
  }
}

module.exports = {
  start, stop, isRunning,
  imprimirLocal, adicionarNaFila,
  enviarParaServidor,
  listarImpressoras,
  gerarHtmlCupom,
};
