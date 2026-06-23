// ─── Módulo Saúde da Venda ────────────────────────────────────────
const SaudeVenda = (() => {

  // ─── Config (carregada do electron-store) ─────────────────────
  const DEFAULTS = {
    // Limiares do termômetro — sobrescritos pelo ConfigTermometro do Base44
    meta_margem:      30,   // % — acima disso = Excelente
    margem_saudavel:  15,   // % — zona saudável
    margem_atencao:    8,   // % — zona de atenção
    taxa_dinheiro:     0,
    taxa_pix:          0,
    taxa_debito:       1.5,
    taxa_credito:      2.8,
    taxa_carteira:     0,
    taxa_misto:        2.0,
    senha_autorizacao: '',  // vazio = qualquer um pode autorizar
  };

  let cfg = { ...DEFAULTS };
  let _cfgDesconto = {}; // { ruim: {desconto_maximo, formas_pagamento_aceitas, ...}, boa: {...}, ... }
  let _cart = [];
  let _payMethod = 'dinheiro';
  let _ultimoResultado = null;

  // Mapeamento zona PDV → faixa Base44
  const ZONA_FAIXA = {
    excelente: 'excelente',
    saudavel:  'boa',
    atencao:   'media',
    limite:    'ruim',
    prejuizo:  'ruim',
  };

  async function loadConfig() {
    const saved = (await window.pdv.config.get('saude_venda')) || {};
    // Limiares do termômetro vêm do Base44 (ConfigTermometro) — têm prioridade sobre os locais
    const termometro = (await window.pdv.config.get('config_termometro')) || {};
    cfg = {
      ...DEFAULTS,
      ...saved,
      meta_margem:     termometro.margem_excelente ?? saved.meta_margem     ?? DEFAULTS.meta_margem,
      margem_saudavel: termometro.margem_boa       ?? saved.margem_saudavel ?? DEFAULTS.margem_saudavel,
      margem_atencao:  termometro.margem_media     ?? saved.margem_atencao  ?? DEFAULTS.margem_atencao,
    };
    _cfgDesconto = (await window.pdv.config.get('config_desconto')) || {};
  }

  // Retorna config da faixa para a zona atual
  function getCfgFaixa(zona) {
    const faixa = ZONA_FAIXA[zona];
    return faixa ? (_cfgDesconto[faixa] || null) : null;
  }

  // ─── Cálculo principal ────────────────────────────────────────
  function taxaRate(payMethod) {
    return ((cfg['taxa_' + payMethod] ?? cfg.taxa_dinheiro ?? 0)) / 100;
  }

  function calcular(cart, descontoGeral, payMethod) {
    if (!cart || cart.length === 0) return null;

    // Usa apenas itens de venda (qty > 0); devoluções não entram na margem
    const itensVenda = cart.filter(i => (i.quantidade || 0) > 0);
    if (itensVenda.length === 0) return null;

    const subtotal    = itensVenda.reduce((a, i) => a + i.preco_unitario * i.quantidade, 0);
    const custo_total = itensVenda.reduce((a, i) => a + (i.preco_custo || 0) * i.quantidade, 0);
    const total       = Math.max(0, subtotal - (descontoGeral || 0));

    if (total <= 0) return null;

    const tRate = taxaRate(payMethod);
    const taxa   = total * tRate;
    const lucro  = total - custo_total - taxa;
    // Markup = lucro / custo  (diferente de margem = lucro / preço)
    const margem = custo_total > 0 ? (lucro / custo_total) * 100 : (lucro >= 0 ? Infinity : -Infinity);

    // ── Desconto máximo para cada zona ────────────────────────────
    // Formula markup: total_min = custo*(1+markupMin/100) / (1-tRate)
    //                 desconto_max = subtotal - total_min
    function descontoMaxPara(markupMin) {
      const denom = 1 - tRate;
      if (denom <= 0) return 0;
      return Math.max(0, subtotal - custo_total * (1 + markupMin / 100) / denom);
    }

    const descontoMaxSaudavel = descontoMaxPara(cfg.margem_saudavel);
    const descontoMaxAtencao  = descontoMaxPara(cfg.margem_atencao);
    const descontoMaxLimite   = descontoMaxPara(0);

    const descontoDisponivel    = Math.max(0, descontoMaxSaudavel - (descontoGeral || 0));
    const descontoDisponivelPct = subtotal > 0 ? (descontoDisponivel / subtotal) * 100 : 0;

    // ── Classificação ─────────────────────────────────────────────
    let status, cor, label, descricao, sugestao;

    if (margem >= cfg.meta_margem) {
      status = 'excelente'; cor = '#3b82f6';
      label = 'Venda Excelente';
      descricao = 'Lucro acima do planejado · Há espaço para negociação';
      sugestao = '';
    } else if (margem >= cfg.margem_saudavel) {
      status = 'saudavel'; cor = '#22c55e';
      label = 'Venda Saudável';
      descricao = 'Negociação segura · Lucro dentro do esperado';
      sugestao = '';
    } else if (margem >= cfg.margem_atencao) {
      status = 'atencao'; cor = '#eab308';
      label = 'Atenção';
      descricao = 'Pouca margem para novos descontos';
      sugestao = 'Ofereça PIX · Reduza o desconto para voltar à zona saudável';
    } else if (margem >= 0) {
      status = 'limite'; cor = '#f97316';
      label = 'Limite de Negociação';
      descricao = 'Desconto máximo recomendado atingido';
      sugestao = 'Considere vender item complementar · Ofereça PIX';
    } else {
      status = 'prejuizo'; cor = '#ef4444';
      label = 'Venda em Prejuízo';
      descricao = 'Esta venda está gerando prejuízo · Necessária autorização';
      sugestao = 'Revise os descontos ou solicite autorização de supervisor';
    }

    // Regras da faixa vindas do Base44 (ConfigDesconto)
    const cfgFaixa = getCfgFaixa(status);
    // Desconto máximo absoluto permitido pela política da faixa (% do subtotal)
    const descontoMaxPolitica = (cfgFaixa?.desconto_maximo != null && subtotal > 0)
      ? subtotal * cfgFaixa.desconto_maximo / 100
      : null;
    // Aviso de forma de pagamento
    const formasAceitas = cfgFaixa?.formas_pagamento_aceitas || [];
    const payMethodBloqueado = formasAceitas.length > 0 && !formasAceitas.includes(payMethod);

    return {
      status, cor, label, descricao, sugestao,
      margem, lucro, subtotal, custo_total, taxa, total,
      descontoGeral: descontoGeral || 0,
      descontoMaxSaudavel, descontoMaxAtencao, descontoMaxLimite,
      descontoDisponivel, descontoDisponivelPct,
      cfgFaixa, descontoMaxPolitica, payMethodBloqueado, formasAceitas,
    };
  }

  // Converte margem % → posição 0-100 na barra
  function margemToPos(margem) {
    const m = cfg.meta_margem;
    const s = cfg.margem_saudavel;
    const a = cfg.margem_atencao;
    if (margem >= m)       return 80 + Math.min(20, ((margem - m) / Math.max(m, 1)) * 20);
    if (margem >= s)       return 60 + ((margem - s) / Math.max(m - s, 1)) * 20;
    if (margem >= a)       return 40 + ((margem - a) / Math.max(s - a, 1)) * 20;
    if (margem >= 0)       return 20 + (margem / Math.max(a, 1)) * 20;
    return Math.max(0, 20 + (margem / 50) * 20); // negativo: recua abaixo de 20
  }

  // ─── Render do indicador ──────────────────────────────────────
  function renderIndicador(r) {
    const pos = Math.min(98, Math.max(2, margemToPos(r.margem)));

    const dispHtml = r.descontoDisponivel > 0.01 ? `
<div style="margin-top:8px;padding:6px 10px;background:var(--accent-bg);border:1px solid var(--border2);
  border-radius:6px;font-size:11px;display:flex;align-items:center;gap:6px">
  <span style="color:var(--text3)">Desconto disponível:</span>
  <strong style="color:var(--accent)">R$ ${fmtMoney(r.descontoDisponivel)}</strong>
  <span style="color:var(--text3)">(${r.descontoDisponivelPct.toFixed(1)}%)</span>
</div>` : (r.status !== 'excelente' && r.status !== 'saudavel' ? `
<div style="margin-top:8px;padding:6px 10px;background:#ef444418;border:1px solid #ef444440;
  border-radius:6px;font-size:11px;color:#ef4444">
  ⚠️ Limite de desconto atingido nesta zona
</div>` : '');

    // Aviso de política de desconto (ConfigDesconto do Base44)
    const politicaHtml = (() => {
      const avisos = [];
      if (r.payMethodBloqueado) {
        const aceitas = r.formasAceitas.join(', ');
        avisos.push(`<div style="display:flex;align-items:center;gap:6px">
          <span>🚫</span>
          <span><strong>${_payMethod}</strong> não aceito nesta faixa · Use: ${aceitas || '—'}</span>
        </div>`);
      }
      if (r.descontoMaxPolitica != null && r.descontoGeral > r.descontoMaxPolitica + 0.01) {
        avisos.push(`<div style="display:flex;align-items:center;gap:6px">
          <span>⛔</span>
          <span>Desconto excede o máximo permitido (${r.cfgFaixa.desconto_maximo}%) = R$ ${fmtMoney(r.descontoMaxPolitica)}</span>
        </div>`);
      } else if (r.descontoMaxPolitica != null && r.cfgFaixa?.desconto_maximo != null) {
        avisos.push(`<div style="display:flex;align-items:center;gap:6px;color:var(--text3)">
          <span>📋</span>
          <span>Política: desc. máx. ${r.cfgFaixa.desconto_maximo}% = R$ ${fmtMoney(r.descontoMaxPolitica)}</span>
        </div>`);
      }
      if (avisos.length === 0) return '';
      const isAlerta = r.payMethodBloqueado || r.descontoGeral > (r.descontoMaxPolitica ?? Infinity);
      return `<div style="margin-top:8px;padding:7px 10px;font-size:10px;line-height:1.8;
        background:${isAlerta ? '#ef444418' : 'var(--bg3)'};
        border:1px solid ${isAlerta ? '#ef444460' : 'var(--border)'};
        border-radius:6px;color:${isAlerta ? '#ef4444' : 'var(--text2)'}">
        ${avisos.join('')}
      </div>`;
    })();

    const sugestaoHtml = r.sugestao ? `
<div style="margin-top:6px;font-size:10px;color:var(--text3);font-style:italic;line-height:1.4">
  💡 ${r.sugestao}
</div>` : '';

    return `
<div id="pdv-saude" style="padding:12px 16px;border-bottom:1px solid var(--border)">

  <!-- Cabeçalho do status -->
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
    <div style="width:10px;height:10px;border-radius:50%;flex-shrink:0;
      background:${r.cor};box-shadow:0 0 7px ${r.cor}88"></div>
    <div style="font-weight:700;font-size:13px;color:${r.cor};flex:1">${r.label}</div>
    <button class="btn btn-ghost" style="font-size:10px;padding:2px 10px;height:22px;line-height:1"
      onclick="SaudeVenda.abrirSimulador()">Simular ▾</button>
  </div>
  <div style="font-size:11px;color:var(--text3);margin-bottom:10px">${r.descricao}</div>

  <!-- Barra de saúde (gradiente + marcador) -->
  <div style="position:relative;margin-bottom:6px">
    <div style="height:8px;border-radius:4px;
      background:linear-gradient(to right,#ef4444 0%,#f97316 25%,#eab308 50%,#22c55e 75%,#3b82f6 100%)"></div>
    <div style="position:absolute;top:-5px;left:calc(${pos}% - 9px);
      width:18px;height:18px;border-radius:50%;background:#fff;
      border:3px solid ${r.cor};box-shadow:0 1px 5px rgba(0,0,0,.5);
      transition:left .35s cubic-bezier(.4,0,.2,1)"></div>
  </div>
  <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text3);
    margin-bottom:10px;padding:0 2px">
    <span>🔴</span><span>🟠</span><span>🟡</span><span>🟢</span><span>🔵</span>
  </div>

  <!-- Métricas rápidas -->
  ${podePermissao('ver_lucro_margem') ? `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
    <div style="background:var(--bg3);border-radius:6px;padding:7px 10px">
      <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Markup</div>
      <div style="font-weight:700;font-size:16px;color:${r.cor}">${isFinite(r.margem) ? r.margem.toFixed(1) + '%' : '∞%'}</div>
    </div>
    <div style="background:var(--bg3);border-radius:6px;padding:7px 10px">
      <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Lucro</div>
      <div style="font-weight:700;font-size:16px;color:${r.lucro >= 0 ? 'var(--green)' : 'var(--red)'}">
        ${r.lucro >= 0 ? '+' : '-'}R$ ${fmtMoney(Math.abs(r.lucro))}
      </div>
    </div>
  </div>` : ''}

  ${dispHtml}
  ${politicaHtml}
  ${sugestaoHtml}
</div>`;
  }

  // ─── Atualizar painel no DOM ──────────────────────────────────
  function atualizar(cart, descontoGeral, payMethod) {
    _cart = (cart || []).map(i => ({ ...i }));
    _payMethod = payMethod || 'dinheiro';

    const wrap    = document.getElementById('pdv-saude-wrap');
    const atalhos = document.getElementById('pdv-atalhos-wrap');
    if (!wrap) return;

    const itensReais = _cart.filter(i => (i.quantidade || 0) > 0);
    if (itensReais.length === 0) {
      _ultimoResultado = null;
      wrap.style.display = 'none';
      if (atalhos) atalhos.style.display = 'flex';
      return;
    }

    _ultimoResultado = calcular(_cart, descontoGeral, _payMethod);
    if (!_ultimoResultado) {
      wrap.style.display = 'none';
      if (atalhos) atalhos.style.display = 'flex';
      return;
    }

    // Sem permissão de ver saúde: ocultar painel inteiro
    if (!podePermissao('ver_saude_pedido')) {
      wrap.style.display = 'none';
      if (atalhos) atalhos.style.display = 'flex';
      return;
    }

    wrap.innerHTML = renderIndicador(_ultimoResultado);
    wrap.style.display = 'block';
    if (atalhos) atalhos.style.display = 'none';
  }

  // ─── Simulador de desconto ────────────────────────────────────
  function abrirSimulador() {
    if (!_ultimoResultado || _cart.length === 0) return;

    const subtotal = _ultimoResultado.subtotal;
    const steps    = [0, 2, 5, 8, 10, 15, 20, 30, 40];
    const CORES    = { excelente:'#3b82f6', saudavel:'#22c55e', atencao:'#eab308', limite:'#f97316', prejuizo:'#ef4444' };

    const rows = steps.map(pct => {
      const desc = subtotal * (pct / 100);
      const r    = calcular(_cart, desc, _payMethod);
      if (!r) return '';
      const cor  = CORES[r.status] || 'var(--text)';
      const isCurrent = Math.abs(desc - (_ultimoResultado.descontoGeral || 0)) < 0.01;
      const excedePolitica = r.descontoMaxPolitica != null && desc > r.descontoMaxPolitica + 0.01;
      const payBlock = r.payMethodBloqueado;
      const alertaIcone = excedePolitica ? ' ⛔' : (payBlock ? ' 🚫' : '');
      return `
<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;margin-bottom:4px;
  background:${cor}18;border:1.5px solid ${isCurrent ? cor : cor + '40'}">
  <div style="font-size:16px;width:22px;text-align:center">
    ${{ excelente:'🔵', saudavel:'🟢', atencao:'🟡', limite:'🟠', prejuizo:'🔴' }[r.status]}
  </div>
  <div style="flex:1">
    <div style="font-weight:600;font-size:12px;color:${cor}">${r.label}${isCurrent ? ' ← atual' : ''}${alertaIcone}</div>
    <div style="font-size:10px;color:var(--text3)">
      Desc. ${pct}% = R$ ${fmtMoney(desc)} · Total: R$ ${fmtMoney(r.total)}
    </div>
  </div>
  <div style="text-align:right;min-width:60px">
    <div style="font-size:13px;font-weight:700;color:${cor}">${isFinite(r.margem) ? r.margem.toFixed(1) + '%' : '∞%'}</div>
    <div style="font-size:10px;color:var(--text3)">${r.lucro >= 0 ? '+' : ''}R$ ${fmtMoney(r.lucro)}</div>
  </div>
</div>`;
    }).join('');

    Modal.open(`
<div style="font-size:11px;color:var(--text3);margin-bottom:12px">
  Subtotal: <strong>R$ ${fmtMoney(subtotal)}</strong> · Pagamento: <strong>${_payMethod}</strong>
</div>
${rows}
<div class="modal-actions">
  <button class="btn btn-ghost" onclick="Modal.close()">Fechar</button>
</div>`, 'Simulador de Desconto');
  }

  // ─── Autorização para venda em prejuízo ───────────────────────
  function precisaAutorizacao(resultado) {
    return resultado && resultado.status === 'prejuizo';
  }

  async function verificarAutorizacao() {
    return new Promise(resolve => {
      const senha = cfg.senha_autorizacao;
      if (!senha) {
        // Sem senha configurada: apenas confirmação visual
        Modal.open(`
<div style="text-align:center;margin-bottom:20px">
  <div style="font-size:44px;margin-bottom:8px">🔴</div>
  <div style="font-size:15px;color:var(--red);font-weight:700">Venda em Prejuízo</div>
  <div style="font-size:12px;color:var(--text3);margin-top:8px;line-height:1.5">
    Esta venda está gerando prejuízo.<br>Confirme para continuar mesmo assim.
  </div>
</div>
<div class="modal-actions">
  <button class="btn btn-ghost" onclick="SaudeVenda._cancelarAuth()">Cancelar</button>
  <button class="btn btn-danger btn-lg" onclick="SaudeVenda._confirmarAuthSemSenha()">Continuar mesmo assim</button>
</div>`, 'Autorização Necessária');
        window._saudeVendaAuthResolve = resolve;
        return;
      }

      Modal.open(`
<div style="text-align:center;margin-bottom:16px">
  <div style="font-size:44px;margin-bottom:8px">🔐</div>
  <div style="font-size:15px;color:var(--red);font-weight:700">Venda em Prejuízo</div>
  <div style="font-size:12px;color:var(--text3);margin-top:6px">Informe a senha de autorização do supervisor.</div>
</div>
<input class="input" id="auth-senha" type="password" placeholder="Senha de autorização"
  style="text-align:center;font-size:18px;letter-spacing:6px"
  onkeydown="if(event.key==='Enter') SaudeVenda._confirmarAuth()">
<div style="min-height:20px;margin-top:8px;text-align:center" id="auth-erro"></div>
<div class="modal-actions">
  <button class="btn btn-ghost" onclick="SaudeVenda._cancelarAuth()">Cancelar</button>
  <button class="btn btn-danger btn-lg" onclick="SaudeVenda._confirmarAuth()">Autorizar</button>
</div>`, 'Autorização Necessária');
      setTimeout(() => document.getElementById('auth-senha')?.focus(), 80);
      window._saudeVendaAuthResolve = resolve;
    });
  }

  function _confirmarAuth() {
    const val = document.getElementById('auth-senha')?.value || '';
    if (val === cfg.senha_autorizacao) {
      Modal.close();
      window._saudeVendaAuthResolve?.(true);
    } else {
      const el = document.getElementById('auth-erro');
      if (el) el.innerHTML = '<span style="color:var(--red)">Senha incorreta</span>';
      document.getElementById('auth-senha')?.select();
    }
  }

  function _confirmarAuthSemSenha() {
    Modal.close();
    window._saudeVendaAuthResolve?.(true);
  }

  function _cancelarAuth() {
    Modal.close();
    window._saudeVendaAuthResolve?.(false);
  }

  function getUltimoResultado() { return _ultimoResultado; }

  async function init() { await loadConfig(); }

  return {
    init, calcular, atualizar, getUltimoResultado,
    precisaAutorizacao, verificarAutorizacao,
    abrirSimulador,
    _confirmarAuth, _confirmarAuthSemSenha, _cancelarAuth,
  };
})();
