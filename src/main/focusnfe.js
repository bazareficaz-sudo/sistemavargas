/**
 * Módulo FocusNFe — Emissão de NFC-e
 * Documentação: https://focusnfe.com.br/doc/
 */

const fetch = require('node-fetch');
const Store = require('electron-store');
const store = new Store();

const URLS = {
  homologacao: 'https://homologacao.focusnfe.com.br',
  producao:    'https://api.focusnfe.com.br',
};

function getBaseUrl() {
  const ambiente = store.get('config.fiscal_ambiente') || 'homologacao';
  return URLS[ambiente] || URLS.homologacao;
}

function getToken() {
  // Token da empresa fiscal (Base44) tem prioridade sobre o configurado manualmente
  const usuario = store.get('auth.usuario') || {};
  return usuario.empresa_fiscal_token_focusnfe || store.get('config.fiscal_token') || '';
}

function authHeader(token) {
  const b64 = Buffer.from(`${token}:`).toString('base64');
  return { 'Authorization': `Basic ${b64}`, 'Content-Type': 'application/json' };
}

// ─── Montar payload NFC-e ────────────────────────────────────────────

function montarPayload(venda) {
  const cfg = store.store;
  const usuario = cfg['auth.usuario'] || {};

  // Dados da empresa fiscal (vindos do Base44 no login — campos exatos do Base44)
  const cnpj       = usuario.empresa_fiscal_cnpj       || store.get('config.fiscal_cnpj') || '';
  const ie         = usuario.empresa_fiscal_ie          || null;
  const regime     = usuario.empresa_fiscal_regime      || 'simples_nacional';
  const uf         = usuario.empresa_fiscal_uf          || null;   // Base44: estado
  const cep        = usuario.empresa_fiscal_cep         || null;
  const logradouro = usuario.empresa_fiscal_logradouro  || null;
  const numero     = usuario.empresa_fiscal_numero      || 'S/N';
  const complemento= usuario.empresa_fiscal_complemento || null;
  const bairro     = usuario.empresa_fiscal_bairro      || null;
  const municipio  = usuario.empresa_fiscal_municipio   || null;   // Base44: cidade
  const telefone   = usuario.empresa_fiscal_telefone    || null;
  // ConfigFiscal — CSC e id_token obrigatórios em produção
  const csc        = usuario.nfce_csc                   || null;
  const idToken    = usuario.nfce_id_token              || null;
  const serie      = usuario.nfce_serie                 || '001';

  // Identificação
  const now = new Date().toISOString().slice(0, 19) + '-03:00';
  const reference = `NFCe-${venda.numero || venda.id}`;

  // Itens
  const items = (venda.itens || []).map((item, idx) => ({
    numero_item:               idx + 1,
    codigo_produto:            item.produto_sku || item.produto_id,
    descricao:                 item.produto_nome,
    ncm:                       item.ncm || '00000000',
    cfop:                      item.cfop || '5102',
    unidade_comercial:         item.unidade || 'UN',
    quantidade_comercial:      item.quantidade,
    valor_unitario_comercial:  item.preco_unitario,
    valor_bruto:               item.total ?? (item.quantidade * item.preco_unitario),
    // Simples Nacional (CSOSN 400 = sem crédito de ICMS)
    icms_situacao_tributaria:  item.icms_cst || '400',
    icms_origem:               item.icms_origem ?? 0,
    // PIS / COFINS — 07 = operação isenta (Simples)
    pis_situacao_tributaria:   item.pis_cst  || '07',
    cofins_situacao_tributaria:item.cofins_cst || '07',
    // Desconto por item
    ...(item.desconto > 0 ? { valor_desconto: item.desconto } : {}),
  }));

  // Forma de pagamento → código FocusNFe
  const mapaForma = {
    dinheiro:   '01',
    credito:    '03',
    debito:     '04',
    pix:        '17',
    carteira:   '99',  // crédito loja
    fiado:      '99',
    outros:     '99',
  };
  const codigoForma = mapaForma[venda.forma_pagamento] || '99';
  const formasPagamento = [{
    forma_pagamento: codigoForma,
    valor_pagamento: venda.total,
    ...(codigoForma === '01' && venda.troco > 0 ? { valor_troco: venda.troco } : {}),
  }];

  const payload = {
    // Emitente — dados completos da empresa fiscal (Base44)
    cnpj_emitente:   cnpj,
    inscricao_estadual_emitente: ie || 'ISENTO',
    ...(uf         ? { uf_emitente:         uf                      } : {}),
    ...(cep        ? { cep_emitente:        cep.replace(/\D/g,'')   } : {}),
    ...(logradouro ? { logradouro_emitente: logradouro              } : {}),
    ...(numero     ? { numero_emitente:     numero                  } : {}),
    ...(complemento? { complemento_emitente:complemento             } : {}),
    ...(bairro     ? { bairro_emitente:     bairro                  } : {}),
    ...(municipio  ? { municipio_emitente:  municipio               } : {}),
    ...(telefone   ? { telefone_emitente:   telefone.replace(/\D/g,'')} : {}),
    regime_tributario_emitente: regime === 'simples_nacional' ? 1 : 3,
    // NFC-e: série e CSC (obrigatório em produção)
    serie: serie,
    ...(csc     ? { csc_nfce:      csc     } : {}),
    ...(idToken ? { id_token_nfce: idToken } : {}),

    // Natureza e datas
    natureza_operacao:  'VENDA AO CONSUMIDOR',
    data_emissao:       now,
    data_entrada_saida: now,

    // Tipo NFC-e
    tipo_documento:    65,   // NFC-e
    tipo_emissao:       1,   // normal
    finalidade_emissao: 1,   // normal
    consumidor_final:   1,
    presenca_comprador: venda.entrega ? 4 : 1,  // 4=entrega, 1=presencial

    // Destinatário (opcional em NFC-e até R$ 10.000 sem CPF)
    ...(venda.cliente_cpf ? {
      cpf_destinatario:  venda.cliente_cpf,
      nome_destinatario: venda.cliente_nome,
    } : {}),

    // Frete
    modalidade_frete: 9,  // sem frete

    // Itens
    items,

    // Pagamento
    formas_pagamento: formasPagamento,

    // Totais (calculados automaticamente pelo FocusNFe, mas podemos informar)
    valor_total: venda.total,
    ...(venda.desconto > 0 ? { valor_desconto: venda.desconto } : {}),
  };

  return { reference, payload };
}

// ─── API FocusNFe ────────────────────────────────────────────────────

async function emitirNFCe(venda) {
  const token = getToken();
  if (!token) throw new Error('Token FocusNFe não configurado');

  const cnpj = store.get('config.fiscal_cnpj') || (store.get('auth.usuario') || {}).empresa_fiscal_cnpj;
  if (!cnpj) throw new Error('CNPJ da empresa fiscal não configurado');

  const { reference, payload } = montarPayload(venda);
  const base = getBaseUrl();
  const url  = `${base}/v2/nfce?ref=${reference}`;

  const res = await fetch(url, {
    method:  'POST',
    headers: authHeader(token),
    body:    JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 200 || res.status === 201 || data.status === 'autorizado') {
    return { ok: true, status: data.status, reference, data };
  }

  // Aguardar processamento (status 202)
  if (res.status === 202) {
    return { ok: true, aguardando: true, reference, data };
  }

  const erros = data.erros?.map(e => e.mensagem).join('; ') || data.mensagem || res.statusText;
  return { ok: false, erro: erros, reference, data };
}

async function consultarNFCe(reference) {
  const token = getToken();
  const base  = getBaseUrl();
  const res   = await fetch(`${base}/v2/nfce/${reference}`, {
    headers: authHeader(token),
  });
  const data = await res.json().catch(() => ({}));
  return data;
}

async function cancelarNFCe(reference, justificativa) {
  const token = getToken();
  const base  = getBaseUrl();
  const res   = await fetch(`${base}/v2/nfce/${reference}`, {
    method:  'DELETE',
    headers: authHeader(token),
    body:    JSON.stringify({ justificativa }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

async function obterDanfe(reference) {
  const token = getToken();
  const base  = getBaseUrl();
  const res   = await fetch(`${base}/v2/nfce/${reference}?completo=1`, {
    headers: authHeader(token),
  });
  const data = await res.json().catch(() => ({}));
  // data.danfe_url ou data.url_danfe_nfce
  return data.danfe_url || data.url_danfe_nfce || null;
}

module.exports = { emitirNFCe, consultarNFCe, cancelarNFCe, obterDanfe, montarPayload };
