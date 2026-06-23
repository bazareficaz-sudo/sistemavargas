// ─── Login ────────────────────────────────────────────────────────
const Login = {
  render() {
    return `
<div style="height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg)">
  <div style="width:360px">
    <div style="text-align:center;margin-bottom:36px">
      <img src="assets/logo.svg" alt="Sistema Vargas"
        style="width:260px;max-width:100%;height:auto;margin:0 auto 12px;display:block">
      <div style="color:var(--text2);font-size:13px;margin-top:4px">Terminal de Vendas · PDV</div>
    </div>
    <div class="card">
      <div class="form-group">
        <label class="form-label">Operador</label>
        <input class="input" id="l-user" placeholder="login do operador" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label">Senha</label>
        <input class="input" type="password" id="l-pass" placeholder="••••••••"
          onkeydown="if(event.key==='Enter')Login.doLogin()">
      </div>
      <div class="form-group">
        <label class="form-label">ID do Terminal</label>
        <input class="input" id="l-terminal" placeholder="PDV-001"
          value="${''}">
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="Login.doLogin()" id="l-btn">
        Entrar
      </button>
      <button class="btn btn-ghost" style="width:100%;margin-top:8px;font-size:12px;opacity:.6" onclick="Login.offlineMode()">
        Modo Offline (sem servidor)
      </button>
      <div id="l-error" style="color:var(--red);font-size:12px;margin-top:10px;text-align:center;display:none"></div>
    </div>
    <div style="text-align:center;margin-top:16px;font-size:11px;color:var(--text3)">
      PDV Vargas · Sistema Vargas
    </div>
  </div>
</div>`;
  },

  async doLogin() {
    const user = document.getElementById('l-user').value.trim();
    const pass = document.getElementById('l-pass').value;
    const terminal = document.getElementById('l-terminal').value.trim() || 'PDV-001';
    const errEl = document.getElementById('l-error');
    const btn = document.getElementById('l-btn');

    if (!user || !pass) { errEl.textContent = 'Informe o operador e a senha'; errEl.style.display = 'block'; return; }

    btn.disabled = true; btn.textContent = 'Autenticando...';
    errEl.style.display = 'none';

    try {
      await window.pdv.config.set('config.app_id', 'vargas');
      await window.pdv.config.set('config.terminal_id', terminal);
      const res = await window.pdv.auth.login(user, pass);
      if (res?.token) {
        await App.showApp();
        App.navigate('pdv');
      } else {
        errEl.textContent = res?.erro || 'Operador ou senha inválidos';
        errEl.style.display = 'block';
      }
    } catch (e) {
      errEl.textContent = 'Erro de conexão com o servidor.';
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false; btn.textContent = 'Entrar';
    }
  },

  async offlineMode() {
    const terminal = document.getElementById('l-terminal').value.trim() || 'PDV-001';
    await window.pdv.config.set('config.app_id', 'offline');
    await window.pdv.config.set('config.terminal_id', terminal);
    await window.pdv.config.set('auth.token', 'offline_mode');
    // offline: sem permissoes = PDV_PERMS fica null = tudo liberado
    await window.pdv.config.set('auth.usuario', { nome: 'Operador', cargo: 'PDV', permissoes: null });
    await App.showApp();
    App.navigate('pdv');
  }
};

// ─── Produtos ─────────────────────────────────────────────────────
const Produtos = {
  searchTimeout: null,

  render() {
    return `
<div class="page-header">
  <div><div class="page-title">Produtos</div><div class="page-sub" id="prod-count">Carregando...</div></div>
  <div class="page-actions">
    <input class="input" id="prod-search" placeholder="🔍 Buscar..." style="width:220px"
      oninput="Produtos.search(this.value)">
    <button class="btn btn-primary" onclick="Produtos.openForm()">+ Novo Produto</button>
  </div>
</div>
<div style="flex:1;overflow:auto">
  <div class="table-wrap">
    <table>
      <thead><tr><th style="width:52px"></th><th>Produto</th><th>SKU / EAN</th><th>Categoria</th><th>Preço</th><th>Estoque</th><th>Status</th><th></th></tr></thead>
      <tbody id="prod-tbody"><tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text3)">Carregando...</td></tr></tbody>
    </table>
  </div>
</div>`;
  },

  async init() {
    await this.load('');
    const total = await window.pdv.produtos.total();
    const el = document.getElementById('prod-count');
    if (el) el.textContent = `${total.toLocaleString('pt-BR')} produtos cadastrados`;
  },

  async load(query) {
    const produtos = await window.pdv.produtos.buscar(query);
    const tbody = document.getElementById('prod-tbody');
    if (!tbody) return;
    if (!produtos.length) {
      tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="icon">📦</div><h3>Nenhum produto encontrado</h3></div></td></tr>';
      return;
    }
    tbody.innerHTML = produtos.map(p => `
      <tr>
        <td style="padding:6px 8px">
          ${p.foto_url
            ? `<img src="${p.foto_url}" loading="lazy" onerror="this.style.display='none'" style="width:40px;height:40px;object-fit:cover;border-radius:6px;display:block">`
            : `<span style="font-size:24px;display:block;text-align:center">${p.emoji || '📦'}</span>`}
        </td>
        <td><span class="td-main">${p.nome}</span></td>
        <td class="td-mono">${p.sku || '-'}<br><span style="color:var(--text3);font-size:10px">${p.ean || ''}</span></td>
        <td>${p.categoria ? `<span class="badge badge-blue">${p.categoria}</span>` : '-'}</td>
        <td class="td-price">R$ ${fmtMoney(p.preco_venda)}</td>
        <td>
          <span style="color:${p.estoque === 0 ? 'var(--red)' : p.estoque <= 5 ? 'var(--orange)' : 'var(--text)'}">
            ${p.estoque ?? '-'}
          </span>
        </td>
        <td>${p.ativo ? '<span class="badge badge-green">Ativo</span>' : '<span class="badge badge-gray">Inativo</span>'}</td>
        <td><div class="flex gap-8">
          <button class="btn btn-ghost btn-sm" onclick="Produtos.openForm('${p.id}')">Editar</button>
        </div></td>
      </tr>`).join('');
  },

  search(val) {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.load(val), 150);
  },

  async openForm(id = null) {
    let p = { emoji: '📦', nome: '', sku: '', ean: '', preco_venda: '', preco_custo: '', unidade: 'UN', categoria: '', marca: '', ativo: true };
    if (id) { p = await window.pdv.produtos.getById(id) || p; }

    Modal.open(`
<div class="form-row cols-2">
  <div class="form-group">
    <label class="form-label">Emoji</label>
    <input class="input" id="pf-emoji" value="${p.emoji || '📦'}" style="text-align:center;font-size:22px">
  </div>
  <div class="form-group">
    <label class="form-label">Unidade</label>
    <input class="input" id="pf-un" value="${p.unidade || 'UN'}" placeholder="UN, KG, LT...">
  </div>
</div>
<div class="form-group">
  <label class="form-label">Nome *</label>
  <input class="input" id="pf-nome" value="${p.nome || ''}" placeholder="Nome do produto">
</div>
<div class="form-row cols-2">
  <div class="form-group">
    <label class="form-label">SKU</label>
    <input class="input" id="pf-sku" value="${p.sku || ''}">
  </div>
  <div class="form-group">
    <label class="form-label">EAN / Código de barras</label>
    <input class="input" id="pf-ean" value="${p.ean || ''}">
  </div>
</div>
<div class="form-row cols-2">
  <div class="form-group">
    <label class="form-label">Preço de Venda (R$) *</label>
    <input class="input" id="pf-preco" type="number" step="0.01" value="${p.preco_venda || ''}">
  </div>
  <div class="form-group">
    <label class="form-label">Preço de Custo (R$)</label>
    <input class="input" id="pf-custo" type="number" step="0.01" value="${p.preco_custo || ''}">
  </div>
</div>
<div class="form-row cols-2">
  <div class="form-group">
    <label class="form-label">Categoria</label>
    <input class="input" id="pf-cat" value="${p.categoria || ''}">
  </div>
  <div class="form-group">
    <label class="form-label">Marca</label>
    <input class="input" id="pf-marca" value="${p.marca || ''}">
  </div>
</div>
<div class="modal-actions">
  <button class="btn btn-ghost" onclick="Modal.close()">Cancelar</button>
  <button class="btn btn-primary" onclick="Produtos.salvar('${id || ''}')">Salvar</button>
</div>`, id ? 'Editar Produto' : 'Novo Produto');
  },

  async salvar(id) {
    const dados = {
      emoji: document.getElementById('pf-emoji').value,
      nome: document.getElementById('pf-nome').value.trim(),
      sku: document.getElementById('pf-sku').value.trim(),
      ean: document.getElementById('pf-ean').value.trim(),
      preco_venda: parseFloat(document.getElementById('pf-preco').value),
      preco_custo: parseFloat(document.getElementById('pf-custo').value) || 0,
      unidade: document.getElementById('pf-un').value || 'UN',
      categoria: document.getElementById('pf-cat').value,
      marca: document.getElementById('pf-marca').value,
      ativo: true,
    };
    if (!dados.nome || !dados.preco_venda) { Toast.show('Nome e preço são obrigatórios', 'error'); return; }
    if (id) { await window.pdv.produtos.atualizar(id, dados); Toast.show('Produto atualizado!', 'success'); }
    else { await window.pdv.produtos.salvar(dados); Toast.show('Produto criado!', 'success'); }
    Modal.close();
    await this.load(document.getElementById('prod-search')?.value || '');
  }
};

// ─── Clientes ─────────────────────────────────────────────────────
const Clientes = {
  render() {
    return `
<div class="page-header">
  <div><div class="page-title">Clientes</div></div>
  <div class="page-actions">
    <input class="input" id="cli-search" placeholder="🔍 Buscar..." style="width:220px" oninput="Clientes.load(this.value)">
    <button class="btn btn-primary" onclick="Clientes.openForm()">+ Novo Cliente</button>
  </div>
</div>
<div style="flex:1;overflow:auto">
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>Nome</th><th>Telefone</th><th>Cidade</th><th>Ativo</th>
        <th>Limite</th><th>Em Aberto</th><th>Disponível</th><th></th>
      </tr></thead>
      <tbody id="cli-tbody"><tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text3)">Carregando...</td></tr></tbody>
    </table>
  </div>
</div>`;
  },

  async init() { await this.load(''); },

  async load(q) {
    const lista = await window.pdv.clientes.buscar(q);
    const tbody = document.getElementById('cli-tbody');
    if (!tbody) return;
    if (!lista.length) {
      tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="icon">👤</div><h3>Nenhum cliente</h3></div></td></tr>';
      return;
    }
    // Carregar resumo de créditos para cada cliente
    const rows = await Promise.all(lista.map(async c => {
      const remoteId = c.remote_id || c.id;
      const resumo = await window.pdv.creditos.resumo(remoteId);
      const emAberto = resumo?.total_saldo || 0;
      const disponivel = Math.max(0, (c.limite_credito || 0) - emAberto);
      return { c, emAberto, disponivel };
    }));
    tbody.innerHTML = rows.map(({ c, emAberto, disponivel }) => `
      <tr>
        <td class="td-main">👤 ${c.nome}<br><span style="font-size:11px;color:var(--text3)">${c.cpf_cnpj || ''}</span></td>
        <td>${c.telefone || '-'}</td>
        <td style="font-size:12px;color:var(--text2)">${c.email || '-'}</td>
        <td>${c.ativo !== false ? '<span class="badge badge-green">Sim</span>' : '<span class="badge badge-gray">Não</span>'}</td>
        <td class="td-price">R$ ${fmtMoney(c.limite_credito)}</td>
        <td><span style="color:${emAberto > 0 ? 'var(--red)' : 'var(--text2)'}">R$ ${fmtMoney(emAberto)}</span></td>
        <td><span style="color:${disponivel > 0 ? 'var(--green)' : disponivel === 0 && c.limite_credito > 0 ? 'var(--red)' : 'var(--text2)'}">R$ ${fmtMoney(disponivel)}</span></td>
        <td>
          <div class="flex gap-8">
            ${emAberto > 0 ? `<button class="btn btn-primary btn-sm" onclick="Clientes.verConta('${c.remote_id || c.id}','${c.nome}','${c.id}')">Receber</button>` : ''}
            <button class="btn btn-ghost btn-sm" onclick="Clientes.verConta('${c.remote_id || c.id}','${c.nome}','${c.id}')">Ver Conta</button>
          </div>
        </td>
      </tr>`).join('');
  },

  async openForm() {
    Modal.open(`
<div class="form-group"><label class="form-label">Nome *</label><input class="input" id="cf-nome" placeholder="Nome completo"></div>
<div class="form-row cols-2">
  <div class="form-group"><label class="form-label">CPF / CNPJ</label><input class="input" id="cf-cpf"></div>
  <div class="form-group"><label class="form-label">Telefone</label><input class="input" id="cf-tel"></div>
</div>
<div class="form-group"><label class="form-label">Email</label><input class="input" id="cf-email" type="email"></div>
<div class="form-row cols-2">
  <div class="form-group"><label class="form-label">Limite de Crédito (R$)</label><input class="input" id="cf-limite" type="number" step="0.01" value="0"></div>
  <div class="form-group"><label class="form-label">Saldo Inicial (R$)</label><input class="input" id="cf-saldo" type="number" step="0.01" value="0"></div>
</div>
<div class="modal-actions">
  <button class="btn btn-ghost" onclick="Modal.close()">Cancelar</button>
  <button class="btn btn-primary" onclick="Clientes.salvar()">Salvar</button>
</div>`, 'Novo Cliente');
  },

  async salvar() {
    const dados = {
      nome: document.getElementById('cf-nome').value.trim(),
      cpf_cnpj: document.getElementById('cf-cpf').value.trim(),
      telefone: document.getElementById('cf-tel').value.trim(),
      email: document.getElementById('cf-email').value.trim(),
      limite_credito: parseFloat(document.getElementById('cf-limite').value) || 0,
      saldo_credito: parseFloat(document.getElementById('cf-saldo').value) || 0,
    };
    if (!dados.nome) { Toast.show('Nome é obrigatório', 'error'); return; }
    await window.pdv.clientes.salvar(dados);
    Toast.show('Cliente salvo!', 'success');
    Modal.close();
    await this.load('');
  },

  async verConta(remoteId, nome, localId) {
    const creditos = await window.pdv.creditos.getAbertos(remoteId);
    const cliente = await window.pdv.clientes.getById(localId);
    const totalAberto = creditos.reduce((s, c) => s + (c.saldo_atual || 0), 0);
    const disponivel = Math.max(0, (cliente?.limite_credito || 0) - totalAberto);

    const renderLista = (items) => !items.length
      ? '<div style="color:var(--text3);text-align:center;padding:24px">Nenhuma conta em aberto</div>'
      : items.map(cr => `
<div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px">
  <div class="flex-between" style="margin-bottom:6px">
    <div>
      <span style="font-size:11px;color:var(--text3)">${cr.origem ? cr.origem.toUpperCase() : 'CRÉDITO'}${cr.venda_origem_numero ? ' · Venda #' + cr.venda_origem_numero : ''}</span>
      <div style="font-size:11px;color:var(--text3)">${cr.created_date ? new Date(cr.created_date).toLocaleDateString('pt-BR') : ''}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:11px;color:var(--text3)">Original: R$ ${fmtMoney(cr.valor_original)}</div>
      <div style="font-weight:700;color:var(--red)">Saldo: R$ ${fmtMoney(cr.saldo_atual)}</div>
    </div>
  </div>
  ${cr.observacao ? `<div style="font-size:11px;color:var(--text2);margin-bottom:8px">${cr.observacao}</div>` : ''}
  <div class="flex gap-8" style="margin-top:8px">
    <input class="input" type="number" step="0.01" min="0.01" max="${cr.saldo_atual}"
      id="rec-val-${cr.id}" value="${fmtMoney(cr.saldo_atual).replace(',','.')}"
      style="flex:1;padding:6px 10px;font-size:13px" placeholder="Valor a receber">
    <button class="btn btn-primary btn-sm" onclick="Clientes._receberItem('${cr.id}',${cr.saldo_atual},'${remoteId}','${nome}','${localId}')">
      Receber
    </button>
  </div>
</div>`).join('');

    Modal.open(`
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
  <div style="background:var(--bg3);border-radius:8px;padding:12px;text-align:center">
    <div style="font-size:11px;color:var(--text3);margin-bottom:4px">LIMITE</div>
    <div class="font-syne" style="font-size:18px">R$ ${fmtMoney(cliente?.limite_credito || 0)}</div>
  </div>
  <div style="background:var(--bg3);border-radius:8px;padding:12px;text-align:center">
    <div style="font-size:11px;color:var(--text3);margin-bottom:4px">EM ABERTO</div>
    <div class="font-syne" style="font-size:18px;color:var(--red)">R$ ${fmtMoney(totalAberto)}</div>
  </div>
  <div style="background:var(--bg3);border-radius:8px;padding:12px;text-align:center">
    <div style="font-size:11px;color:var(--text3);margin-bottom:4px">DISPONÍVEL</div>
    <div class="font-syne" style="font-size:18px;color:var(--green)">R$ ${fmtMoney(disponivel)}</div>
  </div>
</div>
<div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--text3);margin-bottom:10px">Contas em Aberto</div>
<div id="conta-lista">${renderLista(creditos)}</div>
<div class="modal-actions"><button class="btn btn-ghost" onclick="Modal.close()">Fechar</button></div>
`, `Conta — ${nome}`);
  },

  async _receberItem(creditoId, saldoAtual, remoteClienteId, nome, localId) {
    const input = document.getElementById(`rec-val-${creditoId}`);
    const valorPago = parseFloat(input?.value) || 0;
    if (valorPago <= 0) { Toast.show('Informe um valor válido', 'error'); return; }
    if (valorPago > saldoAtual) { Toast.show('Valor maior que o saldo', 'error'); return; }
    const obs = `Recebimento PDV ${new Date().toLocaleDateString('pt-BR')}`;
    await window.pdv.creditos.receber(creditoId, valorPago, saldoAtual, obs);
    Toast.show(`R$ ${fmtMoney(valorPago)} recebido com sucesso!`, 'success');
    Modal.close();
    await this.verConta(remoteClienteId, nome, localId);
  }
};

// ─── Vendas ───────────────────────────────────────────────────────
const Vendas = {
  _todoTerminais: false,

  render() {
    const podeVerTodos = podePermissao('ver_vendas_todos_terminais');
    return `
<div class="page-header">
  <div><div class="page-title">Vendas</div></div>
  <div class="page-actions" style="display:flex;gap:8px;align-items:center">
    ${podeVerTodos ? `
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);cursor:pointer;white-space:nowrap">
      <input type="checkbox" id="venda-todos-terminais" onchange="Vendas.toggleTodos(this.checked)" style="cursor:pointer">
      Todos os terminais
    </label>` : ''}
    <input class="input" id="venda-data" type="date" value="${new Date().toISOString().split('T')[0]}" onchange="Vendas.load()">
  </div>
</div>
<div style="padding:16px 20px;border-bottom:1px solid var(--border);display:grid;grid-template-columns:repeat(4,1fr);gap:12px" id="vendas-totais"></div>
<div style="flex:1;overflow:auto">
  <div class="table-wrap">
    <table>
      <thead><tr><th>#</th><th>Hora</th><th>Terminal</th><th>Cliente</th><th>Pagamento</th><th>Total</th><th>Status</th><th>Nuvem</th><th></th></tr></thead>
      <tbody id="vendas-tbody"></tbody>
    </table>
  </div>
</div>`;
  },

  async init() { this._todoTerminais = false; await this.load(); },

  toggleTodos(val) { this._todoTerminais = val; this.load(); },

  async load() {
    const data = document.getElementById('venda-data')?.value || new Date().toISOString().split('T')[0];
    const tbody = document.getElementById('vendas-tbody');
    if (!tbody) return;

    if (this._todoTerminais) {
      // ── Modo cloud: todos os terminais ──────────────────────────
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text3)">Carregando...</td></tr>';
      try {
        const lista = await window.pdv.vendas.listarCloud(data);

        const tt = document.getElementById('vendas-totais');
        if (tt && podePermissao('ver_total_vendas_dia')) {
          const totalValor = lista.filter(v => v.status !== 'cancelada').reduce((s, v) => s + (v.total || 0), 0);
          const totalQtd   = lista.filter(v => v.status !== 'cancelada').length;
          const pix        = lista.filter(v => v.status !== 'cancelada' && v.forma_pagamento === 'pix').reduce((s, v) => s + (v.total || 0), 0);
          const dinheiro   = lista.filter(v => v.status !== 'cancelada' && v.forma_pagamento === 'dinheiro').reduce((s, v) => s + (v.total || 0), 0);
          const cartao     = lista.filter(v => v.status !== 'cancelada' && ['credito','debito','cartao_credito','cartao_debito'].includes(v.forma_pagamento)).reduce((s, v) => s + (v.total || 0), 0);
          tt.innerHTML = `
            <div class="card"><div class="card-label">Total Vendas</div><div class="card-value">R$ ${fmtMoney(totalValor)}</div></div>
            <div class="card"><div class="card-label">Transações</div><div class="card-value">${totalQtd}</div></div>
            <div class="card"><div class="card-label">PIX + Dinheiro</div><div class="card-value">R$ ${fmtMoney(pix + dinheiro)}</div></div>
            <div class="card"><div class="card-label">Cartão</div><div class="card-value">R$ ${fmtMoney(cartao)}</div></div>`;
        } else if (tt) { tt.innerHTML = ''; }

        tbody.innerHTML = lista.map(v => `
          <tr>
            <td class="td-mono td-main">#${v.numero || '—'}</td>
            <td style="font-size:12px">${v.created_date ? new Date(v.created_date).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '—'}</td>
            <td style="font-size:11px;color:var(--text3)">${v.terminal_id || '—'}</td>
            <td>${v.cliente_nome || v.cliente_id || '<span style="color:var(--text3)">—</span>'}</td>
            <td><span class="badge ${v.forma_pagamento==='pix'?'badge-green':v.forma_pagamento==='dinheiro'?'badge-yellow':'badge-blue'}">${v.forma_pagamento || '—'}</span></td>
            <td class="td-price">R$ ${fmtMoney(v.total)}</td>
            <td>${v.status==='cancelada'?'<span class="badge badge-red">Cancelada</span>':'<span class="badge badge-green">Concluída</span>'}</td>
            <td><span class="badge badge-green" title="Sincronizado">☁ Sync</span></td>
            <td><button class="btn btn-ghost btn-sm" onclick="Vendas.imprimirCloud(${JSON.stringify(v).replace(/"/g,'&quot;')})">🖨️</button></td>
          </tr>`).join('') || '<tr><td colspan="9"><div class="empty-state"><div class="icon">🧾</div><h3>Sem vendas nesta data</h3></div></td></tr>';
      } catch(e) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--red)">Erro ao carregar: ${e.message}</td></tr>`;
      }
    } else {
      // ── Modo local: este terminal ───────────────────────────────
      const lista  = await window.pdv.vendas.listar({ data_inicio: data, data_fim: data });
      const totais = await window.pdv.vendas.totaisHoje();

      const tt = document.getElementById('vendas-totais');
      if (tt) tt.innerHTML = podePermissao('ver_total_vendas_dia') ? `
        <div class="card"><div class="card-label">Total Vendas</div><div class="card-value">R$ ${fmtMoney(totais?.total_valor)}</div></div>
        <div class="card"><div class="card-label">Transações</div><div class="card-value">${totais?.total_vendas || 0}</div></div>
        <div class="card"><div class="card-label">PIX + Dinheiro</div><div class="card-value">R$ ${fmtMoney((totais?.pix||0)+(totais?.dinheiro||0))}</div></div>
        <div class="card"><div class="card-label">Cartão</div><div class="card-value">R$ ${fmtMoney(totais?.cartao)}</div></div>` : '';

      tbody.innerHTML = lista.map(v => `
        <tr>
          <td class="td-mono td-main">#${v.numero}</td>
          <td style="font-size:12px">${new Date(v.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</td>
          <td style="font-size:11px;color:var(--text3)">Este terminal</td>
          <td>${v.cliente_nome || '<span style="color:var(--text3)">—</span>'}</td>
          <td><span class="badge ${v.forma_pagamento==='pix'?'badge-green':v.forma_pagamento==='dinheiro'?'badge-yellow':'badge-blue'}">${v.forma_pagamento}</span></td>
          <td class="td-price">R$ ${fmtMoney(v.total)}</td>
          <td>${v.status==='cancelada'?'<span class="badge badge-red">Cancelada</span>':'<span class="badge badge-green">Concluída</span>'}</td>
          <td>${v.remote_id
            ? '<span class="badge badge-green" title="Sincronizado com o sistema Vargas">☁ Sync</span>'
            : v.sync_status==='pending'
              ? '<span class="badge badge-yellow" title="Aguardando sincronização">⏳ Pendente</span>'
              : '<span class="badge badge-red" title="Erro na sincronização">✕ Erro</span>'}</td>
          <td style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-sm" onclick="Vendas.imprimir('${v.id}')" title="Imprimir comprovante">🖨️</button>
            ${v.status!=='cancelada'?`<button class="btn btn-danger btn-sm" onclick="Vendas.cancelar('${v.id}')">Cancelar</button>`:''}
          </td>
        </tr>`).join('') || '<tr><td colspan="9"><div class="empty-state"><div class="icon">🧾</div><h3>Sem vendas nesta data</h3></div></td></tr>';
    }
  },

  async _enviarImpressao(dados) {
    const ip = await window.pdv.config.get('config.print_server_ip');
    if (ip) {
      const res = await window.pdv.print.servidor(dados);
      if (res?.erro) Toast.show('Impressão: ' + res.erro, 'warning');
      else Toast.show('Enviado para impressão', 'success');
    } else {
      window.pdv.print.local(dados);
      Toast.show('Enviado para impressão', 'success');
    }
  },

  _renderPreview(numero, itens, total, subtotal, desconto, forma_pagamento, troco, vendedor_nome, cliente_nome, created_at) {
    const itensPos = itens.filter(i => i.quantidade > 0);
    const itensNeg = itens.filter(i => i.quantidade < 0);
    const linhaItem = i => `
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span>${i.produto_nome} × ${Math.abs(i.quantidade)}</span>
        <span>R$ ${fmtMoney(Math.abs(i.total ?? i.subtotal ?? i.quantidade * i.preco_unitario))}</span>
      </div>`;
    return `
<div style="font-family:monospace;font-size:13px;line-height:1.6;max-width:360px;margin:0 auto">
  <div style="text-align:center;margin-bottom:16px">
    <div style="font-family:'Syne',sans-serif;font-size:18px;font-weight:800">PDV VARGAS</div>
    <div style="color:var(--text2);font-size:12px">Venda #${numero} — ${new Date(created_at).toLocaleString('pt-BR')}</div>
    ${vendedor_nome ? `<div style="font-size:11px;color:var(--text3)">Vendedor: ${vendedor_nome}</div>` : ''}
    ${cliente_nome  ? `<div style="font-size:11px;color:var(--text3)">Cliente: ${cliente_nome}</div>`   : ''}
  </div>
  <div style="border-top:1px dashed var(--border2);border-bottom:1px dashed var(--border2);padding:10px 0;margin:10px 0">
    ${itensPos.length ? `<div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:1px;margin-bottom:4px">ITENS</div>${itensPos.map(linhaItem).join('')}` : ''}
    ${itensNeg.length ? `<div style="font-size:10px;font-weight:700;color:var(--red);letter-spacing:1px;margin:8px 0 4px">DEVOLUÇÕES</div>${itensNeg.map(linhaItem).join('')}` : ''}
  </div>
  ${desconto > 0 ? `<div style="display:flex;justify-content:space-between;color:var(--green)"><span>Desconto</span><span>- R$ ${fmtMoney(desconto)}</span></div>` : ''}
  <div style="display:flex;justify-content:space-between;font-family:'Syne',sans-serif;font-size:18px;font-weight:700;margin-top:10px;border-top:1px dashed var(--border2);padding-top:10px">
    <span>TOTAL</span><span style="color:var(--accent)">R$ ${fmtMoney(Math.abs(total))}</span>
  </div>
  <div style="margin-top:10px;color:var(--text2);font-size:12px">Pagamento: ${(forma_pagamento||'').toUpperCase()}</div>
  ${troco > 0 ? `<div style="color:var(--green)">Troco: R$ ${fmtMoney(troco)}</div>` : ''}
</div>`;
  },

  async imprimir(id) {
    const venda = await window.pdv.vendas.getById(id);
    if (!venda) return;
    const empresa_nome = (await window.pdv.config.get('auth.usuario'))?.empresa_nome || 'PDV Vargas';
    const dados = {
      numero: venda.numero, empresa_nome,
      vendedor_nome: venda.vendedor_nome || null,
      cliente_nome: venda.cliente_nome || null,
      itens: (venda.itens || []).map(i => ({ produto_nome: i.produto_nome, quantidade: i.quantidade, preco_unitario: i.preco_unitario, subtotal: i.total })),
      subtotal: venda.subtotal, desconto: venda.desconto || 0, total: venda.total,
      forma_pagamento: venda.forma_pagamento, valor_pago: venda.valor_pago,
      troco: venda.troco || 0, created_at: venda.created_at,
    };
    this._printDados = dados;
    const preview = this._renderPreview(venda.numero, venda.itens, venda.total, venda.subtotal, venda.desconto || 0, venda.forma_pagamento, venda.troco || 0, venda.vendedor_nome, venda.cliente_nome, venda.created_at);
    Modal.open(`${preview}<div class="modal-actions"><button class="btn btn-ghost" onclick="Modal.close()">Fechar</button><button class="btn btn-primary" onclick="Vendas._confirmarImpressao()">🖨️ Imprimir</button></div>`, `Comprovante #${venda.numero}`, '');
  },

  async _confirmarImpressao() {
    Modal.close();
    if (this._printDados) await this._enviarImpressao(this._printDados);
    this._printDados = null;
  },

  async imprimirCloud(v) {
    const empresa_nome = (await window.pdv.config.get('auth.usuario'))?.empresa_nome || 'PDV Vargas';
    const itens = (v.itens || []).map(i => ({ produto_nome: i.produto_nome, quantidade: i.quantidade, preco_unitario: i.preco_unitario, subtotal: i.subtotal || i.quantidade * i.preco_unitario }));
    const dados = {
      numero: v.numero, empresa_nome,
      vendedor_nome: v.vendedor_nome || null, cliente_nome: v.cliente_nome || null,
      itens, subtotal: v.subtotal || v.total, desconto: v.desconto_total || 0,
      total: v.total, forma_pagamento: v.forma_pagamento,
      valor_pago: v.valor_recebido || v.total, troco: v.troco || 0, created_at: v.created_date,
    };
    this._printDados = dados;
    const preview = this._renderPreview(v.numero, itens, v.total, v.subtotal || v.total, v.desconto_total || 0, v.forma_pagamento, v.troco || 0, v.vendedor_nome, v.cliente_nome, v.created_date);
    Modal.open(`${preview}<div class="modal-actions"><button class="btn btn-ghost" onclick="Modal.close()">Fechar</button><button class="btn btn-primary" onclick="Vendas._confirmarImpressao()">🖨️ Imprimir</button></div>`, `Comprovante #${v.numero}`, '');
  },

  async cancelar(id) {
    const motivo = prompt('Motivo do cancelamento:');
    if (!motivo) return;
    const ok = await window.pdv.app.confirm(`Cancelar esta venda? Motivo: ${motivo}`);
    if (!ok) return;
    await window.pdv.vendas.cancelar(id, motivo);
    Toast.show('Venda cancelada', 'warning');
    await this.load();
  }
};

// ─── Estoque ──────────────────────────────────────────────────────
const Estoque = {
  render() {
    return `
<div class="page-header">
  <div><div class="page-title">Estoque</div><div class="page-sub">Alertas e movimentações</div></div>
</div>
<div style="flex:1;overflow:auto;padding:20px 24px">
  <div style="margin-bottom:20px;font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:var(--text3)">⚠️ Alertas de estoque baixo</div>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Produto</th><th>SKU</th><th>Estoque atual</th><th>Mínimo</th><th>Situação</th><th></th></tr></thead>
      <tbody id="est-tbody"></tbody>
    </table>
  </div>
</div>`;
  },

  async init() {
    const alertas = await window.pdv.estoque.alertas();
    const tbody = document.getElementById('est-tbody');
    if (!tbody) return;
    tbody.innerHTML = alertas.map(a => `
      <tr>
        <td class="td-main">${a.nome}</td>
        <td class="td-mono">${a.sku || '-'}</td>
        <td><span style="color:${a.quantidade===0?'var(--red)':'var(--orange)'};font-weight:600">${a.quantidade}</span></td>
        <td>${a.quantidade_minima}</td>
        <td>${a.quantidade===0?'<span class="badge badge-red">Zerado</span>':'<span class="badge badge-orange">Baixo</span>'}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="Estoque.ajustar('${a.id}','${a.nome.replace(/'/g,'\\')}')">Ajustar</button></td>
      </tr>`).join('') || '<tr><td colspan="6"><div class="empty-state"><div class="icon">✅</div><h3>Nenhum alerta de estoque</h3></div></td></tr>';
  },

  async ajustar(produtoId, nome) {
    Modal.open(`
<div class="form-group">
  <label class="form-label">Tipo de movimentação</label>
  <select class="input" id="mov-tipo">
    <option value="entrada">Entrada (recebimento)</option>
    <option value="ajuste">Ajuste de inventário</option>
    <option value="saida">Saída (perda/quebra)</option>
  </select>
</div>
<div class="form-group">
  <label class="form-label">Quantidade</label>
  <input class="input" id="mov-qty" type="number" step="0.001" min="0" placeholder="0">
</div>
<div class="form-group">
  <label class="form-label">Observação</label>
  <input class="input" id="mov-obs" placeholder="Ex: Recebimento NF 12345">
</div>
<div class="modal-actions">
  <button class="btn btn-ghost" onclick="Modal.close()">Cancelar</button>
  <button class="btn btn-primary" onclick="Estoque.salvarMov('${produtoId}')">Registrar</button>
</div>`, `Movimentação — ${nome}`);
  },

  async salvarMov(produtoId) {
    const tipo = document.getElementById('mov-tipo').value;
    const qty = parseFloat(document.getElementById('mov-qty').value);
    const obs = document.getElementById('mov-obs').value;
    if (!qty || qty <= 0) { Toast.show('Quantidade inválida', 'error'); return; }
    await window.pdv.estoque.movimentar({ produto_id: produtoId, tipo, quantidade: qty, observacao: obs });
    Toast.show('Movimentação registrada!', 'success');
    Modal.close();
    await this.init();
  }
};

// ─── Faltas / Encomendas ─────────────────────────────────────────
const Faltas = (() => {
  let _lista = [];
  let _filtroStatus = '';
  let _busca = '';

  const STATUS_LABEL = {
    pendente:   { label: 'Pendente',   cor: '#eab308', bg: '#fef9c3' },
    notificado: { label: 'Notificado', cor: '#3b82f6', bg: '#dbeafe' },
    comprado:   { label: 'Comprado',   cor: '#8b5cf6', bg: '#ede9fe' },
    atendido:   { label: 'Atendido',   cor: '#22c55e', bg: '#dcfce7' },
    cancelado:  { label: 'Cancelado',  cor: '#9ca3af', bg: '#f3f4f6' },
    resolvido:  { label: 'Resolvido',  cor: '#22c55e', bg: '#dcfce7' },
    ignorado:   { label: 'Ignorado',   cor: '#9ca3af', bg: '#f3f4f6' },
  };

  function render() {
    return `
<div class="page-header">
  <div>
    <div class="page-title">Faltas & Encomendas</div>
    <div class="page-sub">Lista de produtos em falta e pedidos de clientes</div>
  </div>
  <button class="btn btn-primary" onclick="Faltas.abrirNovaFalta()">+ Registrar Falta</button>
</div>
<div style="padding:0 24px 16px;display:flex;gap:10px;align-items:center">
  <input class="input" id="faltas-busca" placeholder="Buscar produto ou cliente..."
    style="flex:1;max-width:320px"
    oninput="Faltas.setBusca(this.value)">
  <select class="input" id="faltas-status" style="width:160px" onchange="Faltas.setStatus(this.value)">
    <option value="">Todos os status</option>
    <option value="pendente">Pendente</option>
    <option value="notificado">Notificado</option>
    <option value="comprado">Comprado</option>
    <option value="atendido">Atendido</option>
    <option value="cancelado">Cancelado</option>
    <option value="resolvido">Resolvido</option>
  </select>
  <span id="faltas-count" style="font-size:12px;color:var(--text3)"></span>
</div>
<div style="flex:1;overflow:auto;padding:0 24px 24px">
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>Produto</th><th>Cliente</th><th>Qtd</th>
        <th>Observação</th><th>Status</th><th>Data</th><th>Ações</th>
      </tr></thead>
      <tbody id="faltas-tbody"></tbody>
    </table>
  </div>
</div>`;
  }

  async function init() {
    await carregar();
  }

  async function carregar() {
    _lista = await window.pdv.faltas.listar({ status: _filtroStatus, busca: _busca });
    renderTabela();
  }

  function renderTabela() {
    const tbody = document.getElementById('faltas-tbody');
    const count = document.getElementById('faltas-count');
    if (!tbody) return;

    if (count) count.textContent = `${_lista.length} registro${_lista.length !== 1 ? 's' : ''}`;

    if (_lista.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text3)">
        Nenhuma falta registrada
      </td></tr>`;
      return;
    }

    tbody.innerHTML = _lista.map(f => {
      const s = STATUS_LABEL[f.status] || STATUS_LABEL.pendente;
      const data = f.created_at ? new Date(f.created_at).toLocaleDateString('pt-BR') : '—';
      const tel = f.cliente_telefone
        ? `<div style="font-size:10px;color:var(--text3)">${f.cliente_telefone}</div>` : '';
      const syncBadge = f.sync_status === 'synced'
        ? '<span style="font-size:9px;color:var(--text3)">☁</span>'
        : '<span style="font-size:9px;color:var(--accent)">↑</span>';
      return `<tr>
        <td>
          <div style="font-weight:600">${f.produto_nome}</div>
          ${f.produto_sku ? `<div style="font-size:10px;color:var(--text3)">${f.produto_sku}</div>` : ''}
        </td>
        <td>${f.cliente_nome ? `<div>${f.cliente_nome}</div>${tel}` : '<span style="color:var(--text3)">—</span>'}</td>
        <td style="text-align:center;font-weight:600">${f.quantidade_solicitada || 1}</td>
        <td style="max-width:180px;font-size:11px;color:var(--text2)">${f.observacao || '—'}</td>
        <td>
          <select class="input" style="font-size:11px;padding:3px 6px;height:28px;
            color:${s.cor};background:${s.bg};border-color:${s.cor}40"
            onchange="Faltas.mudarStatus('${f.id}', this.value)">
            ${Object.entries(STATUS_LABEL).map(([k, v]) =>
              `<option value="${k}" ${f.status === k ? 'selected' : ''}>${v.label}</option>`
            ).join('')}
          </select>
        </td>
        <td style="font-size:11px;color:var(--text3)">${data} ${syncBadge}</td>
        <td>
          <button class="btn btn-ghost" style="font-size:11px;padding:3px 8px"
            onclick="Faltas.abrirWhatsApp('${f.cliente_telefone || ''}', '${(f.produto_nome || '').replace(/'/g, "\\'")}')">
            📱 WA
          </button>
        </td>
      </tr>`;
    }).join('');
  }

  function setBusca(v) {
    _busca = v;
    clearTimeout(Faltas._buscaTimer);
    Faltas._buscaTimer = setTimeout(carregar, 300);
  }

  function setStatus(v) {
    _filtroStatus = v;
    carregar();
  }

  async function mudarStatus(id, status) {
    await window.pdv.faltas.atualizarStatus(id, status);
    await carregar();
  }

  function abrirNovaFalta(produto) {
    const nomeProduto = produto?.nome || '';
    const skuProduto  = produto?.sku  || '';
    const idProduto   = produto?.id   || '';
    Modal.open(`
<div style="display:flex;flex-direction:column;gap:14px">
  <div style="position:relative">
    <label class="label">Produto *</label>
    <input class="input" id="nf-produto" value="${nomeProduto}"
      placeholder="Buscar produto ou digitar manualmente..."
      autocomplete="off"
      oninput="Faltas._buscarProduto(this.value)"
      onkeydown="Faltas._navBusca(event)">
    <input type="hidden" id="nf-produto-id" value="${idProduto}">
    <input type="hidden" id="nf-produto-sku" value="${skuProduto}">
    <div id="nf-resultados" style="display:none;position:absolute;left:0;right:0;top:100%;
      background:var(--bg2);border:1px solid var(--border2);border-radius:8px;
      box-shadow:var(--shadow);z-index:9999;max-height:220px;overflow-y:auto;margin-top:2px"></div>
    <div id="nf-produto-badge" style="display:none;margin-top:6px;padding:5px 10px;
      background:var(--green-bg);border:1px solid var(--green-border);border-radius:6px;
      font-size:11px;color:var(--green);display:flex;align-items:center;gap:6px">
      <span>✓</span><span id="nf-produto-badge-nome"></span>
      <button onclick="Faltas._limparProduto()" style="margin-left:auto;background:none;border:none;
        cursor:pointer;color:var(--text3);font-size:13px;padding:0">✕</button>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
    <div>
      <label class="label">Quantidade</label>
      <input class="input" id="nf-qty" type="number" min="1" value="1">
    </div>
    <div>
      <label class="label">Status</label>
      <select class="input" id="nf-status">
        <option value="pendente">Pendente</option>
        <option value="comprado">Comprado</option>
      </select>
    </div>
  </div>
  <div>
    <label class="label">Cliente (opcional)</label>
    <input class="input" id="nf-cliente" placeholder="Nome do cliente">
  </div>
  <div>
    <label class="label">Telefone / WhatsApp</label>
    <input class="input" id="nf-tel" placeholder="(21) 99999-9999">
  </div>
  <div>
    <label class="label">Observação</label>
    <input class="input" id="nf-obs" placeholder="Quantidade, prazo, detalhes...">
  </div>
</div>
<div class="modal-actions">
  <button class="btn btn-ghost" onclick="Modal.close()">Cancelar</button>
  <button class="btn btn-primary btn-lg" onclick="Faltas.confirmarNovaFalta()">Registrar Falta</button>
</div>`, 'Registrar Falta / Encomenda');

    // Pre-preencher se veio com produto já conhecido
    if (idProduto) _marcarProdutoSelecionado({ id: idProduto, nome: nomeProduto, sku: skuProduto });
    setTimeout(() => document.getElementById('nf-produto')?.focus(), 80);
  }

  let _nfResultados = [];
  let _nfHighlight = -1;
  let _nfTimer = null;
  let _nfProdutoSelecionado = null;

  async function _buscarProduto(val) {
    _nfProdutoSelecionado = null;
    document.getElementById('nf-produto-id').value = '';
    document.getElementById('nf-produto-sku').value = '';
    const badge = document.getElementById('nf-produto-badge');
    if (badge) badge.style.display = 'none';

    const box = document.getElementById('nf-resultados');
    if (!val.trim()) { box.style.display = 'none'; return; }

    clearTimeout(_nfTimer);
    _nfTimer = setTimeout(async () => {
      _nfResultados = await window.pdv.produtos.buscar(val);
      _nfHighlight = -1;

      if (!_nfResultados.length) {
        box.innerHTML = `<div style="padding:12px 14px;font-size:12px;color:var(--text3)">
          Produto não encontrado — será registrado como "<strong>${val}</strong>" (sem vínculo no cadastro)
        </div>`;
      } else {
        box.innerHTML = _nfResultados.map((p, i) => `
          <div id="nf-ri-${i}" onclick="Faltas._selecionarProduto(${i})"
            style="padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;
              border-bottom:1px solid var(--border);font-size:12px"
            onmouseenter="Faltas._hlProduto(${i})"
            onmouseleave="Faltas._hlProduto(-1)">
            <span style="font-size:18px">📦</span>
            <div style="flex:1">
              <div style="font-weight:600">${p.nome}</div>
              <div style="color:var(--text3);font-size:10px">${p.sku || ''} ${p.ean ? '· ' + p.ean : ''}</div>
            </div>
            <div style="text-align:right">
              <div style="font-weight:600;color:var(--accent)">R$ ${fmtMoney(p.preco_venda)}</div>
              <div style="font-size:10px;color:${p.estoque > 0 ? 'var(--green)' : 'var(--red)'}">
                ${p.estoque > 0 ? `📦 ${p.estoque}` : '❌ Sem estoque'}
              </div>
            </div>
          </div>`).join('');
      }
      box.style.display = 'block';
    }, 180);
  }

  function _hlProduto(i) {
    _nfResultados.forEach((_, j) => {
      const el = document.getElementById(`nf-ri-${j}`);
      if (el) el.style.background = j === i ? 'var(--bg3)' : '';
    });
    _nfHighlight = i;
  }

  function _navBusca(e) {
    if (!['ArrowDown','ArrowUp','Enter','Escape'].includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'Escape') { document.getElementById('nf-resultados').style.display = 'none'; return; }
    if (e.key === 'Enter' && _nfHighlight >= 0) { _selecionarProduto(_nfHighlight); return; }
    if (e.key === 'Enter' && _nfResultados.length === 1) { _selecionarProduto(0); return; }
    const next = e.key === 'ArrowDown'
      ? Math.min(_nfHighlight + 1, _nfResultados.length - 1)
      : Math.max(_nfHighlight - 1, 0);
    _hlProduto(next);
  }

  function _selecionarProduto(i) {
    const p = _nfResultados[i];
    if (!p) return;
    _marcarProdutoSelecionado(p);
    document.getElementById('nf-resultados').style.display = 'none';
  }

  function _marcarProdutoSelecionado(p) {
    _nfProdutoSelecionado = p;
    const input = document.getElementById('nf-produto');
    if (input) input.value = p.nome;
    const idEl = document.getElementById('nf-produto-id');
    if (idEl) idEl.value = p.id || '';
    const skuEl = document.getElementById('nf-produto-sku');
    if (skuEl) skuEl.value = p.sku || '';
    const badge = document.getElementById('nf-produto-badge');
    const badgeNome = document.getElementById('nf-produto-badge-nome');
    if (badge && badgeNome) {
      badgeNome.textContent = `${p.nome}${p.sku ? ' · ' + p.sku : ''} — vinculado ao cadastro`;
      badge.style.display = 'flex';
    }
  }

  function _limparProduto() {
    _nfProdutoSelecionado = null;
    const input = document.getElementById('nf-produto');
    if (input) { input.value = ''; input.focus(); }
    document.getElementById('nf-produto-id').value = '';
    document.getElementById('nf-produto-sku').value = '';
    const badge = document.getElementById('nf-produto-badge');
    if (badge) badge.style.display = 'none';
  }

  async function confirmarNovaFalta() {
    const nome = document.getElementById('nf-produto')?.value?.trim();
    if (!nome) { App.toast('Informe o nome do produto', 'error'); return; }
    const falta = {
      produto_id:           document.getElementById('nf-produto-id')?.value || null,
      produto_nome:         nome,
      produto_sku:          document.getElementById('nf-produto-sku')?.value || null,
      quantidade_solicitada: parseFloat(document.getElementById('nf-qty')?.value) || 1,
      cliente_nome:         document.getElementById('nf-cliente')?.value?.trim() || null,
      cliente_telefone:     document.getElementById('nf-tel')?.value?.trim() || null,
      observacao:           document.getElementById('nf-obs')?.value?.trim() || null,
      status:               document.getElementById('nf-status')?.value || 'pendente',
      origem: 'pdv',
    };
    await window.pdv.faltas.registrar(falta);
    Modal.close();
    App.toast('Falta registrada!', 'success');
    await carregar();
  }

  function abrirWhatsApp(telefone, produto) {
    if (!telefone) { App.toast('Cliente sem telefone cadastrado', 'warning'); return; }
    const num = telefone.replace(/\D/g, '');
    const msg = encodeURIComponent(`Olá! O produto "${produto}" que você solicitou chegou. Venha buscar!`);
    // Abre link externo — requer shell.openExternal no main ou link direto
    window.open(`https://wa.me/55${num}?text=${msg}`, '_blank');
  }

  return {
    render, init, carregar, setBusca, setStatus,
    mudarStatus, abrirNovaFalta, confirmarNovaFalta, abrirWhatsApp,
    _buscarProduto, _navBusca, _selecionarProduto, _marcarProdutoSelecionado,
    _limparProduto, _hlProduto,
  };
})();

// ─── Config ───────────────────────────────────────────────────────
const Config = {
  render() {
    return `
<div class="page-header">
  <div><div class="page-title">Configurações</div></div>
</div>
<div style="padding:24px;max-width:560px;overflow:auto">
  <div class="card" style="margin-bottom:16px">
    <div style="font-size:13px;font-weight:600;margin-bottom:14px">🔌 Conexão Base44</div>
    <div class="form-group"><label class="form-label">App ID</label><input class="input" id="cfg-appid" placeholder="seu-app-id"></div>
    <div class="form-group"><label class="form-label">Terminal ID</label><input class="input" id="cfg-terminal" placeholder="PDV-001"></div>
    <div class="form-group"><label class="form-label">Intervalo de sync (minutos)</label><input class="input" id="cfg-interval" type="number" min="1" max="60" value="5"></div>
    <button class="btn btn-primary btn-sm" onclick="Config.salvar()">Salvar</button>
  </div>
  <div class="card" style="margin-bottom:16px">
    <div style="font-size:13px;font-weight:600;margin-bottom:14px">🔄 Sincronização</div>
    <div id="cfg-sync-info" style="font-size:13px;color:var(--text2);margin-bottom:12px">Carregando...</div>
    <div class="flex gap-8">
      <button class="btn btn-ghost btn-sm" onclick="App.syncNow()">↻ Sincronizar agora</button>
      <button class="btn btn-ghost btn-sm" onclick="Config.syncPendentes()">Ver pendentes</button>
    </div>
  </div>
  <div class="card" style="margin-bottom:16px">
    <div style="font-size:13px;font-weight:600;margin-bottom:14px">🛒 Comportamento do PDV</div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div>
        <div style="font-size:13px;font-weight:500">Permitir venda com estoque negativo</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">Permite vender mesmo sem estoque disponível</div>
      </div>
      <label style="position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0">
        <input type="checkbox" id="cfg-estoque-negativo" style="opacity:0;width:0;height:0"
          onchange="Config._setToggle('cfg-estoque-negativo','cfg-toggle-estoque','cfg-toggle-knob',this.checked);Config.salvar()">
        <span id="cfg-toggle-estoque"
          style="position:absolute;cursor:pointer;inset:0;background:var(--bg3);border:1px solid var(--border2);border-radius:24px;transition:.2s">
          <span id="cfg-toggle-knob" style="position:absolute;height:18px;width:18px;left:2px;top:2px;background:var(--text3);border-radius:50%;transition:.2s"></span>
        </span>
      </label>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:13px;font-weight:500">Exigir código do vendedor</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">Obriga informar vendedor ao finalizar</div>
      </div>
      <label style="position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0">
        <input type="checkbox" id="cfg-exigir-vendedor" style="opacity:0;width:0;height:0"
          onchange="Config._setToggle('cfg-exigir-vendedor','cfg-toggle-vendedor','cfg-toggle-vendedor-knob',this.checked);Config.salvar()">
        <span id="cfg-toggle-vendedor"
          style="position:absolute;cursor:pointer;inset:0;background:var(--bg3);border:1px solid var(--border2);border-radius:24px;transition:.2s">
          <span id="cfg-toggle-vendedor-knob" style="position:absolute;height:18px;width:18px;left:2px;top:2px;background:var(--text3);border-radius:50%;transition:.2s"></span>
        </span>
      </label>
    </div>
  </div>
  <div class="card" style="margin-bottom:16px">
    <div style="font-size:13px;font-weight:600;margin-bottom:14px">🎨 Aparência</div>
    <div style="font-size:12px;color:var(--text2);margin-bottom:12px">Escolha o tema da interface</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px" id="cfg-tema-btns">
      <button id="cfg-tema-dark" onclick="Config.setTema('dark')"
        style="padding:14px;border-radius:10px;border:2px solid var(--border2);background:var(--bg3);cursor:pointer;transition:all .15s;text-align:center">
        <div style="font-size:22px;margin-bottom:6px">🌙</div>
        <div style="font-size:13px;font-weight:600;color:var(--text)">Escuro</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">Recomendado</div>
      </button>
      <button id="cfg-tema-light" onclick="Config.setTema('light')"
        style="padding:14px;border-radius:10px;border:2px solid var(--border2);background:var(--bg3);cursor:pointer;transition:all .15s;text-align:center">
        <div style="font-size:22px;margin-bottom:6px">☀️</div>
        <div style="font-size:13px;font-weight:600;color:var(--text)">Claro</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">Para ambientes claros</div>
      </button>
    </div>
  </div>
  <div class="card" style="margin-bottom:16px">
    <div style="font-size:13px;font-weight:600;margin-bottom:4px">🖨️ Impressão em Rede</div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:14px">
      Configure este terminal como servidor de impressão (CAIXA) ou aponte para o IP do CAIXA.
    </div>

    <!-- Toggle: Servidor de impressão ativo -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div>
        <div style="font-size:13px;font-weight:500">Este terminal é o CAIXA (servidor de impressão)</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">Ativa o servidor HTTP local para receber jobs dos outros terminais</div>
      </div>
      <label style="position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0">
        <input type="checkbox" id="cfg-print-server"
          style="opacity:0;width:0;height:0"
          onchange="Config._onPrintServerToggle(this.checked)">
        <span id="cfg-toggle-print"
          style="position:absolute;cursor:pointer;inset:0;background:var(--bg3);border:1px solid var(--border2);border-radius:24px;transition:.2s">
          <span id="cfg-toggle-print-knob"
            style="position:absolute;height:18px;width:18px;left:2px;top:2px;background:var(--text3);border-radius:50%;transition:.2s"></span>
        </span>
      </label>
    </div>

    <!-- Porta (visível quando é servidor) -->
    <div id="cfg-print-server-section" style="display:none">
      <div class="form-group">
        <label class="form-label">Porta do servidor</label>
        <input class="input" id="cfg-print-porta" type="number" value="3001" min="1024" max="65535"
          placeholder="3001" style="max-width:120px">
      </div>
      <div class="form-group">
        <label class="form-label">Impressora</label>
        <div style="display:flex;gap:8px;align-items:center">
          <select class="input" id="cfg-impressora" style="flex:1"></select>
          <button class="btn btn-ghost btn-sm" onclick="Config.carregarImpressoras()">↻</button>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">Selecione a impressora térmica conectada a este terminal</div>
      </div>
      <div id="cfg-print-status" style="font-size:12px;color:var(--text3);margin-bottom:10px"></div>
    </div>

    <!-- IP do CAIXA (visível quando NÃO é servidor) -->
    <div id="cfg-print-client-section">
      <div class="form-group">
        <label class="form-label">IP do servidor de impressão (CAIXA)</label>
        <input class="input" id="cfg-print-ip" placeholder="Ex: 192.168.1.10:3001">
        <div style="font-size:11px;color:var(--text3);margin-top:4px">Deixe vazio para imprimir localmente neste terminal</div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="Config.testarConexaoImpressao()">Testar conexão</button>
    </div>

    <!-- Toggle: Imprimir automaticamente após venda -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
      <div>
        <div style="font-size:13px;font-weight:500">Imprimir cupom automaticamente após venda</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">Envia para impressão ao confirmar pagamento</div>
      </div>
      <label style="position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0">
        <input type="checkbox" id="cfg-print-auto" style="opacity:0;width:0;height:0"
          onchange="Config._setToggle('cfg-print-auto','cfg-toggle-print-auto','cfg-toggle-print-auto-knob',this.checked);Config.salvarImpressao()">
        <span id="cfg-toggle-print-auto"
          style="position:absolute;cursor:pointer;inset:0;background:var(--bg3);border:1px solid var(--border2);border-radius:24px;transition:.2s">
          <span id="cfg-toggle-print-auto-knob"
            style="position:absolute;height:18px;width:18px;left:2px;top:2px;background:var(--text3);border-radius:50%;transition:.2s"></span>
        </span>
      </label>
    </div>

    <button class="btn btn-primary btn-sm" style="margin-top:14px" onclick="Config.salvarImpressao()">Salvar configuração de impressão</button>
  </div>

  <div class="card">
    <div style="font-size:13px;font-weight:600;margin-bottom:14px">👤 Sessão</div>
    <div id="cfg-session" style="font-size:13px;color:var(--text2);margin-bottom:12px">Carregando...</div>
    <button class="btn btn-danger btn-sm" onclick="App.logout()">Sair do sistema</button>
  </div>
</div>`;
  },

  async init() {
    const cfg = await window.pdv.config.getAll();
    const f = v => document.getElementById(v);
    if (f('cfg-appid')) f('cfg-appid').value = cfg['config.app_id'] || '';
    if (f('cfg-terminal')) f('cfg-terminal').value = cfg['config.terminal_id'] || 'PDV-001';

    // Toggles — electron-store usa notação de ponto como caminho aninhado
    const estoqueNeg = await window.pdv.config.get('config.vender_estoque_negativo') === true;
    const exigirVend = await window.pdv.config.get('config.exigir_vendedor') !== false;
    this._setToggle('cfg-estoque-negativo', 'cfg-toggle-estoque', 'cfg-toggle-knob', estoqueNeg);
    this._setToggle('cfg-exigir-vendedor', 'cfg-toggle-vendedor', 'cfg-toggle-vendedor-knob', exigirVend);

    // Impressão
    const printAtivo = await window.pdv.config.get('config.print_server_ativo') === true;
    const printPorta = await window.pdv.config.get('config.print_server_porta') || 3001;
    const printIp    = await window.pdv.config.get('config.print_server_ip') || '';
    const printAuto  = await window.pdv.config.get('config.imprimir_automatico') === true;
    this._setToggle('cfg-print-server', 'cfg-toggle-print', 'cfg-toggle-print-knob', printAtivo);
    this._setToggle('cfg-print-auto', 'cfg-toggle-print-auto', 'cfg-toggle-print-auto-knob', printAuto);
    if (f('cfg-print-porta')) f('cfg-print-porta').value = printPorta;
    if (f('cfg-print-ip'))    f('cfg-print-ip').value    = printIp;
    if (printAtivo) {
      if (f('cfg-print-server-section')) f('cfg-print-server-section').style.display = '';
      if (f('cfg-print-client-section')) f('cfg-print-client-section').style.display = 'none';
      await this.carregarImpressoras();
      const status = await window.pdv.print.serverStatus();
      const el = f('cfg-print-status');
      if (el) el.textContent = status.rodando ? `🟢 Servidor ativo na porta ${status.porta}` : '⭕ Servidor inativo';
    }

    const temaAtual = await window.pdv.config.get('config.tema') || 'dark';
    this._marcarTema(temaAtual);

    const status = await window.pdv.sync.status();
    const si = f('cfg-sync-info');
    if (si) si.innerHTML = `
      Status: <strong>${status.online ? '🟢 Online' : '🔴 Offline'}</strong><br>
      Última sync: ${status.ultima_sync ? new Date(status.ultima_sync).toLocaleString('pt-BR') : 'Nunca'}<br>
      Pendentes: ${status.pendentes || 0} operações`;

    const user = cfg['auth.usuario'];
    const ss = f('cfg-session');
    if (ss && user) ss.innerHTML = `Usuário: <strong>${user.nome || '-'}</strong><br>Empresa: ${cfg['auth.empresa_id'] || '-'}`;
  },

  _setToggle(inputId, spanId, knobId, value) {
    const input = document.getElementById(inputId);
    const span  = document.getElementById(spanId);
    const knob  = document.getElementById(knobId);
    if (!input) return;
    input.checked = value;
    if (span) span.style.background = value ? 'var(--accent)' : 'var(--bg3)';
    if (knob) knob.style.transform = value ? 'translateX(20px)' : 'translateX(0)';
    if (knob) knob.style.background = value ? '#fff' : 'var(--text3)';
  },

  async salvar() {
    await window.pdv.config.set('config.app_id', document.getElementById('cfg-appid')?.value.trim() || '');
    await window.pdv.config.set('config.terminal_id', document.getElementById('cfg-terminal')?.value.trim() || 'PDV-001');
    const estoqueNeg = document.getElementById('cfg-estoque-negativo')?.checked || false;
    const exigirVend = document.getElementById('cfg-exigir-vendedor')?.checked !== false;
    await window.pdv.config.set('config.vender_estoque_negativo', estoqueNeg);
    await window.pdv.config.set('config.exigir_vendedor', exigirVend);
    Toast.show('Configurações salvas!', 'success');
  },

  async setTema(tema) {
    await Theme.apply(tema);
    this._marcarTema(tema);
    Toast.show(`Tema ${tema === 'light' ? 'Claro' : 'Escuro'} ativado`, 'success');
  },

  _marcarTema(tema) {
    const accent = 'var(--accent)';
    const accentBg = 'var(--accent-bg)';
    const normal = 'var(--border2)';
    const normalBg = 'var(--bg3)';
    ['dark', 'light'].forEach(t => {
      const btn = document.getElementById(`cfg-tema-${t}`);
      if (!btn) return;
      const ativo = t === tema;
      btn.style.borderColor = ativo ? accent : normal;
      btn.style.background = ativo ? accentBg : normalBg;
    });
  },

  async _onPrintServerToggle(ativo) {
    this._setToggle('cfg-print-server', 'cfg-toggle-print', 'cfg-toggle-print-knob', ativo);
    document.getElementById('cfg-print-server-section').style.display = ativo ? '' : 'none';
    document.getElementById('cfg-print-client-section').style.display = ativo ? 'none' : '';
    if (ativo) {
      await this.carregarImpressoras();
      const status = await window.pdv.print.serverStatus();
      const el = document.getElementById('cfg-print-status');
      if (el) el.textContent = status.rodando ? '🟢 Servidor já está ativo' : '⭕ Servidor inativo — salve para ativar';
    }
  },

  async carregarImpressoras() {
    const lista = await window.pdv.print.listar();
    const sel = document.getElementById('cfg-impressora');
    if (!sel) return;
    const salva = await window.pdv.config.get('config.impressora_nome') || '';
    sel.innerHTML = `<option value="">-- Impressora padrão do sistema --</option>` +
      lista.map(p => `<option value="${p.name}" ${p.name === salva ? 'selected' : ''}>${p.name}${p.padrao ? ' (padrão)' : ''}</option>`).join('');
  },

  async salvarImpressao() {
    const ativo = document.getElementById('cfg-print-server')?.checked || false;
    const porta = parseInt(document.getElementById('cfg-print-porta')?.value || '3001', 10);
    const ip    = document.getElementById('cfg-print-ip')?.value.trim() || '';
    const impressora = document.getElementById('cfg-impressora')?.value || '';
    const auto  = document.getElementById('cfg-print-auto')?.checked || false;

    await window.pdv.config.set('config.print_server_ativo', ativo);
    await window.pdv.config.set('config.print_server_porta', porta);
    await window.pdv.config.set('config.print_server_ip', ip);
    await window.pdv.config.set('config.impressora_nome', impressora);
    await window.pdv.config.set('config.imprimir_automatico', auto);

    if (ativo) {
      const res = await window.pdv.print.serverStart(porta);
      const el = document.getElementById('cfg-print-status');
      if (el) el.textContent = res.ok ? `🟢 Servidor ativo na porta ${porta}` : '❌ Falha ao iniciar servidor';
    } else {
      await window.pdv.print.serverStop();
    }
    Toast.show('Configuração de impressão salva!', 'success');
  },

  async testarConexaoImpressao() {
    const ip = document.getElementById('cfg-print-ip')?.value.trim();
    if (!ip) { Toast.show('Informe o IP do servidor', 'warning'); return; }
    try {
      const res = await fetch(`http://${ip}/ping`);
      if (res.ok) {
        Toast.show(`✅ Conectado ao servidor de impressão em ${ip}`, 'success');
      } else {
        Toast.show(`Servidor respondeu com erro ${res.status}`, 'error');
      }
    } catch (e) {
      Toast.show(`Falha ao conectar: ${e.message}`, 'error');
    }
  },

  async syncPendentes() {
    const pend = await window.pdv.sync.pendentes();
    Modal.open(`
<div style="max-height:300px;overflow-y:auto">
  ${pend.length === 0
    ? '<div class="empty-state"><div class="icon">✅</div><h3>Nenhuma operação pendente</h3></div>'
    : pend.map(p => `
    <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:12px">
      <span class="badge badge-yellow">${p.entidade}</span>
      <span style="margin-left:8px;color:var(--text2)">${p.operacao} · ${new Date(p.created_at).toLocaleString('pt-BR')}</span>
      ${p.erro ? `<div style="color:var(--red);font-size:11px;margin-top:2px">❌ ${p.erro}</div>` : ''}
    </div>`).join('')}
</div>
<div class="modal-actions"><button class="btn btn-ghost" onclick="Modal.close()">Fechar</button></div>
`, `${pend.length} Operações Pendentes`);
  }
};
