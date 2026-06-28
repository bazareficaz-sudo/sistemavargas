// ─── Marketplace (multi-canal / multi-conta) ──────────────────────
const Marketplace = (() => {

  let _sub        = 'canais';
  let _contaAtiva = null; // id da conta selecionada em anúncios/pedidos

  // ─── Canais disponíveis ─────────────────────────────────────────
  const CANAIS = {
    shopee:        { nome: 'Shopee',         icon: '🛍️', cor: '#ee4d2d', ativo: true,  temOAuth: true  },
    mercadolivre:  { nome: 'Mercado Livre',  icon: '🛒', cor: '#ffe600', ativo: false, textoCor: '#333' },
    woocommerce:   { nome: 'WooCommerce',    icon: '🛒', cor: '#7f54b3', ativo: false },
    magalu:        { nome: 'Magazine Luiza', icon: '🏬', cor: '#0086ff', ativo: false },
  };

  // ─── Shell ──────────────────────────────────────────────────────
  function render() {
    return `
<div style="display:flex;flex-direction:column;height:100%">
  <div style="display:flex;align-items:center;gap:4px;padding:10px 20px;border-bottom:1px solid var(--border);background:var(--card);flex-shrink:0">
    ${['canais','anuncios','pedidos','precos'].map(id => {
      const labels = { canais:'🔌 Canais', anuncios:'📢 Anúncios', pedidos:'📦 Pedidos', precos:'💲 Regras de Preço' };
      return `<button class="mkt-tab" id="mkt-tab-${id}" onclick="Marketplace.ir('${id}')">${labels[id]}</button>`;
    }).join('')}
    <div style="margin-left:auto">
      <button class="btn btn-ghost btn-sm" onclick="App.showLauncher()">⬡ Início</button>
    </div>
  </div>
  <div style="flex:1;overflow:auto" id="mkt-content"></div>
</div>
<style>
.mkt-tab{background:none;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;color:var(--text2);font-weight:500;transition:.15s}
.mkt-tab:hover{background:var(--bg3);color:var(--text1)}
.mkt-tab.ativo{background:var(--accent);color:#fff}
.conta-card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:20px;position:relative;overflow:hidden;transition:.15s}
.conta-card:hover{border-color:var(--accent44,#6c63ff44)}
</style>`;
  }

  function init() { ir('canais'); }

  function ir(sub) {
    _sub = sub;
    document.querySelectorAll('.mkt-tab').forEach(b => b.classList.remove('ativo'));
    document.getElementById(`mkt-tab-${sub}`)?.classList.add('ativo');
    const el = document.getElementById('mkt-content');
    if (!el) return;
    ({ canais: renderCanais, anuncios: renderAnuncios, pedidos: renderPedidos, precos: renderPrecos }[sub] || renderCanais)(el);
  }

  // ─── CANAIS ─────────────────────────────────────────────────────

  async function renderCanais(el) {
    el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)">Carregando...</div>';
    const contas = (await window.pdv.mkt.listarContas()) || [];

    el.innerHTML = `
<div style="padding:28px 36px">

  <!-- Cabeçalho -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
    <div>
      <div style="font-size:18px;font-weight:700">Canais de Venda</div>
      <div style="font-size:12px;color:var(--text2);margin-top:2px">${contas.length} conta(s) configurada(s)</div>
    </div>
    <button class="btn btn-primary" onclick="Marketplace.modalAddConta()">＋ Adicionar Canal</button>
  </div>

  <!-- Contas conectadas -->
  ${contas.length ? `
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;margin-bottom:32px">
    ${contas.map(c => _cardConta(c)).join('')}
  </div>` : `
  <div style="text-align:center;padding:60px 20px;background:var(--card);border:1px dashed var(--border2);border-radius:16px;margin-bottom:32px">
    <div style="font-size:48px;margin-bottom:16px">🔌</div>
    <div style="font-size:16px;font-weight:600;margin-bottom:8px">Nenhum canal conectado</div>
    <div style="font-size:13px;color:var(--text2);margin-bottom:20px">Adicione sua primeira loja para começar a vender em múltiplos canais.</div>
    <button class="btn btn-primary" onclick="Marketplace.modalAddConta()">＋ Adicionar Canal</button>
  </div>`}

  <!-- Canais disponíveis -->
  <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:var(--text3);text-transform:uppercase;margin-bottom:14px">Canais Disponíveis</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
    ${Object.entries(CANAIS).map(([id, c]) => `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px;display:flex;align-items:center;gap:12px;${!c.ativo?'opacity:.45':''}" ${c.ativo?`onclick="Marketplace.modalAddConta('${id}')" style="cursor:pointer;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px;display:flex;align-items:center;gap:12px"`:''}>
      <div style="width:36px;height:36px;background:${c.cor};border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;color:${c.textoCor||'#fff'}">${c.icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13px">${c.nome}</div>
        <div style="font-size:10px;color:var(--text3)">${contas.filter(cc=>cc.canal===id).length} conta(s) · ${c.ativo?'<span style="color:var(--green)">Disponível</span>':'<span>Em breve</span>'}</div>
      </div>
      ${c.ativo ? `<span style="font-size:18px;color:var(--text3)">+</span>` : ''}
    </div>`).join('')}
  </div>
</div>`;
  }

  function _cardConta(c) {
    const canal   = CANAIS[c.canal] || { nome: c.canal, icon: '🔌', cor: '#666' };
    const conectado = c.conectado && c.access_token;
    return `
<div class="conta-card">
  <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${canal.cor};border-radius:14px 14px 0 0"></div>
  <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:14px">
    <div style="width:42px;height:42px;background:${canal.cor};border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;color:${canal.textoCor||'#fff'}">${canal.icon}</div>
    <div style="flex:1;min-width:0">
      <div style="font-weight:700;font-size:14px">${c.nome || canal.nome}</div>
      ${c.empresa ? `<div style="font-size:11px;color:var(--accent);font-weight:600">${c.empresa}</div>` : ''}
      ${c.shop_name ? `<div style="font-size:11px;color:var(--text3)">${c.shop_name}${c.shop_id ? ` · ID ${c.shop_id}` : ''}</div>` : ''}
    </div>
    <span style="flex-shrink:0;font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;${conectado?'background:#22c55e22;color:#22c55e':'background:var(--bg3);color:var(--text3)'}">
      ${conectado ? '● Online' : '○ Desconectado'}
    </span>
  </div>
  <div style="display:flex;gap:6px;flex-wrap:wrap">
    ${conectado ? `
      <button class="btn btn-ghost btn-sm" onclick="Marketplace.irContaAnuncios('${c.id}')">📢 Anúncios</button>
      <button class="btn btn-ghost btn-sm" onclick="Marketplace.irContaPedidos('${c.id}')">📦 Pedidos</button>
    ` : `
      <button class="btn btn-primary btn-sm" onclick="Marketplace.reconectar('${c.id}')">🔗 Reconectar</button>
    `}
    <button class="btn btn-ghost btn-sm" onclick="Marketplace.editarConta('${c.id}')" title="Editar">✏️</button>
    <button class="btn btn-danger btn-sm" style="margin-left:auto" onclick="Marketplace.removerConta('${c.id}')">🗑️</button>
  </div>
</div>`;
  }

  // ─── Modal: Adicionar/Editar conta ──────────────────────────────

  function modalAddConta(canalPreselect) {
    const opcoesCanais = Object.entries(CANAIS)
      .filter(([,c]) => c.ativo)
      .map(([id,c]) => `<option value="${id}">${c.icon} ${c.nome}</option>`).join('');

    Modal.open(`
<div style="padding:4px 0">
  <div style="display:grid;gap:14px">

    <div>
      <label class="form-label">Canal / Marketplace *</label>
      <select id="mc-canal" class="input" style="width:100%" onchange="Marketplace._onCanalChange()">
        ${opcoesCanais}
      </select>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div>
        <label class="form-label">Nome da Conta *</label>
        <input id="mc-nome" class="input" style="width:100%" placeholder="Ex: Loja Principal">
        <div style="font-size:10px;color:var(--text3);margin-top:3px">Rótulo para identificar esta conta</div>
      </div>
      <div>
        <label class="form-label">Empresa</label>
        <input id="mc-empresa" class="input" style="width:100%" placeholder="Ex: Bazar Eficaz LTDA">
        <div style="font-size:10px;color:var(--text3);margin-top:3px">A empresa dona desta conta</div>
      </div>
    </div>

    <!-- Campos Shopee -->
    <div id="mc-campos-shopee" style="display:grid;gap:12px">
      <div style="background:var(--bg3);border-radius:10px;padding:12px 14px;font-size:12px;color:var(--text2);line-height:1.6">
        💡 Obtenha o <strong>Partner ID</strong> e <strong>Partner Key</strong> em
        <strong>open.shopee.com</strong> → Apps → sua aplicação → Detalhes.
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <label class="form-label">Partner ID *</label>
          <input id="mc-partner-id" class="input" style="width:100%" placeholder="Ex: 12345678" type="number">
        </div>
        <div>
          <label class="form-label">Partner Key *</label>
          <input id="mc-partner-key" class="input" style="width:100%" placeholder="Chave secreta" type="password">
        </div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text2);cursor:pointer">
        <input type="checkbox" id="mc-sandbox">
        Usar ambiente de teste (Sandbox) — para homologação
      </label>
    </div>

  </div>
  <div class="modal-actions">
    <button class="btn btn-ghost" onclick="Modal.close()">Cancelar</button>
    <button class="btn btn-primary" onclick="Marketplace.salvarNovaConta()">🔗 Salvar e Conectar</button>
  </div>
</div>`, 'Adicionar Canal de Venda');

    if (canalPreselect) {
      const sel = document.getElementById('mc-canal');
      if (sel) { sel.value = canalPreselect; Marketplace._onCanalChange(); }
    }
  }

  function _onCanalChange() {
    const canal = document.getElementById('mc-canal')?.value;
    document.getElementById('mc-campos-shopee').style.display = canal === 'shopee' ? 'grid' : 'none';
  }

  async function salvarNovaConta() {
    const canal      = document.getElementById('mc-canal')?.value;
    const nome       = document.getElementById('mc-nome')?.value?.trim();
    const empresa    = document.getElementById('mc-empresa')?.value?.trim();
    const partnerId  = document.getElementById('mc-partner-id')?.value?.trim();
    const partnerKey = document.getElementById('mc-partner-key')?.value?.trim();
    const sandbox    = document.getElementById('mc-sandbox')?.checked || false;

    if (!nome) { Toast.show('Informe um nome para a conta', 'warning'); return; }
    if (canal === 'shopee' && (!partnerId || !partnerKey)) {
      Toast.show('Preencha Partner ID e Partner Key', 'warning'); return;
    }

    const conta = {
      id:          null, // gerado pelo main process
      canal,
      nome,
      empresa:     empresa || '',
      partner_id:  partnerId || '',
      partner_key: partnerKey || '',
      sandbox,
      conectado:   false,
    };

    await window.pdv.mkt.salvarConta(conta);
    Modal.close();

    if (canal === 'shopee') {
      Toast.show('Abrindo Shopee para autorizar a conta...', 'info', 8000);
      const res = await window.pdv.mkt.conectar(conta.id);
      if (res.ok) {
        Toast.show(`✅ Conectado! Loja: ${res.shop_name}`, 'success', 5000);
      } else {
        Toast.show(`Erro: ${res.erro}`, 'error', 6000);
      }
    }

    ir('canais');
  }

  async function editarConta(id) {
    const conta = await window.pdv.mkt.getConta(id);
    if (!conta) return;
    const canal = CANAIS[conta.canal] || { nome: conta.canal };

    Modal.open(`
<div style="padding:4px 0">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;padding:12px 14px;background:var(--bg3);border-radius:10px">
    <span style="font-size:22px">${CANAIS[conta.canal]?.icon || '🔌'}</span>
    <div><div style="font-weight:600">${canal.nome || conta.canal}</div><div style="font-size:11px;color:var(--text3)">ID: ${conta.id}</div></div>
  </div>
  <div style="display:grid;gap:12px">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div>
        <label class="form-label">Nome da Conta</label>
        <input id="ec-nome" class="input" style="width:100%" value="${conta.nome || ''}">
      </div>
      <div>
        <label class="form-label">Empresa</label>
        <input id="ec-empresa" class="input" style="width:100%" value="${conta.empresa || ''}">
      </div>
    </div>
    ${conta.canal === 'shopee' ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div>
        <label class="form-label">Partner ID</label>
        <input id="ec-partner-id" class="input" style="width:100%" value="${conta.partner_id || ''}">
      </div>
      <div>
        <label class="form-label">Partner Key</label>
        <input id="ec-partner-key" class="input" style="width:100%" type="password" value="${conta.partner_key || ''}">
      </div>
    </div>
    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text2);cursor:pointer">
      <input type="checkbox" id="ec-sandbox" ${conta.sandbox?'checked':''}>Usar Sandbox
    </label>` : ''}
  </div>
  <div class="modal-actions">
    <button class="btn btn-ghost" onclick="Modal.close()">Cancelar</button>
    <button class="btn btn-primary" onclick="Marketplace._confirmarEdicao('${id}')">Salvar</button>
  </div>
</div>`, `Editar — ${conta.nome || canal.nome}`);
  }

  async function _confirmarEdicao(id) {
    const conta = await window.pdv.mkt.getConta(id);
    const atualizado = {
      ...conta,
      nome:        document.getElementById('ec-nome')?.value?.trim()        || conta.nome,
      empresa:     document.getElementById('ec-empresa')?.value?.trim()     || '',
      partner_id:  document.getElementById('ec-partner-id')?.value?.trim()  || conta.partner_id,
      partner_key: document.getElementById('ec-partner-key')?.value?.trim() || conta.partner_key,
      sandbox:     document.getElementById('ec-sandbox')?.checked            ?? conta.sandbox,
    };
    await window.pdv.mkt.salvarConta(atualizado);
    Modal.close();
    Toast.show('Conta atualizada', 'success');
    ir('canais');
  }

  async function reconectar(id) {
    // Abre o browser com a URL OAuth e mostra modal para colar o código manualmente
    window.pdv.mkt.conectar(id); // abre browser, não aguarda
    await _modalCodigoManual(id);
  }

  function _modalCodigoManual(contaId) {
    return new Promise(resolve => {
      Modal.open(`
<div style="padding:4px 0">
  <div style="background:var(--bg3);border-radius:12px;padding:14px 16px;font-size:12px;color:var(--text2);line-height:1.7;margin-bottom:16px">
    <div style="font-weight:700;color:var(--text1);margin-bottom:6px">📋 Como conectar:</div>
    1. O navegador abriu a página da Shopee — faça login e autorize<br>
    2. Após autorizar, o navegador vai para <strong>sistemavargas.com.br</strong> com um código na URL<br>
    3. Copie os valores <strong>code</strong> e <strong>shop_id</strong> da URL e cole abaixo
  </div>

  <div style="background:var(--bg3);border-radius:8px;padding:10px 12px;font-size:11px;font-family:monospace;color:var(--accent);margin-bottom:16px;word-break:break-all">
    Exemplo de URL:<br>
    sistemavargas.com.br/?<strong>code=abc123</strong>&<strong>shop_id=328546513</strong>
  </div>

  <div style="display:grid;gap:12px">
    <div>
      <label class="form-label">Cole a URL completa (ou só o code) *</label>
      <input id="mc-url-completa" class="input" style="width:100%;font-size:12px" placeholder="Cole a URL inteira aqui..." oninput="Marketplace._extrairDaUrl()">
      <div style="font-size:10px;color:var(--text3);margin-top:3px">Cole a URL completa — o sistema extrai automaticamente</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div>
        <label class="form-label">Code</label>
        <input id="mc-code-manual" class="input" style="width:100%;font-size:12px" placeholder="code=...">
      </div>
      <div>
        <label class="form-label">Shop ID</label>
        <input id="mc-shopid-manual" class="input" style="width:100%;font-size:12px" placeholder="328546513">
      </div>
    </div>
  </div>

  <div class="modal-actions">
    <button class="btn btn-ghost" onclick="Modal.close()">Cancelar</button>
    <button class="btn btn-primary" onclick="Marketplace._processarCodigoManual('${contaId}')">✅ Conectar</button>
  </div>
</div>`, 'Autorização Shopee — Inserir Código');
    });
  }

  function _extrairDaUrl() {
    const raw = document.getElementById('mc-url-completa')?.value || '';
    try {
      const url = raw.includes('?') ? new URL(raw.startsWith('http') ? raw : 'https://' + raw) : null;
      if (url) {
        const code   = url.searchParams.get('code');
        const shopId = url.searchParams.get('shop_id');
        if (code)   document.getElementById('mc-code-manual').value   = code;
        if (shopId) document.getElementById('mc-shopid-manual').value = shopId;
      }
    } catch {}
  }

  async function _processarCodigoManual(contaId) {
    const code   = document.getElementById('mc-code-manual')?.value?.trim();
    const shopId = document.getElementById('mc-shopid-manual')?.value?.trim();
    if (!code || !shopId) { Toast.show('Preencha o code e o shop_id', 'warning'); return; }

    Modal.close();
    Toast.show('Processando autorização...', 'info', 5000);
    const res = await window.pdv.mkt.trocarCodigo(contaId, code, shopId);
    if (res?.ok) {
      Toast.show(`✅ Conectado: ${res.shop_name || 'Loja ' + shopId}`, 'success', 5000);
    } else {
      Toast.show(`Erro: ${res?.erro || 'Falha ao trocar código'}`, 'error', 6000);
    }
    ir('canais');
  }

  async function removerConta(id) {
    const conta = await window.pdv.mkt.getConta(id);
    const ok = await window.pdv.app.confirm(`Remover a conta "${conta?.nome || id}"? Esta ação não pode ser desfeita.`);
    if (!ok) return;
    await window.pdv.mkt.removerConta(id);
    Toast.show('Conta removida', 'warning');
    ir('canais');
  }

  // ─── Anúncios (por conta) ───────────────────────────────────────

  function irContaAnuncios(contaId) { _contaAtiva = contaId; ir('anuncios'); }

  async function renderAnuncios(el) {
    const contas = (await window.pdv.mkt.listarContas()) || [];
    const conectadas = contas.filter(c => c.conectado && c.access_token);
    if (!conectadas.length) { el.innerHTML = _semContas('anúncios'); return; }
    const conta = conectadas.find(c => c.id === _contaAtiva) || conectadas[0];
    _contaAtiva = conta.id;

    const info = await window.pdv.mkt.anunciosLocal.total(_contaAtiva) || {};

    el.innerHTML = `
<div style="padding:20px 28px">
  <!-- Toolbar -->
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap">
    <div style="font-size:16px;font-weight:700;margin-right:4px">Anúncios</div>
    <select class="input" style="font-size:12px;width:auto" onchange="Marketplace._trocarContaAnuncios(this.value)">
      ${conectadas.map(c => `<option value="${c.id}" ${c.id===conta.id?'selected':''}>${CANAIS[c.canal]?.icon||'🔌'} ${c.nome}${c.empresa?' · '+c.empresa:''}</option>`).join('')}
    </select>
    <input id="mkt-busca-anuncio" class="input" style="font-size:12px;width:200px" placeholder="🔍 Buscar produto..." oninput="Marketplace._buscarAnuncios()">
    <!-- Filtros de status -->
    <div style="display:flex;gap:4px;margin-left:4px" id="mkt-status-filtros">
      ${[['', 'Todos'], ['NORMAL', 'Ativos'], ['UNLIST', 'Pausados'], ['BANNED', 'Banidos']].map(([val, label], i) =>
        `<button class="btn btn-sm ${i===1?'btn-primary':'btn-ghost'}" data-status="${val}" onclick="Marketplace._filtrarStatus('${val}', this)">${label}</button>`
      ).join('')}
    </div>
    <div style="margin-left:auto;display:flex;gap:6px">
      <button class="btn btn-ghost btn-sm" onclick="Marketplace._verificarNovos()" title="Verificar novos na Shopee">🔔 Verificar novos</button>
      <button class="btn btn-ghost btn-sm" onclick="Marketplace._abrirModalMapeamentoMassa()" title="Mapear anúncios por SKU em massa">🔗 Mapear por SKU</button>
      <button class="btn btn-ghost btn-sm" id="btn-enviar-base44" onclick="Marketplace._enviarBase44()" title="Enviar anúncios para o Base44">☁ Enviar Base44</button>
      <button class="btn btn-primary btn-sm" id="btn-importar-tudo" onclick="Marketplace._importarTodos()">⬇ Importar todos</button>
    </div>
  </div>
  <!-- Info linha -->
  <div style="font-size:11px;color:var(--text3);margin-bottom:12px" id="mkt-anuncios-info">
    ${info.total ? `${info.total} anúncio(s) no banco · Última sync: ${info.ultima_sync ? new Date(info.ultima_sync).toLocaleString('pt-BR') : 'nunca'}` : 'Nenhum anúncio importado ainda. Clique em "Importar todos".'}
  </div>
  <!-- Progress bars (ocultas) -->
  <div id="mkt-import-progress" style="display:none;margin-bottom:8px">
    <div style="font-size:12px;color:var(--text2);margin-bottom:4px" id="mkt-import-txt">Importando...</div>
    <div style="background:var(--bg3);border-radius:4px;height:6px"><div id="mkt-import-bar" style="background:var(--accent);height:6px;border-radius:4px;width:0%;transition:.3s"></div></div>
  </div>
  <div id="mkt-base44-progress" style="display:none;margin-bottom:8px">
    <div style="font-size:12px;color:var(--text2);margin-bottom:4px" id="mkt-base44-txt">Enviando para Base44...</div>
    <div style="background:var(--bg3);border-radius:4px;height:6px"><div id="mkt-base44-bar" style="background:#10b981;height:6px;border-radius:4px;width:0%;transition:.3s"></div></div>
  </div>
  <!-- Lista -->
  <div id="mkt-anuncios-lista"></div>
</div>`;

    // Registrar listeners de progresso
    window.pdv.mkt.anunciosLocal.onProgresso(({ n, t }) => {
      document.getElementById('mkt-import-txt').textContent = `Importando... ${n} de ${t}`;
      document.getElementById('mkt-import-bar').style.width = Math.round(n/t*100) + '%';
    });
    window.pdv.mkt.anunciosLocal.onBase44Progresso(({ n, t }) => {
      document.getElementById('mkt-base44-txt').textContent = `Enviando para Base44... ${n} de ${t}`;
      document.getElementById('mkt-base44-bar').style.width = Math.round(n/t*100) + '%';
    });

    // Verificar novos em background
    window.pdv.mkt.anunciosLocal.verificarNovos(_contaAtiva).then(r => {
      if (r?.novos > 0) Toast.show(`${r.novos} novo(s) anúncio(s) encontrado(s) na Shopee!`, 'info');
    }).catch(() => {});

    _carregarAnuncios();
  }

  let _statusFiltro = 'NORMAL';
  let _paginaAtual  = 0;

  function _filtrarStatus(status, btn) {
    _statusFiltro = status;
    _paginaAtual  = 0;
    document.querySelectorAll('#mkt-status-filtros button').forEach(b => {
      b.classList.remove('btn-primary'); b.classList.add('btn-ghost');
    });
    btn.classList.remove('btn-ghost'); btn.classList.add('btn-primary');
    _carregarAnuncios();
  }

  function _trocarContaAnuncios(id) { _contaAtiva = id; _paginaAtual = 0; _carregarAnuncios(); }

  function _irPagina(p) { _paginaAtual = p; _carregarAnuncios(); }

  let _buscaTimer = null;
  function _buscarAnuncios() {
    _paginaAtual = 0;
    clearTimeout(_buscaTimer);
    _buscaTimer = setTimeout(_carregarAnuncios, 300);
  }

  async function _importarTodos() {
    const btn = document.getElementById('btn-importar-tudo');
    if (btn) btn.disabled = true;
    document.getElementById('mkt-import-progress').style.display = 'block';
    document.getElementById('mkt-import-bar').style.width = '0%';
    const res = await window.pdv.mkt.anunciosLocal.importar(_contaAtiva);
    document.getElementById('mkt-import-progress').style.display = 'none';
    if (btn) btn.disabled = false;
    if (res.ok) {
      Toast.show(`✅ ${res.importados} anúncio(s) importados!`, 'success');
      _carregarAnuncios();
    } else {
      Toast.show(`Erro: ${res.erro}`, 'error', 5000);
    }
  }

  async function _verificarNovos() {
    Toast.show('Verificando novos anúncios na Shopee...', 'info', 3000);
    const res = await window.pdv.mkt.anunciosLocal.verificarNovos(_contaAtiva);
    if (res?.ok) {
      if (res.novos > 0) { Toast.show(`${res.novos} novo(s) anúncio(s) adicionado(s)!`, 'success'); _carregarAnuncios(); }
      else Toast.show('Nenhum anúncio novo encontrado.', 'info');
    } else { Toast.show(`Erro: ${res?.erro}`, 'error'); }
  }

  async function _enviarBase44() {
    const btn = document.getElementById('btn-enviar-base44');
    if (btn) btn.disabled = true;
    document.getElementById('mkt-base44-progress').style.display = 'block';
    document.getElementById('mkt-base44-bar').style.width = '0%';
    document.getElementById('mkt-base44-txt').textContent = 'Preparando envio...';
    const res = await window.pdv.mkt.anunciosLocal.enviarBase44(_contaAtiva);
    document.getElementById('mkt-base44-progress').style.display = 'none';
    if (btn) btn.disabled = false;
    if (res.ok) {
      Toast.show(`✅ ${res.enviados} anúncio(s) enviados ao Base44${res.erros ? ` (${res.erros} erro(s))` : ''}!`, 'success', 5000);
    } else {
      Toast.show(`Erro: ${res.erro}`, 'error', 6000);
    }
  }

  async function _sincronizarAnuncio(itemId) {
    Toast.show('Sincronizando com a Shopee...', 'info', 3000);
    const res = await window.pdv.mkt.anunciosLocal.sincronizarUm(_contaAtiva, itemId);
    if (res?.ok) { Toast.show('Anúncio atualizado!', 'success'); _carregarAnuncios(); }
    else Toast.show(`Erro: ${res?.erro}`, 'error');
  }

  let _selecionados = new Set();

  function _toggleSelecionado(itemId, cb) {
    if (cb.checked) _selecionados.add(itemId); else _selecionados.delete(itemId);
    _atualizarBarraSel();
  }

  function _toggleTodos(cb) {
    document.querySelectorAll('.mkt-chk-item').forEach(c => {
      c.checked = cb.checked;
      if (cb.checked) _selecionados.add(c.dataset.id); else _selecionados.delete(c.dataset.id);
    });
    _atualizarBarraSel();
  }

  function _atualizarBarraSel() {
    const bar = document.getElementById('mkt-sel-bar');
    const n   = _selecionados.size;
    if (bar) { bar.style.display = n > 0 ? 'flex' : 'none'; bar.querySelector('span').textContent = `${n} selecionado(s)`; }
  }

  async function _sincronizarSelecionados() {
    const ids = [..._selecionados];
    if (!ids.length) return;
    const bar = document.getElementById('mkt-sel-bar');
    if (bar) bar.querySelector('button').disabled = true;
    Toast.show(`Sincronizando ${ids.length} anúncio(s)...`, 'info', 3000);
    let ok = 0, erros = 0;
    for (const id of ids) {
      const res = await window.pdv.mkt.anunciosLocal.sincronizarUm(_contaAtiva, id);
      if (res?.ok) ok++; else erros++;
    }
    _selecionados.clear();
    Toast.show(`✅ ${ok} atualizado(s)${erros ? ` · ${erros} erro(s)` : ''}`, ok > 0 ? 'success' : 'error');
    _carregarAnuncios();
  }

  async function _carregarAnuncios() {
    const el = document.getElementById('mkt-anuncios-lista');
    if (!el || !_contaAtiva) return;
    const busca = document.getElementById('mkt-busca-anuncio')?.value || '';
    const res = await window.pdv.mkt.anunciosLocal.listar(_contaAtiva, busca, _statusFiltro, _paginaAtual);
    const { rows: items, total, totalPaginas } = res;

    if (!items.length) {
      el.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text3)">
        <div style="font-size:32px;margin-bottom:12px">📭</div>
        <div>${busca ? 'Nenhum resultado para "'+busca+'"' : 'Nenhum anúncio importado. Clique em "Importar todos".'}</div>
      </div>`;
      return;
    }

    const fmt = v => v != null ? 'R$ ' + Number(v).toFixed(2).replace('.',',') : '—';
    const STATUS = {
      NORMAL:  ['Ativo',    'badge-green'],
      UNLIST:  ['Pausado',  'badge-yellow'],
      BANNED:  ['Banido',   'badge-red'],
      DELETED: ['Excluído', 'badge-red'],
    };

    // Paginação
    const inicio = _paginaAtual * 50 + 1;
    const fim    = Math.min((_paginaAtual + 1) * 50, total);
    const pagBtns = [];
    if (totalPaginas > 1) {
      if (_paginaAtual > 0) pagBtns.push(`<button class="btn btn-ghost btn-sm" onclick="Marketplace._irPagina(${_paginaAtual-1})">‹</button>`);
      const start = Math.max(0, _paginaAtual - 2);
      const end   = Math.min(totalPaginas - 1, _paginaAtual + 2);
      for (let p = start; p <= end; p++) {
        pagBtns.push(`<button class="btn btn-sm ${p===_paginaAtual?'btn-primary':'btn-ghost'}" onclick="Marketplace._irPagina(${p})">${p+1}</button>`);
      }
      if (_paginaAtual < totalPaginas - 1) pagBtns.push(`<button class="btn btn-ghost btn-sm" onclick="Marketplace._irPagina(${_paginaAtual+1})">›</button>`);
    }

    el.innerHTML = `
<!-- Barra de seleção flutuante -->
<div id="mkt-sel-bar" style="display:none;align-items:center;gap:10px;background:var(--accent);color:#fff;padding:8px 16px;border-radius:8px;margin-bottom:10px">
  <span></span>
  <button class="btn btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:none" onclick="Marketplace._sincronizarSelecionados()">↻ Sincronizar selecionados</button>
  <button class="btn btn-sm" style="background:rgba(255,255,255,.15);color:#fff;border:none;margin-left:auto" onclick="Marketplace._limparSelecao()">✕ Limpar</button>
</div>

<div class="table-wrap"><table>
  <thead><tr>
    <th style="width:32px;text-align:center"><input type="checkbox" onclick="Marketplace._toggleTodos(this)" title="Selecionar todos"></th>
    <th style="width:52px"></th>
    <th>Produto</th>
    <th style="width:90px;text-align:center">Status</th>
    <th style="width:110px;text-align:right">Preço</th>
    <th style="width:80px;text-align:center">Estoque</th>
    <th style="width:75px;text-align:center">Vendas</th>
    <th style="width:130px">Produto vinculado</th>
    <th style="width:70px;text-align:center">Ações</th>
  </tr></thead>
  <tbody>
  ${items.map(i => {
    let statusReal = i.status || 'NORMAL';
    try { const d = JSON.parse(i.dados_json||'{}'); if (d.item_status) statusReal = d.item_status; } catch {}
    const [slabel, sbadge] = STATUS[statusReal] || ['Ativo','badge-green'];

    let sku = '—', variacoes = '';
    try {
      const d = JSON.parse(i.dados_json||'{}');
      sku = d.item_sku || '—';
      const nVar = d.model?.length || 0;
      if (nVar > 1) variacoes = `${nVar} var.`;
    } catch {}

    const checked = _selecionados.has(i.item_id) ? 'checked' : '';
    const mapeado = i.status_mapeamento === 'mapeado' && i.produto_id;
    const mapeamentoHtml = mapeado
      ? `<div style="font-size:11px;font-weight:600;color:var(--green);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px" title="${i.produto_nome}">✓ ${i.produto_nome}</div>
         <div style="font-size:10px;color:var(--text3)">${i.produto_sku||''}</div>`
      : `<span style="font-size:10px;color:var(--yellow)">⚠ Não mapeado</span>`;

    return `<tr style="vertical-align:middle">
      <td style="text-align:center;padding:6px 4px">
        <input type="checkbox" class="mkt-chk-item" data-id="${i.item_id}" ${checked}
          onchange="Marketplace._toggleSelecionado('${i.item_id}', this)">
      </td>
      <td style="padding:6px">
        ${i.imagem_url
          ? `<img src="${i.imagem_url}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;border:1px solid var(--border)">`
          : '<div style="width:44px;height:44px;background:var(--bg3);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px">📦</div>'}
      </td>
      <td style="padding:6px 8px">
        <div style="font-weight:600;font-size:13px;line-height:1.3">${i.nome || '—'}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;display:flex;gap:8px">
          <span>ID: ${i.item_id}</span>
          ${sku !== '—' ? `<span>SKU: ${sku}</span>` : ''}
          ${variacoes ? `<span style="color:var(--accent)">${variacoes}</span>` : ''}
        </div>
      </td>
      <td style="text-align:center"><span class="badge ${sbadge}">${slabel}</span></td>
      <td style="text-align:right;font-weight:700;color:var(--accent);font-size:13px">${fmt(i.preco)}</td>
      <td style="text-align:center;font-size:13px">${i.estoque ?? '—'}</td>
      <td style="text-align:center;font-size:13px">${i.vendas ?? '—'}</td>
      <td style="padding:4px 6px">${mapeamentoHtml}</td>
      <td style="text-align:center">
        <div style="display:flex;gap:2px;justify-content:center">
          <button class="btn btn-ghost btn-sm" title="Mapear produto" style="${mapeado?'':'color:var(--yellow)'}"
            onclick="Marketplace._abrirModalMapear('${i.item_id}','${(i.nome||'').replace(/'/g,"\\'")}','${i.produto_id||''}','${(i.produto_nome||'').replace(/'/g,"\\'")}')">🔗</button>
          <button class="btn btn-ghost btn-sm" title="Sincronizar com Shopee" onclick="Marketplace._sincronizarAnuncio('${i.item_id}')">↻</button>
        </div>
      </td>
    </tr>`;
  }).join('')}
  </tbody>
</table></div>
<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px">
  <div style="font-size:11px;color:var(--text3)">${inicio}–${fim} de ${total} anúncio(s)</div>
  ${pagBtns.length ? `<div style="display:flex;gap:4px">${pagBtns.join('')}</div>` : ''}
</div>`;

    _atualizarBarraSel();
  }

  // ─── Modal de Mapeamento de Produto ────────────────────────────

  let _mapearItemId = null;

  function _abrirModalMapear(itemId, nomeAnuncio, produtoIdAtual, produtoNomeAtual) {
    _mapearItemId = itemId;
    const modal = document.createElement('div');
    modal.id = 'modal-mapear';
    modal.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
<div style="background:var(--bg2);border-radius:16px;padding:24px;width:520px;max-width:95vw;box-shadow:var(--shadow-lg)">
  <div style="font-size:16px;font-weight:700;margin-bottom:4px">Vincular produto</div>
  <div style="font-size:12px;color:var(--text3);margin-bottom:16px">Anúncio: <b>${nomeAnuncio}</b></div>

  ${produtoNomeAtual ? `<div style="background:var(--bg3);border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:12px">
    <span style="color:var(--text3)">Atual: </span><b style="color:var(--green)">${produtoNomeAtual}</b>
    <button class="btn btn-ghost btn-sm" style="float:right;font-size:10px;color:var(--red)" onclick="Marketplace._removerMapeamento()">Desvincular</button>
  </div>` : ''}

  <input id="mkt-map-busca" class="input" placeholder="🔍 Buscar produto no sistema..." autocomplete="off"
    oninput="Marketplace._buscarProdutoMapear(this.value)" style="margin-bottom:10px;width:100%;box-sizing:border-box">
  <div id="mkt-map-resultados" style="max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:8px"></div>

  <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
    <button class="btn btn-ghost" onclick="document.getElementById('modal-mapear').remove()">Cancelar</button>
  </div>
</div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    modal.addEventListener('remove', () => document.removeEventListener('keydown', _mapKeyNav));
    setTimeout(() => {
      const inp = document.getElementById('mkt-map-busca');
      inp?.focus();
      inp?.addEventListener('keydown', _mapKeyNav);
    }, 100);
  }

  let _mapBuscaTimer = null;
  let _mapProdutosCache = [];
  let _mapHighlight = -1;

  async function _buscarProdutoMapear(q) {
    clearTimeout(_mapBuscaTimer);
    _mapHighlight = -1;
    const el = document.getElementById('mkt-map-resultados');
    if (!q.trim()) { if (el) el.innerHTML = ''; _mapProdutosCache = []; return; }
    _mapBuscaTimer = setTimeout(async () => {
      if (el) el.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text3);font-size:12px">Buscando...</div>';
      const produtos = await window.pdv.produtos.buscar(q);
      _mapProdutosCache = produtos.slice(0, 20);
      if (!_mapProdutosCache.length) {
        if (el) el.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text3);font-size:12px">Nenhum produto encontrado</div>';
        return;
      }
      _renderMapResultados();
    }, 280);
  }

  function _renderMapResultados() {
    const el = document.getElementById('mkt-map-resultados');
    if (!el) return;
    el.innerHTML = _mapProdutosCache.map((p, idx) => `
      <div class="mkt-map-item" data-idx="${idx}"
        style="display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--border)"
        onclick="Marketplace._selecionarProdutoMapear(${idx})">
        <div style="font-size:18px">${p.emoji||'📦'}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600">${p.nome}</div>
          <div style="font-size:10px;color:var(--text3)">${p.sku||''} ${p.marca?'· '+p.marca:''} · R$ ${Number(p.preco_venda||0).toFixed(2).replace('.',',')}</div>
        </div>
        <span style="font-size:11px;color:var(--accent);flex-shrink:0">Vincular →</span>
      </div>`).join('');
  }

  function _mapKeyNav(e) {
    const items = document.querySelectorAll('.mkt-map-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _mapHighlight = Math.min(_mapHighlight + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _mapHighlight = Math.max(_mapHighlight - 1, 0);
    } else if (e.key === 'Enter' && _mapHighlight >= 0) {
      e.preventDefault();
      _selecionarProdutoMapear(_mapHighlight);
      return;
    } else return;
    items.forEach((el, i) => el.style.background = i === _mapHighlight ? 'var(--bg3)' : '');
    items[_mapHighlight]?.scrollIntoView({ block: 'nearest' });
  }

  async function _selecionarProdutoMapear(idx) {
    const p = _mapProdutosCache[idx];
    if (!p || !_mapearItemId) return;
    const produto = { id: p.id || p.remote_id || p._id, nome: p.nome, sku: p.sku || '' };
    const res = await window.pdv.mkt.anunciosLocal.mapear(_contaAtiva, _mapearItemId, produto);
    document.getElementById('modal-mapear')?.remove();
    if (res?.ok) {
      Toast.show(`✅ Anúncio vinculado a "${produto.nome}"!`, 'success');
      _carregarAnuncios();
    } else {
      Toast.show(`Erro: ${res?.erro}`, 'error');
    }
  }

  async function _confirmarMapeamento(idx) { _selecionarProdutoMapear(idx); }

  async function _removerMapeamento() {
    if (!_mapearItemId) return;
    await window.pdv.mkt.anunciosLocal.mapear(_contaAtiva, _mapearItemId, { id: null, nome: null, sku: null });
    document.getElementById('modal-mapear')?.remove();
    Toast.show('Vínculo removido.', 'info');
    _carregarAnuncios();
  }

  // ─── Mapeamento em massa por SKU ─────────────────────────────────

  async function _abrirModalMapeamentoMassa() {
    const modal = document.createElement('div');
    modal.id = 'modal-map-massa';
    modal.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
<div style="background:var(--bg2);border-radius:16px;padding:24px;width:720px;max-width:95vw;max-height:90vh;display:flex;flex-direction:column;box-shadow:var(--shadow-lg)">
  <div style="font-size:16px;font-weight:700;margin-bottom:4px">Mapeamento em massa por SKU</div>
  <div style="font-size:12px;color:var(--text3);margin-bottom:16px">O sistema compara o SKU dos anúncios com o SKU dos produtos do sistema e sugere os vínculos.</div>
  <div id="map-massa-corpo" style="flex:1;overflow-y:auto">
    <div style="text-align:center;padding:40px;color:var(--text3)">Analisando SKUs...</div>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">
    <div id="map-massa-info" style="font-size:12px;color:var(--text3)"></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-ghost" onclick="document.getElementById('modal-map-massa').remove()">Fechar</button>
      <button class="btn btn-primary" id="btn-confirmar-massa" onclick="Marketplace._confirmarMapeamentoMassa()" disabled>✓ Confirmar selecionados</button>
    </div>
  </div>
</div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    await _analisarSkusMassa();
  }

  let _sugestoesMassa = [];

  async function _analisarSkusMassa() {
    const corpo = document.getElementById('map-massa-corpo');
    const info  = document.getElementById('map-massa-info');
    const btn   = document.getElementById('btn-confirmar-massa');
    _sugestoesMassa = [];

    // Busca todos os anúncios não mapeados com SKU
    const res = await window.pdv.mkt.anunciosLocal.listar(_contaAtiva, '', '', 0, 9999);
    const naoMapeados = (res.rows || []).filter(a => a.status_mapeamento !== 'mapeado');

    if (!naoMapeados.length) {
      if (corpo) corpo.innerHTML = '<div style="text-align:center;padding:40px;color:var(--green)">✅ Todos os anúncios já estão mapeados!</div>';
      return;
    }

    // Para cada anúncio com SKU, busca produto pelo SKU
    const sugestoes = [];
    for (const an of naoMapeados) {
      let skuAnuncio = '';
      try { const d = JSON.parse(an.dados_json||'{}'); skuAnuncio = d.item_sku || ''; } catch {}
      if (!skuAnuncio) continue;

      const produtos = await window.pdv.produtos.buscar(skuAnuncio);
      const match = produtos.find(p => (p.sku||'').toLowerCase() === skuAnuncio.toLowerCase());
      sugestoes.push({ anuncio: an, skuAnuncio, produto: match || null, selecionado: !!match });
    }
    _sugestoesMassa = sugestoes;

    const comMatch = sugestoes.filter(s => s.produto).length;
    const semSku   = naoMapeados.length - sugestoes.length;

    if (info) info.textContent = `${comMatch} correspondência(s) encontrada(s) · ${sugestoes.length - comMatch} sem match · ${semSku} sem SKU`;
    if (btn)  btn.disabled = comMatch === 0;

    if (!sugestoes.length) {
      if (corpo) corpo.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">Nenhum anúncio com SKU para comparar. Use o vínculo manual 🔗.</div>';
      return;
    }

    if (corpo) corpo.innerHTML = `
<table style="width:100%;border-collapse:collapse">
  <thead><tr style="background:var(--bg3)">
    <th style="padding:8px;text-align:left;font-size:11px;font-weight:600;width:32px">
      <input type="checkbox" id="chk-massa-todos" checked onchange="Marketplace._toggleTodosMassa(this)">
    </th>
    <th style="padding:8px;text-align:left;font-size:11px;font-weight:600">Anúncio (Shopee)</th>
    <th style="padding:8px;text-align:center;font-size:11px;font-weight:600;width:40px">SKU</th>
    <th style="padding:8px;text-align:center;font-size:11px;font-weight:600;width:40px"></th>
    <th style="padding:8px;text-align:left;font-size:11px;font-weight:600">Produto do sistema</th>
  </tr></thead>
  <tbody>
  ${sugestoes.map((s, idx) => {
    const cor = s.produto ? 'var(--green)' : 'var(--red)';
    const icone = s.produto ? '✓' : '✗';
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:8px;text-align:center">
        ${s.produto ? `<input type="checkbox" class="chk-massa-item" data-idx="${idx}" ${s.selecionado?'checked':''}>` : ''}
      </td>
      <td style="padding:8px">
        <div style="font-size:12px;font-weight:600;line-height:1.3">${s.anuncio.nome||'—'}</div>
        <div style="font-size:10px;color:var(--text3)">SKU: ${s.skuAnuncio}</div>
      </td>
      <td style="text-align:center;font-size:18px;color:${cor}">${icone}</td>
      <td style="text-align:center;font-size:10px;font-family:monospace;color:${cor}">${s.skuAnuncio}</td>
      <td style="padding:8px">
        ${s.produto
          ? `<div style="font-size:12px;font-weight:600">${s.produto.nome}</div><div style="font-size:10px;color:var(--text3)">${s.produto.sku||''}</div>`
          : `<span style="font-size:11px;color:var(--text3)">Sem correspondência</span>`}
      </td>
    </tr>`;
  }).join('')}
  </tbody>
</table>`;
  }

  function _toggleTodosMassa(cb) {
    document.querySelectorAll('.chk-massa-item').forEach(c => { c.checked = cb.checked; });
    _sugestoesMassa.forEach((s, i) => { if (s.produto) s.selecionado = cb.checked; });
  }

  async function _confirmarMapeamentoMassa() {
    const checks = document.querySelectorAll('.chk-massa-item:checked');
    const indices = [...checks].map(c => Number(c.dataset.idx));
    if (!indices.length) return;

    const btn = document.getElementById('btn-confirmar-massa');
    if (btn) btn.disabled = true;
    if (btn) btn.textContent = 'Salvando...';

    let ok = 0;
    for (const idx of indices) {
      const s = _sugestoesMassa[idx];
      if (!s?.produto) continue;
      const produto = { id: s.produto.id || s.produto.remote_id || s.produto._id, nome: s.produto.nome, sku: s.produto.sku || '' };
      const res = await window.pdv.mkt.anunciosLocal.mapear(_contaAtiva, s.anuncio.item_id, produto);
      if (res?.ok) ok++;
    }

    document.getElementById('modal-map-massa')?.remove();
    Toast.show(`✅ ${ok} anúncio(s) mapeados!`, 'success');
    _carregarAnuncios();
  }

  // ─── Modal de edição do pedido (mapeamento de itens) ────────────

  let _pedidoEditando = null;
  let _pedidoItensCache = [];
  let _itemEditandoIdx = null;
  let _itemBuscaTimer = null;
  let _itemProdutosCache = [];

  async function _abrirModalPedido(pedidoId) {
    // Busca pedido do banco
    const res = await window.pdv.mkt.pedidosLocal.listar(_contaAtiva, { busca: pedidoId }, 0);
    const pedido = (res.rows || []).find(p => p.pedido_id === pedidoId);
    if (!pedido) { Toast.show('Pedido não encontrado.', 'error'); return; }

    _pedidoEditando = pedidoId;
    _pedidoItensCache = JSON.parse(pedido.itens_json || '[]');

    const modal = document.createElement('div');
    modal.id = 'modal-pedido-edit';
    modal.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
<div style="background:var(--bg2);border-radius:16px;padding:24px;width:700px;max-width:95vw;max-height:90vh;display:flex;flex-direction:column;box-shadow:var(--shadow-lg)">
  <div style="font-size:16px;font-weight:700;margin-bottom:2px">Pedido ${pedidoId}</div>
  <div style="font-size:12px;color:var(--text3);margin-bottom:16px">${pedido.cliente_nome || ''} · R$ ${Number(pedido.valor_total||0).toFixed(2).replace('.',',')}</div>
  <div id="pedido-itens-lista" style="flex:1;overflow-y:auto"></div>
  <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">
    <button class="btn btn-ghost" onclick="document.getElementById('modal-pedido-edit').remove()">Fechar</button>
  </div>
</div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    _renderItensModal();
  }

  function _renderItensModal() {
    const el = document.getElementById('pedido-itens-lista');
    if (!el) return;
    el.innerHTML = _pedidoItensCache.map((item, idx) => {
      const naoMapeado = item.nao_mapeado !== false;
      return `
      <div style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:8px;${naoMapeado?'border-color:var(--yellow)':''}">
        <div style="display:flex;align-items:flex-start;gap:10px">
          ${item.thumbnail_url ? `<img src="${item.thumbnail_url}" style="width:48px;height:48px;object-fit:cover;border-radius:6px;flex-shrink:0">` : '<div style="width:48px;height:48px;background:var(--bg3);border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center">📦</div>'}
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600">${item.produto_nome || item.variation_descricao || '—'}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:2px">
              ${item.sku_marketplace ? `SKU: ${item.sku_marketplace}` : ''} · Qtd: ${item.quantidade||1} · R$ ${Number(item.preco_unitario||0).toFixed(2).replace('.',',')}
            </div>
            ${naoMapeado
              ? `<div style="font-size:11px;color:var(--yellow);margin-top:4px">⚠ Anúncio não mapeado — usando produto genérico</div>`
              : `<div style="font-size:11px;color:var(--green);margin-top:4px">✓ Produto: <b>${item.produto_nome}</b> (${item.produto_sku||''})</div>`
            }
          </div>
          <button class="btn btn-sm ${naoMapeado?'btn-primary':'btn-ghost'}" style="flex-shrink:0"
            onclick="Marketplace._abrirBuscaItemPedido(${idx})">
            ${naoMapeado ? '🔗 Mapear' : '✏️ Alterar'}
          </button>
        </div>
        <div id="item-busca-${idx}" style="display:none;margin-top:10px">
          <input class="input" placeholder="🔍 Buscar produto..." oninput="Marketplace._buscarItemPedido(this.value, ${idx})"
            style="width:100%;box-sizing:border-box;margin-bottom:6px">
          <div id="item-resultados-${idx}" style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:8px"></div>
        </div>
      </div>`;
    }).join('');
  }

  function _abrirBuscaItemPedido(idx) {
    // Fecha outros abertos
    document.querySelectorAll('[id^="item-busca-"]').forEach(el => el.style.display = 'none');
    const el = document.getElementById(`item-busca-${idx}`);
    if (el) { el.style.display = 'block'; el.querySelector('input')?.focus(); }
    _itemEditandoIdx = idx;
  }

  function _buscarItemPedido(q, idx) {
    clearTimeout(_itemBuscaTimer);
    const res = document.getElementById(`item-resultados-${idx}`);
    if (!q.trim()) { if (res) res.innerHTML = ''; return; }
    _itemBuscaTimer = setTimeout(async () => {
      if (res) res.innerHTML = '<div style="padding:8px;font-size:11px;color:var(--text3)">Buscando...</div>';
      const produtos = await window.pdv.produtos.buscar(q);
      _itemProdutosCache = produtos.slice(0, 15);
      if (!_itemProdutosCache.length) {
        if (res) res.innerHTML = '<div style="padding:8px;font-size:11px;color:var(--text3)">Nenhum produto encontrado</div>';
        return;
      }
      if (res) res.innerHTML = _itemProdutosCache.map((p, pidx) => `
        <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;cursor:pointer;border-bottom:1px solid var(--border)"
          onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''"
          onclick="Marketplace._selecionarProdutoItem(${idx}, ${pidx})">
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:600">${p.nome}</div>
            <div style="font-size:10px;color:var(--text3)">${p.sku||''} ${p.marca?'· '+p.marca:''} · R$ ${Number(p.preco_venda||0).toFixed(2).replace('.',',')}</div>
          </div>
          <span style="font-size:11px;color:var(--accent)">Vincular →</span>
        </div>`).join('');
    }, 280);
  }

  async function _selecionarProdutoItem(itemIdx, prodIdx) {
    const p = _itemProdutosCache[prodIdx];
    if (!p) return;
    const produto = { id: p.id || p.remote_id || p._id, nome: p.nome, sku: p.sku || '' };

    const btn = document.querySelector(`#item-busca-${itemIdx}`)?.previousElementSibling?.querySelector('button');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    const res = await window.pdv.mkt.pedidosLocal.atualizarItem(_contaAtiva, _pedidoEditando, itemIdx, produto);
    if (res?.ok) {
      _pedidoItensCache[itemIdx] = { ..._pedidoItensCache[itemIdx], produto_id: produto.id, produto_nome: produto.nome, produto_sku: produto.sku, nao_mapeado: false };
      _renderItensModal();
      Toast.show(`✅ Item vinculado a "${produto.nome}"!`, 'success');
      _carregarPedidos();
    } else {
      Toast.show(`Erro: ${res?.erro}`, 'error');
      if (btn) { btn.disabled = false; btn.textContent = '🔗 Mapear'; }
    }
  }

  // ─── Pedidos (por conta) ────────────────────────────────────────

  function irContaPedidos(contaId) { _contaAtiva = contaId; ir('pedidos'); }

  let _pedidoPagina = 0;
  let _pedidoStatus = '';
  let _pedidoBusca  = '';

  async function renderPedidos(el) {
    const contas = (await window.pdv.mkt.listarContas()) || [];
    const conectadas = contas.filter(c => c.conectado && c.access_token);
    if (!conectadas.length) { el.innerHTML = _semContas('pedidos'); return; }
    const conta = conectadas.find(c => c.id === _contaAtiva) || conectadas[0];
    _contaAtiva = conta.id;

    el.innerHTML = `
<div style="padding:20px 28px">
  <!-- Toolbar -->
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">
    <div style="font-size:16px;font-weight:700;margin-right:4px">Pedidos</div>
    <select class="input" style="font-size:12px;width:auto" onchange="Marketplace._trocarContaPedidos(this.value)">
      ${conectadas.map(c => `<option value="${c.id}" ${c.id===conta.id?'selected':''}>${CANAIS[c.canal]?.icon||'🔌'} ${c.nome}${c.empresa?' · '+c.empresa:''}</option>`).join('')}
    </select>
    <input id="mkt-busca-pedido" class="input" style="font-size:12px;width:180px" placeholder="🔍 Nº pedido / cliente..." oninput="Marketplace._buscarPedidos()">
    <div style="margin-left:auto;display:flex;gap:6px">
      <button class="btn btn-ghost btn-sm" onclick="Marketplace._buscarNovos()" title="Buscar novos pedidos na Shopee">🔔 Buscar novos</button>
      <button class="btn btn-primary btn-sm" id="btn-importar-pedidos" onclick="Marketplace._importarPedidos()">⬇ Importar 30 dias</button>
    </div>
  </div>
  <!-- Filtros status -->
  <div style="display:flex;gap:4px;margin-bottom:12px" id="mkt-pedido-status-filtros">
    ${[['','Todos'],['READY_TO_SHIP','Ag. Envio'],['PROCESSED','Processando'],['SHIPPED','Enviado'],['COMPLETED','Concluído'],['CANCELLED','Cancelado']].map(([val,label],i) =>
      `<button class="btn btn-sm ${i===0?'btn-primary':'btn-ghost'}" data-status="${val}" onclick="Marketplace._filtrarPedidoStatus('${val}',this)">${label}</button>`
    ).join('')}
  </div>
  <!-- Progresso importação -->
  <div id="mkt-pedidos-progress" style="display:none;margin-bottom:8px">
    <div style="font-size:12px;color:var(--text2);margin-bottom:4px" id="mkt-pedidos-txt">Importando pedidos...</div>
    <div style="background:var(--bg3);border-radius:4px;height:6px"><div id="mkt-pedidos-bar" style="background:var(--accent);height:6px;border-radius:4px;width:50%;animation:pulse 1s infinite"></div></div>
  </div>
  <!-- Lista -->
  <div id="mkt-pedidos-lista"></div>
</div>`;

    // Ouvir notificação de novos pedidos
    window.pdv.mkt.pedidosLocal.onNovos(({ contaId: cid, enviados }) => {
      if (cid !== _contaAtiva) return;
      Toast.show(`📦 ${enviados} novo(s) pedido(s) enviado(s) ao Base44!`, 'success', 5000);
      _carregarPedidos();
    });

    _carregarPedidos();
  }

  function _trocarContaPedidos(id) { _contaAtiva = id; _pedidoPagina = 0; _carregarPedidos(); }
  function _filtrarPedidoStatus(status, btn) {
    _pedidoStatus = status; _pedidoPagina = 0;
    document.querySelectorAll('#mkt-pedido-status-filtros button').forEach(b => { b.classList.remove('btn-primary'); b.classList.add('btn-ghost'); });
    btn.classList.remove('btn-ghost'); btn.classList.add('btn-primary');
    _carregarPedidos();
  }
  function _irPaginaPedido(p) { _pedidoPagina = p; _carregarPedidos(); }

  let _buscaPedidoTimer = null;
  function _buscarPedidos() {
    _pedidoPagina = 0;
    clearTimeout(_buscaPedidoTimer);
    _buscaPedidoTimer = setTimeout(_carregarPedidos, 300);
  }

  async function _importarPedidos() {
    const btn = document.getElementById('btn-importar-pedidos');
    if (btn) btn.disabled = true;
    document.getElementById('mkt-pedidos-progress').style.display = 'block';
    document.getElementById('mkt-pedidos-txt').textContent = 'Importando pedidos dos últimos 30 dias e enviando ao Base44...';
    const res = await window.pdv.mkt.pedidosLocal.importar(_contaAtiva, 30);
    document.getElementById('mkt-pedidos-progress').style.display = 'none';
    if (btn) btn.disabled = false;
    if (res.ok) { Toast.show(`✅ ${res.importados} pedido(s) importados!`, 'success'); _carregarPedidos(); }
    else Toast.show(`Erro: ${res.erro}`, 'error', 5000);
  }

  async function _buscarNovos() {
    Toast.show('Verificando novos pedidos na Shopee...', 'info', 3000);
    const res = await window.pdv.mkt.pedidosLocal.buscarNovos(_contaAtiva);
    if (res?.ok) {
      if (res.novos > 0) { Toast.show(`📦 ${res.novos} novo(s) pedido(s) encontrado(s)!`, 'success'); _carregarPedidos(); }
      else Toast.show('Nenhum pedido novo encontrado.', 'info');
    } else Toast.show(`Erro: ${res?.erro}`, 'error');
  }

  async function _carregarPedidos() {
    const el = document.getElementById('mkt-pedidos-lista');
    if (!el || !_contaAtiva) return;
    const busca = document.getElementById('mkt-busca-pedido')?.value || '';
    el.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text3)">Carregando...</div>';

    const res = await window.pdv.mkt.pedidosLocal.listar(_contaAtiva, { status: _pedidoStatus, busca }, _pedidoPagina);
    const { rows: pedidos, total, totalPaginas } = res;

    if (!pedidos.length) {
      el.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text3)">
        <div style="font-size:32px;margin-bottom:12px">📭</div>
        <div>${total === 0 ? 'Nenhum pedido importado. Clique em "Importar 30 dias".' : 'Nenhum pedido com este filtro.'}</div>
      </div>`;
      return;
    }

    const STATUS_SHOPEE = {
      READY_TO_SHIP: ['Ag. Envio','badge-yellow'],
      PROCESSED:     ['Processando','badge-blue'],
      SHIPPED:       ['Enviado','badge-blue'],
      COMPLETED:     ['Concluído','badge-green'],
      CANCELLED:     ['Cancelado','badge-red'],
      UNPAID:        ['Não pago','badge-red'],
      IN_CANCEL:     ['Cancelando','badge-red'],
    };
    const B44_STATUS = {
      enviado:  ['✓ Base44','badge-green'],
      pendente: ['⏳ Pendente','badge-yellow'],
      erro:     ['✗ Erro','badge-red'],
    };

    const inicio = _pedidoPagina * 50 + 1;
    const fim    = Math.min((_pedidoPagina + 1) * 50, total);
    const pagBtns = [];
    if (totalPaginas > 1) {
      if (_pedidoPagina > 0) pagBtns.push(`<button class="btn btn-ghost btn-sm" onclick="Marketplace._irPaginaPedido(${_pedidoPagina-1})">‹</button>`);
      for (let p = Math.max(0,_pedidoPagina-2); p <= Math.min(totalPaginas-1,_pedidoPagina+2); p++)
        pagBtns.push(`<button class="btn btn-sm ${p===_pedidoPagina?'btn-primary':'btn-ghost'}" onclick="Marketplace._irPaginaPedido(${p})">${p+1}</button>`);
      if (_pedidoPagina < totalPaginas-1) pagBtns.push(`<button class="btn btn-ghost btn-sm" onclick="Marketplace._irPaginaPedido(${_pedidoPagina+1})">›</button>`);
    }

    el.innerHTML = `
<div class="table-wrap"><table>
  <thead><tr>
    <th style="width:160px">Nº Pedido</th>
    <th>Cliente</th>
    <th style="width:80px;text-align:center">Status</th>
    <th style="width:80px;text-align:center">Base44</th>
    <th style="width:110px;text-align:right">Total</th>
    <th style="width:80px;text-align:center">Itens</th>
    <th style="width:105px">Data</th>
    <th style="width:105px">Prazo Envio</th>
    <th style="width:36px"></th>
  </tr></thead>
  <tbody>
  ${pedidos.map(p => {
    const [slabel, sbadge] = STATUS_SHOPEE[p.status_shopee] || [p.status_shopee||'—','badge-green'];
    const [blabel, bbadge] = B44_STATUS[p.base44_status] || ['—',''];
    const itens = JSON.parse(p.itens_json || '[]');
    const temBloqueio = itens.some(i => i.nao_mapeado);
    const prazo = p.data_prazo_envio ? new Date(p.data_prazo_envio).toLocaleDateString('pt-BR') : '—';
    const data  = p.data_pedido ? new Date(p.data_pedido).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}) : '—';
    const atrasado = p.data_prazo_envio && new Date(p.data_prazo_envio) < new Date() && !['SHIPPED','COMPLETED','CANCELLED'].includes(p.status_shopee);
    return `<tr style="${temBloqueio?'background:rgba(var(--yellow-rgb,255,200,0),.06)':''}">
      <td style="font-weight:700;font-size:12px;color:var(--accent);font-family:monospace">${p.pedido_id}</td>
      <td>
        <div style="font-size:13px;font-weight:500">${p.cliente_nome || '—'}</div>
        <div style="font-size:10px;color:var(--text3)">${p.cliente_cidade||''} ${p.cliente_estado ? '· '+p.cliente_estado : ''}</div>
      </td>
      <td style="text-align:center"><span class="badge ${sbadge}">${slabel}</span></td>
      <td style="text-align:center"><span class="badge ${bbadge}">${blabel}</span></td>
      <td style="text-align:right;font-weight:700;color:var(--accent)">R$ ${Number(p.valor_total||0).toFixed(2).replace('.',',')}</td>
      <td style="text-align:center;font-size:12px">
        ${temBloqueio ? `<span style="color:var(--yellow)">⚠ ${itens.length}</span>` : itens.length} item(s)
      </td>
      <td style="font-size:11px;color:var(--text3)">${data}</td>
      <td style="font-size:11px;${atrasado?'color:var(--red);font-weight:700':''}">${prazo}${atrasado?' ⚠️':''}</td>
      <td style="text-align:center">
        <button class="btn btn-ghost btn-sm" title="Ver e editar itens do pedido"
          onclick="Marketplace._abrirModalPedido('${p.pedido_id}')">✏️</button>
      </td>
    </tr>`;
  }).join('')}
  </tbody>
</table></div>
<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px">
  <div style="font-size:11px;color:var(--text3)">${inicio}–${fim} de ${total} pedido(s)</div>
  ${pagBtns.length ? `<div style="display:flex;gap:4px">${pagBtns.join('')}</div>` : ''}
</div>`;
  }

  function _trocarContaPedidos(id) { _contaAtiva = id; _pedidoPagina = 0; _carregarPedidos(); }

  // ─── Regras de Preço (por conta) ────────────────────────────────

  async function renderPrecos(el) {
    const contas  = (await window.pdv.mkt.listarContas()) || [];
    const regras  = (await window.pdv.config.get('marketplace.regras_preco')) || {};

    el.innerHTML = `
<div style="padding:28px 36px;max-width:800px">
  <div style="font-size:18px;font-weight:700;margin-bottom:6px">Regras de Preço</div>
  <div style="font-size:13px;color:var(--text2);margin-bottom:28px">Configure markup e ajustes de preço para cada conta de marketplace.</div>

  ${contas.length ? contas.map(c => {
    const canal = CANAIS[c.canal] || { nome: c.canal, icon: '🔌', cor: '#666' };
    const r = regras[c.id] || { markup: 20, frete: 0, minimo: 0 };
    return `
  <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-bottom:16px">
    <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px">
      <div style="width:32px;height:32px;background:${canal.cor};border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px">${canal.icon}</div>
      <div style="font-weight:600">${c.nome}</div>
      ${c.empresa ? `<div style="font-size:11px;color:var(--accent)">${c.empresa}</div>` : ''}
      <div style="font-size:11px;color:var(--text3);margin-left:auto">${canal.nome}</div>
    </div>
    <div style="padding:18px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;align-items:end">
      <div>
        <label class="form-label">Markup (%)</label>
        <input id="pr-${c.id}-markup" class="input" type="number" min="0" max="500" step="0.5" value="${r.markup}" oninput="Marketplace._exemploPreco('${c.id}')">
      </div>
      <div>
        <label class="form-label">Frete fixo (R$)</label>
        <input id="pr-${c.id}-frete" class="input" type="number" min="0" step="0.01" value="${r.frete}" oninput="Marketplace._exemploPreco('${c.id}')">
      </div>
      <div>
        <label class="form-label">Preço mínimo (R$)</label>
        <input id="pr-${c.id}-minimo" class="input" type="number" min="0" step="0.01" value="${r.minimo}">
      </div>
    </div>
    <div style="padding:0 18px 14px">
      <div id="pr-${c.id}-ex" style="font-size:11px;color:var(--text2);background:var(--bg3);border-radius:8px;padding:8px 12px"></div>
    </div>
    <div style="padding:0 18px 16px;display:flex;justify-content:flex-end">
      <button class="btn btn-primary btn-sm" onclick="Marketplace._salvarRegra('${c.id}')">Salvar</button>
    </div>
  </div>`;
  }).join('') : `<div style="text-align:center;padding:60px;color:var(--text3)">
    <div style="font-size:32px;margin-bottom:12px">🔌</div>
    <div>Adicione contas em <strong>Canais</strong> para configurar regras de preço.</div>
    <button class="btn btn-primary" style="margin-top:16px" onclick="Marketplace.ir('canais')">Ir para Canais</button>
  </div>`}
</div>`;

    contas.forEach(c => _exemploPreco(c.id));
  }

  function _exemploPreco(contaId) {
    const el     = document.getElementById(`pr-${contaId}-ex`);
    if (!el) return;
    const markup = parseFloat(document.getElementById(`pr-${contaId}-markup`)?.value) || 0;
    const frete  = parseFloat(document.getElementById(`pr-${contaId}-frete`)?.value)  || 0;
    const final  = 50 * (1 + markup/100) + frete;
    el.innerHTML = `Exemplo: produto a R$ 50,00 no PDV → <strong style="color:var(--accent)">R$ ${final.toFixed(2)}</strong> no marketplace (markup ${markup}% + frete R$ ${frete.toFixed(2)})`;
  }

  async function _salvarRegra(contaId) {
    const regras = (await window.pdv.config.get('marketplace.regras_preco')) || {};
    regras[contaId] = {
      markup:  parseFloat(document.getElementById(`pr-${contaId}-markup`)?.value)  || 0,
      frete:   parseFloat(document.getElementById(`pr-${contaId}-frete`)?.value)   || 0,
      minimo:  parseFloat(document.getElementById(`pr-${contaId}-minimo`)?.value)  || 0,
    };
    await window.pdv.config.set('marketplace.regras_preco', regras);
    Toast.show('Regra salva!', 'success');
  }

  // ─── Helpers ────────────────────────────────────────────────────

  function _semContas(modulo) {
    return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:60px;text-align:center">
      <div style="font-size:48px;margin-bottom:16px">🔌</div>
      <div style="font-size:16px;font-weight:700;margin-bottom:8px">Nenhuma conta conectada</div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:20px">Conecte um canal para gerenciar ${modulo}.</div>
      <button class="btn btn-primary" onclick="Marketplace.ir('canais')">Ir para Canais</button>
    </div>`;
  }

  return {
    render, init, ir,
    modalAddConta, salvarNovaConta, editarConta, _confirmarEdicao, reconectar, removerConta,
    _modalCodigoManual, _extrairDaUrl, _processarCodigoManual,
    irContaAnuncios, _trocarContaAnuncios, _carregarAnuncios, _buscarAnuncios,
    _importarTodos, _verificarNovos, _sincronizarAnuncio, _enviarBase44, _irPagina,
    _toggleSelecionado, _toggleTodos, _sincronizarSelecionados,
    _limparSelecao: () => { _selecionados.clear(); document.querySelectorAll('.mkt-chk-item').forEach(c => c.checked=false); _atualizarBarraSel(); },
    _abrirModalMapear, _buscarProdutoMapear, _confirmarMapeamento, _selecionarProdutoMapear, _removerMapeamento,
    _abrirModalMapeamentoMassa, _toggleTodosMassa, _confirmarMapeamentoMassa,
    _abrirModalPedido, _renderItensModal, _abrirBuscaItemPedido, _buscarItemPedido, _selecionarProdutoItem,
    irContaPedidos, _trocarContaPedidos, _carregarPedidos,
    _filtrarPedidoStatus, _buscarPedidos, _importarPedidos, _buscarNovos, _irPaginaPedido,
    _onCanalChange, _exemploPreco, _salvarRegra,
  };
})();
