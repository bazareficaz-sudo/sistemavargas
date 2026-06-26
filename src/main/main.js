const { app, BrowserWindow, ipcMain, Menu, Tray, dialog, nativeTheme } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store();
let mainWindow;
let tray;

// ─── Imports internos ───────────────────────────────────────────
const db = require('./database');
const sync = require('./sync');
const api = require('./api');
const printServer = require('./print-server');
const tunnel = require('./tunnel');
const updater = require('./updater');
const focusnfe = require('./focusnfe');
const ia = require('./ia');

nativeTheme.themeSource = 'dark';

// ─── Criar janela principal ──────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    sync.startAutoSync(mainWindow);
    // Auto-iniciar servidor de impressão se configurado como CAIXA
    if (store.get('config.print_server_ativo') === true) {
      const porta = store.get('config.print_server_porta') || 3001;
      printServer.start(porta);
    }
    // Atualização automática (só em produção — não no dev)
    if (app.isPackaged) {
      updater.init(mainWindow);
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── System Tray ────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '../../assets/icon.png');
  const fs = require('fs');
  if (!fs.existsSync(iconPath)) return;
  tray = new Tray(iconPath);
  const menu = Menu.buildFromTemplate([
    { label: 'PDV Vargas', enabled: false },
    { type: 'separator' },
    { label: 'Abrir PDV', click: () => mainWindow?.show() },
    { label: 'Sincronizar agora', click: () => sync.syncNow(mainWindow) },
    { type: 'separator' },
    { label: 'Sair', click: () => app.quit() }
  ]);
  tray.setToolTip('PDV Vargas');
  tray.setContextMenu(menu);
  tray.on('double-click', () => mainWindow?.show());
}

// ─── App lifecycle ───────────────────────────────────────────────
app.whenReady().then(() => {
  db.initialize();
  createWindow();
  createTray();
  app.on('activate', () => { if (!mainWindow) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC Handlers ────────────────────────────────────────────────

// Config / Auth
ipcMain.handle('config:get', (_, key) => store.get(key));
ipcMain.handle('config:set', (_, key, val) => store.set(key, val));
ipcMain.handle('config:getAll', () => store.store);

// Produtos
ipcMain.handle('produtos:buscar', (_, query) => db.produtos.buscar(query));
ipcMain.handle('produtos:buscarGestao', (_, query) => db.produtos.buscarGestao(query));
ipcMain.handle('produtos:getById', (_, id) => db.produtos.getById(id));
ipcMain.handle('produtos:getByEan', (_, ean) => db.produtos.getByEan(ean));
ipcMain.handle('produtos:total', () => db.produtos.total());
ipcMain.handle('produtos:salvar', (_, produto) => db.produtos.salvar(produto));
ipcMain.handle('produtos:atualizar', (_, id, dados) => db.produtos.atualizar(id, dados));

// Clientes
ipcMain.handle('clientes:buscar', (_, query) => db.clientes.buscar(query));
ipcMain.handle('clientes:getById', (_, id) => db.clientes.getById(id));
ipcMain.handle('clientes:salvar', (_, cliente) => db.clientes.salvar(cliente));
ipcMain.handle('clientes:credito', (_, clienteId) => db.clientes.getCredito(clienteId));

// Vendedores
ipcMain.handle('vendedores:getByCodigo', (_, codigo) => db.vendedores.getByCodigo(codigo));
ipcMain.handle('vendedores:listar', () => db.vendedores.listar());

// Créditos Cliente (Contas a Receber)
ipcMain.handle('creditos:getAbertos', (_, clienteRemoteId) =>
  db.creditosCliente.getAbertosDoCliente(clienteRemoteId)
);
ipcMain.handle('creditos:resumo', (_, clienteRemoteId) =>
  db.creditosCliente.resumoPorCliente(clienteRemoteId)
);
ipcMain.handle('creditos:criar', async (_, clienteRemoteId, clienteNome, clienteTelefone, valor, observacao) => {
  const usuario = store.get('auth.usuario') || {};
  const payload = {
    empresa_id: usuario.empresa_estoque_id || usuario.empresa_id || store.get('auth.empresa_id'),
    cliente_id: clienteRemoteId,
    cliente_nome: clienteNome || null,
    cliente_telefone: clienteTelefone || null,
    valor_original: valor,
    saldo_atual: valor,
    status: 'aberto',
    origem: 'devolucao',
    observacao: observacao || null,
  };
  try {
    const res = await api.post('/entities/CreditoCliente', payload);
    if (res?.id) db.creditosCliente.upsertBatch([{ ...payload, id: res.id }]);
    return res;
  } catch (err) {
    console.error('[CREDITO] Erro ao criar crédito de devolução:', err.message);
    // Salva local mesmo se Base44 falhar
    db.creditosCliente.upsertBatch([{ ...payload, id: require('uuid').v4() }]);
  }
});

ipcMain.handle('creditos:receber', async (_, remoteId, valorPago, saldoAtual, observacao) => {
  const novoSaldo = Math.max(0, saldoAtual - valorPago);
  const novoStatus = novoSaldo <= 0 ? 'usado_totalmente' : 'usado_parcialmente';
  // Atualizar local imediatamente
  db.creditosCliente.atualizarSaldo(remoteId, novoSaldo, novoStatus);
  // Sincronizar com Base44
  try {
    await api.receberCreditoCliente(remoteId, novoSaldo, novoStatus, observacao);
  } catch (err) {
    console.error('[CREDITO] Erro ao sincronizar recebimento:', err.message);
  }
  return { novoSaldo, novoStatus };
});

// Vendas
ipcMain.handle('vendas:registrar', (_, venda) => {
  const terminalId = store.get('config.terminal_id') || '';
  const match = terminalId.match(/(\d+)$/);
  const terminalNum = match ? parseInt(match[1], 10) : 0;
  venda._numero_base = terminalNum * 100000; // PDV-001 → 100000, PDV-002 → 200000
  const result = db.vendas.registrar(venda);
  // Enviar só a fila — sem re-baixar catálogo inteiro
  setImmediate(() => sync.syncFila(mainWindow));
  return result;
});
ipcMain.handle('vendas:listar', (_, filtros) => db.vendas.listar(filtros));
ipcMain.handle('vendas:getById', (_, id) => db.vendas.getById(id));
ipcMain.handle('vendas:cancelar', (_, id, motivo) => db.vendas.cancelar(id, motivo));
ipcMain.handle('vendas:editar', async (_, id, novosItens, novosDados) => {
  const vendaAtualizada = db.vendas.editar(id, novosItens, novosDados);
  // Re-sincronizar com Base44 se tiver remote_id
  if (vendaAtualizada?.remote_id) {
    try {
      await api.editarVenda(vendaAtualizada.remote_id, novosItens, novosDados, novosDados.forma_pagamento);
    } catch (err) {
      console.warn('[VENDA] Erro ao sincronizar edição:', err.message);
    }
  }
  setImmediate(() => sync.syncFila(mainWindow));
  return vendaAtualizada;
});
ipcMain.handle('vendas:totaisHoje', () => db.vendas.totaisHoje());
ipcMain.handle('vendas:listarCloud', (_, data) => api.listarVendasCloud(data));

// Estoque
ipcMain.handle('estoque:get', (_, produtoId) => db.estoque.get(produtoId));
ipcMain.handle('estoque:movimentar', (_, mov) => db.estoque.movimentar(mov));
ipcMain.handle('estoque:alertas', () => db.estoque.alertas());

// Faltas
ipcMain.handle('faltas:registrar', (_, falta) => db.faltas.registrar(falta));
ipcMain.handle('faltas:listar', (_, filtros) => db.faltas.listar(filtros));
ipcMain.handle('faltas:atualizarStatus', (_, id, status) => db.faltas.atualizarStatus(id, status));
ipcMain.handle('faltas:contarPendentes', () => db.faltas.contarPendentes());

// IA
ipcMain.handle('ia:fiscal', async (_, nome, categoria, unidade) => ia.sugerirFiscal(nome, categoria, unidade));
ipcMain.handle('ia:descricao', async (_, nome, categoria, marca, unidade) => ia.gerarDescricao(nome, categoria, marca, unidade));
ipcMain.handle('ia:lote', async (_, produtos) => ia.enriquecerLote(produtos));
ipcMain.handle('ia:status', () => ({ configurado: !!ia.getApiKey() }));

// Sync
ipcMain.handle('sync:status', () => sync.getStatus());
ipcMain.handle('sync:now', async () => {
  const result = await sync.syncNow(mainWindow);
  return result;
});
ipcMain.handle('sync:fullProdutos', async () => {
  // Sobe alterações locais ANTES de limpar o timestamp e re-baixar tudo
  const Store = require('electron-store');
  const s = new Store();
  await sync.syncUpProdutos();
  s.delete('sync.ultima_sync_produtos');
  return await sync.syncNow(mainWindow);
});
ipcMain.handle('sync:pendentes', () => db.sync.getPendentes());

// Auth
ipcMain.handle('auth:login', async (_, login, senha) => {
  return await api.autenticarPDV(login, senha);
});
ipcMain.handle('auth:logout', () => {
  store.delete('auth.token');
  store.delete('auth.usuario');
});

// Impressão
ipcMain.handle('print:local', async (_, dados) => {
  return printServer.adicionarNaFila(dados);
});
ipcMain.handle('print:servidor', async (_, dados) => {
  try {
    return await printServer.enviarParaServidor(dados);
  } catch (err) {
    return { erro: err.message };
  }
});
ipcMain.handle('print:server:start', (_, porta) => {
  const p = porta || store.get('config.print_server_porta') || 3001;
  return printServer.start(p);
});
ipcMain.handle('print:server:stop', () => {
  printServer.stop();
  return { ok: true };
});
ipcMain.handle('print:server:status', () => ({
  rodando: printServer.isRunning(),
  porta: store.get('config.print_server_porta') || 3001,
}));
ipcMain.handle('print:listar', async () => {
  return printServer.listarImpressoras(mainWindow);
});
ipcMain.handle('print:ping', async (_, url) => {
  try {
    const pingUrl = url.startsWith('http://') || url.startsWith('https://')
      ? url.replace(/\/$/, '') + '/ping'
      : `http://${url}/ping`;
    const res = await require('node-fetch')(pingUrl, { timeout: 5000 });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
});

// Carteira de Clientes
ipcMain.handle('carteira:resumo', () => db.creditosCliente.resumoGeral());
ipcMain.handle('carteira:listar', (_, query) => db.creditosCliente.listarCarteira(query || ''));
ipcMain.handle('carteira:ultimoPgto', (_, remoteId) => db.creditosCliente.ultimoPagamento(remoteId));
ipcMain.handle('carteira:contasAbertas', (_, clienteRemoteId) => db.contasReceber.getContasAbertas(clienteRemoteId));
ipcMain.handle('carteira:pagar', async (_, contaId, forma, obs) => {
  db.contasReceber.marcarPago(contaId, forma, obs);
  try {
    await api.pagarContaReceber(contaId, forma, obs);
    return { ok: true };
  } catch (err) {
    return { ok: true, offline: true };
  }
});

ipcMain.handle('carteira:pagarParcial', async (_, contaId, valorPago, valorOriginal, forma, obs) => {
  const valorRestante = Math.round((valorOriginal - valorPago) * 100) / 100;
  const obsCompleta = `Pgto parcial R$ ${valorPago.toFixed(2)} (${forma})${obs ? ' — ' + obs : ''}`;
  db.contasReceber.atualizarValor(contaId, valorRestante, obsCompleta);
  try {
    await api.pagarContaReceberParcial(contaId, valorPago, valorOriginal, forma, obs);
    return { ok: true, valorRestante };
  } catch (err) {
    return { ok: true, offline: true, valorRestante };
  }
});

ipcMain.handle('carteira:usarCredito', async (_, contaId, contaValor, creditoId, creditoSaldo, obs) => {
  try {
    const resultado = await api.usarCreditoEmConta(contaId, contaValor, creditoId, creditoSaldo, 'credito_loja', obs);
    if (resultado.quitou) {
      db.contasReceber.marcarPago(contaId, 'credito_loja', obs || 'Pago com crédito loja');
    } else {
      db.contasReceber.atualizarValor(contaId, resultado.valorRestante, `Crédito loja aplicado`);
    }
    // Atualizar saldo do crédito localmente
    if (resultado.saldoCreditoRestante <= 0) {
      db.creditosCliente.marcarUsado(creditoId);
    }
    return { ok: true, ...resultado };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
});

// Entregas
ipcMain.handle('entregas:salvar', async (_, entrega) => {
  const cfgAll = store.store;
  const usuario = cfgAll?.auth?.usuario;
  entrega.empresa_id = entrega.empresa_id || cfgAll?.auth?.empresa_id || '';
  entrega.terminal_id = entrega.terminal_id || store.get('config.terminal_id') || 'PDV-001';
  entrega.criado_por = entrega.criado_por || usuario?.nome || 'operador';
  const local = db.entregas.salvar(entrega);
  try {
    const remote = await api.registrarEntrega(local);
    if (remote?.id) db.entregas.atualizar(local.id, { remote_id: remote.id, sync_status: 'synced', synced_at: new Date().toISOString() });
    return { ok: true, id: local.id, remote_id: remote?.id };
  } catch (err) {
    console.warn('[ENTREGA] Offline — salvo local:', err.message);
    return { ok: true, id: local.id, offline: true };
  }
});

ipcMain.handle('entregas:listar', async (_, filtros) => {
  const empresa_id = store.get('auth.empresa_id') || '';
  try {
    const remotas = await api.listarEntregasRemoto(empresa_id, filtros?.status || null);
    for (const r of remotas) db.entregas.upsertRemote(r);
  } catch {}
  return db.entregas.listar({ empresa_id, ...(filtros || {}) });
});

ipcMain.handle('entregas:atualizar', async (_, id, dados) => {
  db.entregas.atualizar(id, dados);
  const entrega = db.entregas.getById(id);
  if (entrega?.remote_id) {
    try { await api.atualizarEntrega(entrega.remote_id, dados); } catch {}
  }
  return { ok: true };
});

ipcMain.handle('entregas:getById', (_, id) => db.entregas.getById(id));

// Cloudflare Tunnel
ipcMain.handle('tunnel:start', async (_, porta) => {
  return tunnel.start(porta || store.get('config.print_server_porta') || 3001, (status) => {
    mainWindow?.webContents.send('tunnel:status', status);
  });
});
ipcMain.handle('tunnel:stop', () => { tunnel.stop(); return { ok: true }; });
ipcMain.handle('tunnel:status', () => tunnel.getStatus());

// NFC-e / FocusNFe
ipcMain.handle('nfce:emitir', async (_, venda) => {
  try {
    // Enriquecer itens com dados fiscais do produto local (NCM, CFOP, CSTs)
    if (venda.itens && venda.itens.length) {
      venda.itens = venda.itens.map(item => {
        const prod = item.produto_id
          ? db.db().prepare('SELECT ncm, cfop, icms_cst, icms_origem, pis_cst, cofins_cst, unidade FROM produtos WHERE id = ? OR remote_id = ?').get(item.produto_id, item.produto_id)
          : null;
        return {
          ...item,
          ncm:        (prod?.ncm        || item.ncm        || '').replace(/\D/g, ''),
          cfop:       prod?.cfop        || item.cfop        || '5102',
          icms_cst:   prod?.icms_cst    || item.icms_cst    || '400',
          icms_origem:prod?.icms_origem ?? item.icms_origem ?? 0,
          pis_cst:    prod?.pis_cst     || item.pis_cst     || '07',
          cofins_cst: prod?.cofins_cst  || item.cofins_cst  || '07',
          unidade:    prod?.unidade     || item.unidade      || 'UN',
        };
      });
    }
    return await focusnfe.emitirNFCe(venda);
  } catch (err) {
    return { ok: false, erro: err.message };
  }
});
ipcMain.handle('nfce:consultar', async (_, reference) => {
  try {
    return await focusnfe.consultarNFCe(reference);
  } catch (err) {
    return { ok: false, erro: err.message };
  }
});
ipcMain.handle('nfce:cancelar', async (_, reference, justificativa) => {
  try {
    return await focusnfe.cancelarNFCe(reference, justificativa);
  } catch (err) {
    return { ok: false, erro: err.message };
  }
});
ipcMain.handle('nfce:danfe', async (_, reference) => {
  try {
    return await focusnfe.obterDanfe(reference);
  } catch (err) {
    return { ok: false, erro: err.message };
  }
});

// Atualização
ipcMain.handle('update:check', () => updater.checarAgora());
ipcMain.handle('update:install', () => updater.instalarAgora());

// Sistema
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:reload', () => mainWindow?.reload());
ipcMain.handle('app:minimize', () => mainWindow?.minimize());
ipcMain.handle('app:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle('app:close', () => mainWindow?.close());

ipcMain.handle('dialog:confirm', async (_, msg) => {
  const res = await dialog.showMessageBox(mainWindow, {
    type: 'question', buttons: ['Cancelar', 'Confirmar'],
    title: 'Confirmação', message: msg
  });
  return res.response === 1;
});
