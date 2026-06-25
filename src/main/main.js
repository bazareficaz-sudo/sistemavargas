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
const updater = require('./updater');

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
  const payload = {
    empresa_id: '69fcc1ef22ce2c5e401104a7',
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

// Sync
ipcMain.handle('sync:status', () => sync.getStatus());
ipcMain.handle('sync:now', async () => {
  const result = await sync.syncNow(mainWindow);
  return result;
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
