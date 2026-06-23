const { contextBridge, ipcRenderer } = require('electron');

// Expõe API segura para o renderer (sem acesso direto ao Node)
contextBridge.exposeInMainWorld('pdv', {

  // Config
  config: {
    get: (key) => ipcRenderer.invoke('config:get', key),
    set: (key, val) => ipcRenderer.invoke('config:set', key, val),
    getAll: () => ipcRenderer.invoke('config:getAll'),
  },

  // Produtos
  produtos: {
    buscar: (query) => ipcRenderer.invoke('produtos:buscar', query),
    getById: (id) => ipcRenderer.invoke('produtos:getById', id),
    getByEan: (ean) => ipcRenderer.invoke('produtos:getByEan', ean),
    total: () => ipcRenderer.invoke('produtos:total'),
    salvar: (p) => ipcRenderer.invoke('produtos:salvar', p),
    atualizar: (id, dados) => ipcRenderer.invoke('produtos:atualizar', id, dados),
  },

  // Clientes
  clientes: {
    buscar: (query) => ipcRenderer.invoke('clientes:buscar', query),
    getById: (id) => ipcRenderer.invoke('clientes:getById', id),
    salvar: (c) => ipcRenderer.invoke('clientes:salvar', c),
    credito: (id) => ipcRenderer.invoke('clientes:credito', id),
  },

  // Vendedores
  vendedores: {
    getByCodigo: (codigo) => ipcRenderer.invoke('vendedores:getByCodigo', codigo),
    listar: () => ipcRenderer.invoke('vendedores:listar'),
  },

  // Créditos Cliente (Contas a Receber)
  creditos: {
    getAbertos: (clienteRemoteId) => ipcRenderer.invoke('creditos:getAbertos', clienteRemoteId),
    resumo: (clienteRemoteId) => ipcRenderer.invoke('creditos:resumo', clienteRemoteId),
    receber: (remoteId, valorPago, saldoAtual, obs) =>
      ipcRenderer.invoke('creditos:receber', remoteId, valorPago, saldoAtual, obs),
    criarCredito: (clienteRemoteId, nome, tel, valor, obs) =>
      ipcRenderer.invoke('creditos:criar', clienteRemoteId, nome, tel, valor, obs),
  },

  // Vendas
  vendas: {
    registrar: (v) => ipcRenderer.invoke('vendas:registrar', v),
    listar: (f) => ipcRenderer.invoke('vendas:listar', f),
    getById: (id) => ipcRenderer.invoke('vendas:getById', id),
    cancelar: (id, motivo) => ipcRenderer.invoke('vendas:cancelar', id, motivo),
    totaisHoje: () => ipcRenderer.invoke('vendas:totaisHoje'),
    listarCloud: (data) => ipcRenderer.invoke('vendas:listarCloud', data),
  },

  // Estoque
  estoque: {
    get: (id) => ipcRenderer.invoke('estoque:get', id),
    movimentar: (m) => ipcRenderer.invoke('estoque:movimentar', m),
    alertas: () => ipcRenderer.invoke('estoque:alertas'),
  },

  // Faltas
  faltas: {
    registrar: (f) => ipcRenderer.invoke('faltas:registrar', f),
    listar: (filtros) => ipcRenderer.invoke('faltas:listar', filtros),
    atualizarStatus: (id, status) => ipcRenderer.invoke('faltas:atualizarStatus', id, status),
    contarPendentes: () => ipcRenderer.invoke('faltas:contarPendentes'),
  },

  // Sync
  sync: {
    status: () => ipcRenderer.invoke('sync:status'),
    now: () => ipcRenderer.invoke('sync:now'),
    pendentes: () => ipcRenderer.invoke('sync:pendentes'),
    onUpdate: (cb) => ipcRenderer.on('sync:update', (_, data) => cb(data)),
  },

  // Auth
  auth: {
    login: (u, s) => ipcRenderer.invoke('auth:login', u, s),
    logout: () => ipcRenderer.invoke('auth:logout'),
  },

  // Impressão
  print: {
    local:         (dados)  => ipcRenderer.invoke('print:local', dados),
    servidor:      (dados)  => ipcRenderer.invoke('print:servidor', dados),
    serverStart:   (porta)  => ipcRenderer.invoke('print:server:start', porta),
    serverStop:    ()       => ipcRenderer.invoke('print:server:stop'),
    serverStatus:  ()       => ipcRenderer.invoke('print:server:status'),
    listar:        ()       => ipcRenderer.invoke('print:listar'),
  },

  // Atualização
  update: {
    check:   () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    onStatus: (cb) => ipcRenderer.on('update:status', (_, data) => cb(data)),
  },

  // App
  app: {
    version: () => ipcRenderer.invoke('app:version'),
    reload: () => ipcRenderer.invoke('app:reload'),
    minimize: () => ipcRenderer.invoke('app:minimize'),
    maximize: () => ipcRenderer.invoke('app:maximize'),
    close: () => ipcRenderer.invoke('app:close'),
    confirm: (msg) => ipcRenderer.invoke('dialog:confirm', msg),
  }
});
