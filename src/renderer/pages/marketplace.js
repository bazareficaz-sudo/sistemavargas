// ─── Marketplace ──────────────────────────────────────────────────
const Marketplace = (() => {

  let _subpagina = 'canais';

  // ─── Shell / Sub-nav ────────────────────────────────────────────

  function render() {
    return `
<div style="display:flex;flex-direction:column;height:100%">

  <!-- Sub-navegação -->
  <div style="display:flex;align-items:center;gap:4px;padding:12px 20px;border-bottom:1px solid var(--border);background:var(--card);flex-shrink:0">
    ${['canais','anuncios','pedidos','precos'].map(id => {
      const labels = { canais:'🔌 Canais', anuncios:'📢 Anúncios', pedidos:'📦 Pedidos', precos:'💲 Regras de Preço' };
      return `<button class="mkt-tab ${_subpagina===id?'mkt-tab-ativo':''}" onclick="Marketplace.ir('${id}')">${labels[id]}</button>`;
    }).join('')}
    <div style="margin-left:auto;display:flex;gap:8px">
      <button class="btn btn-ghost btn-sm" onclick="App.showLauncher()" title="Voltar ao início">
        ⬡ Início
      </button>
    </div>
  </div>

  <!-- Conteúdo -->
  <div style="flex:1;overflow:auto" id="mkt-content"></div>
</div>

<style>
.mkt-tab { background:none;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;color:var(--text2);font-weight:500;transition:.15s }
.mkt-tab:hover { background:var(--bg3);color:var(--text1) }
.mkt-tab-ativo { background:var(--accent);color:#fff !important }
.canal-card { background:var(--card);border:1px solid var(--border);border-radius:14px;padding:24px;position:relative;overflow:hidden }
.canal-card .cor-barra { position:absolute;top:0;left:0;right:0;height:3px;border-radius:14px 14px 0 0 }
</style>`;
  }

  async function init() {
    ir('canais');
  }

  function ir(sub) {
    _subpagina = sub;
    // Atualizar tabs
    document.querySelectorAll('.mkt-tab').forEach(b => {
      const id = b.textContent.trim().replace(/^[^\s]+\s/, '').toLowerCase().replace(' ','');
      b.classList.toggle('mkt-tab-ativo', b.getAttribute('onclick').includes(`'${sub}'`));
    });
    const el = document.getElementById('mkt-content');
    if (!el) return;
    const mapa = { canais: renderCanais, anuncios: renderAnuncios, pedidos: renderPedidos, precos: renderPrecos };
    const fn = mapa[sub];
    if (fn) fn(el);
  }

  // ─── CANAIS ─────────────────────────────────────────────────────

  async function renderCanais(el) {
    el.innerHTML = '<div style="padding:32px;color:var(--text3);text-align:center">Carregando...</div>';

    const shopeeStatus = await window.pdv.shopee.status();

    el.innerHTML = `
<div style="padding:32px 40px">
  <div style="font-size:18px;font-weight:700;color:var(--text1);margin-bottom:6px">Canais de Venda</div>
  <div style="font-size:13px;color:var(--text2);margin-bottom:28px">Conecte seus marketplaces e e-commerces para centralizar vendas e estoque.</div>

  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px">

    <!-- Shopee -->
    <div class="canal-card">
      <div class="cor-barra" style="background:#ee4d2d"></div>
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
        <div style="width:48px;height:48px;background:#ee4d2d;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">🛍️</div>
        <div>
          <div style="font-size:16px;font-weight:700">Shopee</div>
          <div style="font-size:11px;color:var(--text3)">Marketplace líder no Sudeste Asiático e Brasil</div>
        </div>
        <div style="margin-left:auto">
          ${shopeeStatus.conectado
            ? '<span style="background:#22c55e22;color:#22c55e;font-size:10px;font-weight:700;padding:4px 10px;border-radius:20px;letter-spacing:.5px">● CONECTADO</span>'
            : '<span style="background:var(--bg3);color:var(--text3);font-size:10px;font-weight:700;padding:4px 10px;border-radius:20px;letter-spacing:.5px">DESCONECTADO</span>'}
        </div>
      </div>

      ${shopeeStatus.conectado ? `
        <div style="background:var(--bg3);border-radius:10px;padding:12px 16px;margin-bottom:16px">
          <div style="font-size:11px;color:var(--text3);margin-bottom:2px">LOJA CONECTADA</div>
          <div style="font-weight:600">${shopeeStatus.shop_name || 'Loja Shopee'}</div>
          <div style="font-size:11px;color:var(--text3)">Shop ID: ${shopeeStatus.shop_id}</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="Marketplace.ir('anuncios')">Ver Anúncios</button>
          <button class="btn btn-ghost btn-sm" onclick="Marketplace.ir('pedidos')">Ver Pedidos</button>
          <button class="btn btn-danger btn-sm" style="margin-left:auto" onclick="Marketplace.shopeeDesconectar()">Desconectar</button>
        </div>
      ` : `
        <div style="font-size:12px;color:var(--text2);margin-bottom:16px;line-height:1.6">
          Para conectar sua loja Shopee você precisará do <strong>Partner ID</strong> e <strong>Partner Key</strong>,
          disponíveis no <a href="#" onclick="window.pdv.app.openExternal&&window.pdv.app.openExternal('https://open.shopee.com')" style="color:var(--accent)">Portal de Parceiros Shopee</a>.
        </div>
        <div style="display:grid;gap:10px;margin-bottom:16px">
          <div>
            <label style="font-size:11px;color:var(--text3);font-weight:600;letter-spacing:.5px;text-transform:uppercase">Partner ID</label>
            <input id="shopee-partner-id" class="input" style="margin-top:4px;width:100%;box-sizing:border-box"
              placeholder="Ex: 12345678" value="${shopeeStatus.partner_id || ''}">
            <div style="font-size:10px;color:var(--text3);margin-top:3px">Número encontrado nas configurações da sua conta de parceiro Shopee</div>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text3);font-weight:600;letter-spacing:.5px;text-transform:uppercase">Partner Key</label>
            <input id="shopee-partner-key" class="input" style="margin-top:4px;width:100%;box-sizing:border-box"
              type="password" placeholder="Cole sua chave aqui">
            <div style="font-size:10px;color:var(--text3);margin-top:3px">Chave secreta — nunca compartilhe com ninguém</div>
          </div>
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text2);cursor:pointer">
            <input type="checkbox" id="shopee-sandbox" ${shopeeStatus.sandbox ? 'checked' : ''}>
            Usar ambiente de teste (Sandbox)
          </label>
        </div>
        <button class="btn btn-primary" style="width:100%" onclick="Marketplace.shopeeConectar()">
          🔗 Conectar com Shopee
        </button>
      `}
    </div>

    <!-- Mercado Livre -->
    ${_cardEmBreve('🛒', '#ffe600', '#333', 'Mercado Livre', 'Maior marketplace da América Latina', 'Em breve')}

    <!-- WooCommerce -->
    ${_cardEmBreve('🛒', '#7f54b3', '#fff', 'WooCommerce', 'Integre sua loja WordPress/WooCommerce', 'Em breve')}

    <!-- Magalu -->
    ${_cardEmBreve('🏬', '#0086ff', '#fff', 'Magazine Luiza', 'Marketplace Magazine Luiza', 'Em breve')}

  </div>
</div>`;
  }

  function _cardEmBreve(icon, cor, textoCor, nome, desc, badge) {
    return `
    <div class="canal-card" style="opacity:.5;pointer-events:none">
      <div class="cor-barra" style="background:${cor}"></div>
      <div style="position:absolute;top:14px;right:14px;background:var(--bg3);color:var(--text3);font-size:9px;font-weight:700;letter-spacing:1px;border-radius:20px;padding:3px 10px;border:1px solid var(--border2)">${badge}</div>
      <div style="display:flex;align-items:center;gap:14px">
        <div style="width:48px;height:48px;background:${cor};border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${icon}</div>
        <div>
          <div style="font-size:16px;font-weight:700">${nome}</div>
          <div style="font-size:11px;color:var(--text3)">${desc}</div>
        </div>
      </div>
    </div>`;
  }

  async function shopeeConectar() {
    const partnerId  = document.getElementById('shopee-partner-id')?.value?.trim();
    const partnerKey = document.getElementById('shopee-partner-key')?.value?.trim();
    const sandbox    = document.getElementById('shopee-sandbox')?.checked || false;

    if (!partnerId || !partnerKey) {
      Toast.show('Preencha o Partner ID e a Partner Key', 'warning'); return;
    }

    await window.pdv.shopee.salvarCredenciais(partnerId, partnerKey, sandbox);
    Toast.show('Abrindo navegador para autorização Shopee...', 'info', 8000);

    const res = await window.pdv.shopee.conectar();
    if (res.ok) {
      Toast.show(`✅ Shopee conectada! Loja: ${res.shop_name}`, 'success', 5000);
      ir('canais');
    } else {
      Toast.show(`Erro ao conectar: ${res.erro}`, 'error', 6000);
    }
  }

  async function shopeeDesconectar() {
    const ok = await window.pdv.app.confirm('Desconectar a loja Shopee?');
    if (!ok) return;
    await window.pdv.shopee.desconectar();
    Toast.show('Shopee desconectada', 'warning');
    ir('canais');
  }

  // ─── ANÚNCIOS ───────────────────────────────────────────────────

  async function renderAnuncios(el) {
    const status = await window.pdv.shopee.status();
    if (!status.conectado) {
      el.innerHTML = _semCanal('anúncios');
      return;
    }

    el.innerHTML = `
<div style="padding:32px 40px">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
    <div>
      <div style="font-size:18px;font-weight:700">Anúncios</div>
      <div style="font-size:12px;color:var(--text2);margin-top:2px">Produtos publicados na Shopee</div>
    </div>
    <button class="btn btn-ghost btn-sm" onclick="Marketplace._carregarAnuncios(0)">↻ Atualizar</button>
  </div>
  <div id="mkt-anuncios-lista"><div style="text-align:center;padding:40px;color:var(--text3)">Carregando anúncios...</div></div>
</div>`;

    _carregarAnuncios(0);
  }

  async function _carregarAnuncios(page) {
    const el = document.getElementById('mkt-anuncios-lista');
    if (!el) return;
    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">Carregando...</div>';

    const res = await window.pdv.shopee.anuncios(page || 0);
    if (res.erro) { el.innerHTML = `<div style="color:var(--red);padding:20px">Erro: ${res.erro}</div>`; return; }

    const items = res.item || [];
    if (!items.length) {
      el.innerHTML = '<div style="text-align:center;padding:60px;color:var(--text3)"><div style="font-size:32px;margin-bottom:12px">📭</div><div>Nenhum anúncio encontrado</div></div>';
      return;
    }

    el.innerHTML = `
<div class="table-wrap">
  <table>
    <thead><tr><th>ID</th><th>Nome do Produto</th><th>Status</th></tr></thead>
    <tbody>
      ${items.map(i => `<tr>
        <td class="td-mono" style="font-size:12px">${i.item_id}</td>
        <td>${i.item_name || '—'}</td>
        <td><span class="badge badge-green">Ativo</span></td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>`;
  }

  // ─── PEDIDOS ────────────────────────────────────────────────────

  async function renderPedidos(el) {
    const status = await window.pdv.shopee.status();
    if (!status.conectado) { el.innerHTML = _semCanal('pedidos'); return; }

    el.innerHTML = `
<div style="padding:32px 40px">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
    <div>
      <div style="font-size:18px;font-weight:700">Pedidos</div>
      <div style="font-size:12px;color:var(--text2);margin-top:2px">Pedidos recebidos nos marketplaces</div>
    </div>
    <div style="display:flex;gap:8px">
      <select id="mkt-pedido-status" class="input" style="font-size:12px" onchange="Marketplace._carregarPedidos()">
        <option value="READY_TO_SHIP">Aguardando envio</option>
        <option value="PROCESSED">Em processamento</option>
        <option value="SHIPPED">Enviado</option>
        <option value="COMPLETED">Concluído</option>
        <option value="CANCELLED">Cancelado</option>
      </select>
      <button class="btn btn-ghost btn-sm" onclick="Marketplace._carregarPedidos()">↻</button>
    </div>
  </div>
  <div id="mkt-pedidos-lista"><div style="text-align:center;padding:40px;color:var(--text3)">Carregando...</div></div>
</div>`;

    _carregarPedidos();
  }

  async function _carregarPedidos() {
    const el     = document.getElementById('mkt-pedidos-lista');
    const status = document.getElementById('mkt-pedido-status')?.value || 'READY_TO_SHIP';
    if (!el) return;
    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">Carregando pedidos...</div>';

    const res = await window.pdv.shopee.pedidos(status);
    if (res.erro) { el.innerHTML = `<div style="color:var(--red);padding:20px">Erro: ${res.erro}</div>`; return; }

    const orders = res.order_list || [];
    if (!orders.length) {
      el.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text3)"><div style="font-size:32px;margin-bottom:12px">📭</div><div>Nenhum pedido com este status</div></div>`;
      return;
    }

    el.innerHTML = `
<div class="table-wrap">
  <table>
    <thead><tr><th>Nº Pedido</th><th>Data</th><th>Status</th><th>Canal</th></tr></thead>
    <tbody>
      ${orders.map(o => {
        const dt = o.create_time ? new Date(o.create_time * 1000).toLocaleDateString('pt-BR') : '—';
        return `<tr>
          <td class="td-mono" style="font-weight:600;color:var(--accent)">${o.order_sn || o.ordersn || '—'}</td>
          <td style="font-size:12px">${dt}</td>
          <td><span class="badge badge-blue">${o.order_status || status}</span></td>
          <td><span style="display:inline-flex;align-items:center;gap:4px;font-size:11px">🛍️ Shopee</span></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
</div>`;
  }

  // ─── REGRAS DE PREÇO ────────────────────────────────────────────

  async function renderPrecos(el) {
    const status = await window.pdv.shopee.status();

    // Carregar regras salvas
    const regras = (await window.pdv.config.get('marketplace.regras_preco')) || {
      shopee_markup: 20,
      shopee_frete:  0,
      shopee_minimo: 0,
    };

    el.innerHTML = `
<div style="padding:32px 40px;max-width:700px">
  <div style="font-size:18px;font-weight:700;margin-bottom:6px">Regras de Preço</div>
  <div style="font-size:13px;color:var(--text2);margin-bottom:28px">
    Defina como os preços do PDV são ajustados para cada canal de venda.
  </div>

  <!-- Shopee -->
  <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-bottom:20px">
    <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px">
      <div style="width:36px;height:36px;background:#ee4d2d;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px">🛍️</div>
      <div style="font-weight:600">Shopee</div>
      ${status.conectado ? '<span style="background:#22c55e22;color:#22c55e;font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px">● Conectado</span>' : ''}
    </div>
    <div style="padding:20px;display:grid;gap:16px">

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div>
          <label style="font-size:11px;color:var(--text3);font-weight:600;letter-spacing:.5px;text-transform:uppercase">Markup (%)</label>
          <input id="sp-markup" class="input" type="number" min="0" max="300" step="0.5"
            value="${regras.shopee_markup || 20}" style="margin-top:6px;width:100%;box-sizing:border-box">
          <div style="font-size:10px;color:var(--text3);margin-top:4px">Percentual adicionado ao preço do PDV</div>
        </div>
        <div>
          <label style="font-size:11px;color:var(--text3);font-weight:600;letter-spacing:.5px;text-transform:uppercase">Frete fixo (R$)</label>
          <input id="sp-frete" class="input" type="number" min="0" step="0.01"
            value="${regras.shopee_frete || 0}" style="margin-top:6px;width:100%;box-sizing:border-box">
          <div style="font-size:10px;color:var(--text3);margin-top:4px">Adicionar ao preço final (se cobrar frete)</div>
        </div>
      </div>

      <div>
        <label style="font-size:11px;color:var(--text3);font-weight:600;letter-spacing:.5px;text-transform:uppercase">Preço mínimo (R$)</label>
        <input id="sp-minimo" class="input" type="number" min="0" step="0.01"
          value="${regras.shopee_minimo || 0}" style="margin-top:6px;width:220px;box-sizing:border-box">
        <div style="font-size:10px;color:var(--text3);margin-top:4px">Nenhum produto será publicado abaixo deste valor</div>
      </div>

      <div style="background:var(--bg3);border-radius:8px;padding:12px 16px">
        <div style="font-size:11px;color:var(--text3);margin-bottom:4px">EXEMPLO DE CÁLCULO</div>
        <div style="font-size:12px;color:var(--text2)" id="sp-exemplo">—</div>
      </div>

    </div>
  </div>

  <!-- Mercado Livre placeholder -->
  <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-bottom:20px;opacity:.4;pointer-events:none">
    <div style="padding:16px 20px;display:flex;align-items:center;gap:12px">
      <div style="width:36px;height:36px;background:#ffe600;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px">🛒</div>
      <div style="font-weight:600">Mercado Livre</div>
      <span style="background:var(--bg3);color:var(--text3);font-size:9px;font-weight:700;padding:3px 8px;border-radius:20px;letter-spacing:1px">EM BREVE</span>
    </div>
  </div>

  <button class="btn btn-primary" onclick="Marketplace._salvarRegras()">💾 Salvar Regras</button>
</div>`;

    // Atualizar exemplo ao digitar
    ['sp-markup','sp-frete','sp-minimo'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', _atualizarExemplo);
    });
    _atualizarExemplo();
  }

  function _atualizarExemplo() {
    const markup = parseFloat(document.getElementById('sp-markup')?.value) || 0;
    const frete  = parseFloat(document.getElementById('sp-frete')?.value)  || 0;
    const el     = document.getElementById('sp-exemplo');
    if (!el) return;
    const base      = 50;
    const comMarkup = base * (1 + markup / 100);
    const final     = comMarkup + frete;
    el.innerHTML = `Produto a R$ ${base.toFixed(2)} no PDV → <strong style="color:var(--accent)">R$ ${final.toFixed(2)}</strong> na Shopee (markup ${markup}% + frete R$ ${frete.toFixed(2)})`;
  }

  async function _salvarRegras() {
    const regras = {
      shopee_markup: parseFloat(document.getElementById('sp-markup')?.value) || 0,
      shopee_frete:  parseFloat(document.getElementById('sp-frete')?.value)  || 0,
      shopee_minimo: parseFloat(document.getElementById('sp-minimo')?.value) || 0,
    };
    await window.pdv.config.set('marketplace.regras_preco', regras);
    Toast.show('Regras de preço salvas!', 'success');
  }

  // ─── Helpers ────────────────────────────────────────────────────

  function _semCanal(modulo) {
    return `
<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:60px;text-align:center">
  <div style="font-size:48px;margin-bottom:16px">🔌</div>
  <div style="font-size:16px;font-weight:700;margin-bottom:8px">Nenhum canal conectado</div>
  <div style="font-size:13px;color:var(--text2);margin-bottom:20px">Conecte um marketplace para gerenciar ${modulo} aqui.</div>
  <button class="btn btn-primary" onclick="Marketplace.ir('canais')">Ir para Canais</button>
</div>`;
  }

  return { render, init, ir, shopeeConectar, shopeeDesconectar, _carregarAnuncios, _carregarPedidos, _salvarRegras, _atualizarExemplo };
})();
