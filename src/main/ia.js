/**
 * ia.js — Integração com Claude (Anthropic) para enriquecimento de produtos
 */

const fetch = require('node-fetch');
const Store = require('electron-store');
const store = new Store();

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

function getApiKey() {
  return store.get('config.anthropic_key') || '';
}

async function callClaude(prompt) {
  const key = getApiKey();
  if (!key) throw new Error('Chave da API Anthropic não configurada. Acesse Config → IA para cadastrar.');

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

/**
 * Sugere dados fiscais para um produto.
 * Retorna objeto com ncm, cfop, icms_cst, icms_origem, pis_cst, cofins_cst.
 */
async function sugerirFiscal(nome, categoria, unidade) {
  const prompt = `Você é um especialista em tributação brasileira. Dado o produto abaixo, retorne APENAS um JSON válido com os campos fiscais. Não escreva mais nada além do JSON.

Produto: "${nome}"
Categoria: "${categoria || 'não informada'}"
Unidade: "${unidade || 'UN'}"

Retorne exatamente este JSON (sem markdown, sem explicações):
{
  "ncm": "XXXXXXXX",
  "cfop": "5102",
  "icms_cst": "400",
  "icms_origem": 0,
  "pis_cst": "07",
  "cofins_cst": "07",
  "justificativa_ncm": "explicação em 1 linha"
}

Regras:
- NCM: 8 dígitos sem ponto (ex: "73239900")
- CFOP: use 5102 para venda de mercadoria no estado, 6102 para fora do estado — use 5102 por padrão
- ICMS CST (Simples Nacional): use CSOSN 400 para a maioria; 500 se ST
- icms_origem: 0=nacional, 1=importado direto, 2=importado merc.interno
- PIS/COFINS CST: use 07 para Simples Nacional (isento)`;

  const texto = await callClaude(prompt);

  // Extrair JSON da resposta (Claude pode envolver com ```json```)
  const match = texto.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('IA não retornou JSON válido');
  return JSON.parse(match[0]);
}

/**
 * Gera descrição comercial para um produto.
 */
async function gerarDescricao(nome, categoria, marca, unidade) {
  const prompt = `Gere uma descrição comercial curta (2-3 frases) para este produto de uma loja de varejo brasileira. Seja objetivo e informativo. Não use emojis.

Produto: "${nome}"
Categoria: "${categoria || ''}"
Marca: "${marca || ''}"
Unidade: "${unidade || 'UN'}"

Retorne apenas a descrição, sem título, sem aspas.`;

  return await callClaude(prompt);
}

/**
 * Enriquecimento em lote: recebe lista de {id, nome, categoria, unidade}
 * Retorna lista de {id, ncm, cfop, icms_cst, icms_origem, pis_cst, cofins_cst}
 */
async function enriquecerLote(produtos) {
  const lista = produtos.map((p, i) => `${i + 1}. ID:${p.id} | "${p.nome}" | cat:${p.categoria || '-'}`).join('\n');

  const prompt = `Você é um especialista em tributação brasileira. Para cada produto abaixo, retorne APENAS um array JSON com os dados fiscais. Não escreva mais nada além do JSON.

Produtos:
${lista}

Retorne exatamente este formato (array, sem markdown):
[
  {"id": "ID_DO_PRODUTO", "ncm": "XXXXXXXX", "cfop": "5102", "icms_cst": "400", "icms_origem": 0, "pis_cst": "07", "cofins_cst": "07"},
  ...
]

Regras:
- NCM: 8 dígitos sem ponto
- CFOP: 5102 por padrão
- ICMS CSOSN: 400 para maioria no Simples; 500 se ST
- PIS/COFINS: 07 (isento Simples)
- Inclua TODOS os produtos na resposta, na mesma ordem`;

  const texto = await callClaude(prompt);
  const match = texto.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('IA não retornou JSON válido');
  return JSON.parse(match[0]);
}

module.exports = { sugerirFiscal, gerarDescricao, enriquecerLote, getApiKey };
