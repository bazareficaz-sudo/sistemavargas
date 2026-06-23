// ═══════════════════════════════════════════════════════════════
// BASE44 BACKEND FUNCTIONS — Sistema Vargas / PDV Terminal
// Cole cada função no painel do Base44 com o nome indicado
// ═══════════════════════════════════════════════════════════════


// ─────────────────────────────────────────────────────────────────
// Function: pdvPing
// Descrição: Verificar conectividade do terminal
// ─────────────────────────────────────────────────────────────────
export default async function pdvPing({ context }) {
  return { ok: true, timestamp: new Date().toISOString() };
}


// ─────────────────────────────────────────────────────────────────
// Function: pdvAutenticarTerminal
// Descrição: Autenticar operador e retornar token de sessão
// Body: { usuario: string, senha: string }
// ─────────────────────────────────────────────────────────────────
export default async function pdvAutenticarTerminal({ body, context }) {
  const { usuario, senha } = body;

  // Buscar usuário nas entidades do Base44
  const usuarios = await context.entities.UsuarioEmpresa.filter({
    email: usuario,
    ativo: true,
  });

  if (!usuarios.length) {
    throw new Error('Usuário não encontrado');
  }

  const user = usuarios[0];

  // Validar senha (adapte conforme seu sistema de auth do Base44)
  // Se usar auth nativa do Base44, ajuste aqui
  if (user.senha_hash && user.senha_hash !== hashSenha(senha)) {
    throw new Error('Senha incorreta');
  }

  // Buscar empresa vinculada
  const empresas = await context.entities.Empresa.filter({
    id: user.empresa_id,
    ativo: true,
  });

  const empresa = empresas[0];

  // Buscar depósito padrão da empresa
  const depositos = await context.entities.Deposito.filter({
    empresa_id: user.empresa_id,
    principal: true,
  });

  const deposito = depositos[0];

  // Gerar token simples (em produção use JWT)
  const token = Buffer.from(`${user.id}:${user.empresa_id}:${Date.now()}`).toString('base64');

  return {
    token,
    usuario: {
      id: user.id,
      nome: user.nome,
      email: user.email,
      cargo: user.cargo || 'Operador',
    },
    empresa_id: user.empresa_id,
    empresa_nome: empresa?.nome || '',
    deposito_id: deposito?.id || null,
    deposito_nome: deposito?.nome || '',
  };
}

function hashSenha(senha) {
  // Implemente conforme sua lógica de hash
  return senha; // placeholder
}


// ─────────────────────────────────────────────────────────────────
// Function: pdvSincronizarProdutos
// Descrição: Retornar produtos atualizados desde última sync
// Body: { ultima_sincronizacao?: string, empresa_id: string, deposito_id: string }
// ─────────────────────────────────────────────────────────────────
export default async function pdvSincronizarProdutos({ body, context }) {
  const { ultima_sincronizacao, empresa_id } = body;

  // Filtro base
  const filtros = { ativo: true };

  // Se tiver data de última sync, só retornar alterados
  if (ultima_sincronizacao) {
    filtros.updated_at_gte = ultima_sincronizacao;
  }

  // Buscar produtos (Base44 pagina automaticamente — ajuste limit se necessário)
  const produtos = await context.entities.Produto.filter(filtros, {
    limit: 5000, // ajuste conforme seu volume
    orderBy: 'updated_at',
  });

  // Mapear para formato esperado pelo PDV
  const result = produtos.map(p => ({
    id: p.id,
    nome: p.nome,
    sku: p.sku || null,
    ean: p.ean || p.codigo_barras || null,
    preco_venda: p.preco_venda || p.preco || 0,
    preco_custo: p.preco_custo || 0,
    unidade: p.unidade || 'UN',
    categoria: p.categoria || null,
    marca: p.marca || null,
    foto_url: p.foto_url || null,
    emoji: p.emoji || null,
    ativo: p.ativo !== false,
    permite_fracao: p.permite_fracao || false,
    updated_at: p.updated_at,
  }));

  return {
    produtos: result,
    total: result.length,
    timestamp: new Date().toISOString(),
  };
}


// ─────────────────────────────────────────────────────────────────
// Function: pdvSincronizarClientes
// Descrição: Retornar clientes atualizados
// Body: { ultima_sincronizacao?: string, empresa_id: string }
// ─────────────────────────────────────────────────────────────────
export default async function pdvSincronizarClientes({ body, context }) {
  const { ultima_sincronizacao, empresa_id } = body;

  const filtros = {};
  if (ultima_sincronizacao) filtros.updated_at_gte = ultima_sincronizacao;

  const clientes = await context.entities.Cliente.filter(filtros, {
    limit: 2000,
    orderBy: 'nome',
  });

  const result = clientes.map(c => ({
    id: c.id,
    nome: c.nome,
    cpf_cnpj: c.cpf_cnpj || c.cpf || c.cnpj || null,
    telefone: c.telefone || c.celular || null,
    email: c.email || null,
    limite_credito: c.limite_credito || 0,
    saldo_credito: c.saldo_credito || 0,
    updated_at: c.updated_at,
  }));

  return { clientes: result, total: result.length };
}


// ─────────────────────────────────────────────────────────────────
// Function: pdvSincronizarEstoque
// Descrição: Retornar posição de estoque atual
// Body: { ultima_sincronizacao?: string, empresa_id: string, deposito_id: string }
// ─────────────────────────────────────────────────────────────────
export default async function pdvSincronizarEstoque({ body, context }) {
  const { ultima_sincronizacao, empresa_id, deposito_id } = body;

  const filtros = {};
  if (empresa_id) filtros.empresa_id = empresa_id;
  if (deposito_id) filtros.deposito_id = deposito_id;
  if (ultima_sincronizacao) filtros.updated_at_gte = ultima_sincronizacao;

  const estoques = await context.entities.EstoqueEmpresa.filter(filtros, {
    limit: 10000,
  });

  const result = estoques.map(e => ({
    produto_id: e.produto_id,
    deposito_id: e.deposito_id,
    empresa_id: e.empresa_id,
    quantidade: e.quantidade || 0,
    quantidade_minima: e.quantidade_minima || 0,
    updated_at: e.updated_at,
  }));

  return { estoque: result, total: result.length };
}


// ─────────────────────────────────────────────────────────────────
// Function: pdvRegistrarVenda
// Descrição: Receber venda do terminal PDV e salvar
// ─────────────────────────────────────────────────────────────────
export default async function pdvRegistrarVenda({ body, context }) {
  const { itens, cliente_id, empresa_id, deposito_id, operador_id,
          operador_nome, subtotal, desconto, total, forma_pagamento,
          valor_pago, troco, observacao, terminal_id } = body;

  // Criar venda principal
  const venda = await context.entities.Venda.create({
    cliente_id: cliente_id || null,
    empresa_id: empresa_id || null,
    deposito_id: deposito_id || null,
    operador_id: operador_id || null,
    operador_nome: operador_nome || 'Terminal PDV',
    terminal_id: terminal_id || 'PDV',
    status: 'concluida',
    subtotal: subtotal || 0,
    desconto: desconto || 0,
    total: total || 0,
    forma_pagamento,
    valor_pago: valor_pago || total,
    troco: troco || 0,
    observacao: observacao || null,
    origem: 'pdv',
  });

  // Criar itens e atualizar estoque
  for (const item of (itens || [])) {
    await context.entities.VendaItem?.create({
      venda_id: venda.id,
      produto_id: item.produto_id,
      produto_nome: item.produto_nome,
      quantidade: item.quantidade,
      preco_unitario: item.preco_unitario,
      desconto: item.desconto || 0,
      total: item.total,
    });

    // Atualizar estoque no servidor
    const estoques = await context.entities.EstoqueEmpresa.filter({
      produto_id: item.produto_id,
      deposito_id: deposito_id,
    });

    if (estoques.length > 0) {
      const est = estoques[0];
      await context.entities.EstoqueEmpresa.update(est.id, {
        quantidade: (est.quantidade || 0) - item.quantidade,
      });
    }

    // Registrar movimentação
    await context.entities.MovimentacaoEstoque.create({
      produto_id: item.produto_id,
      deposito_id: deposito_id || null,
      empresa_id: empresa_id || null,
      tipo: 'saida',
      quantidade: item.quantidade,
      referencia_id: venda.id,
      referencia_tipo: 'venda',
      operador_id: operador_id || null,
      observacao: `Venda PDV ${terminal_id || ''}`,
    });
  }

  // Lançar crédito do cliente se necessário
  if (forma_pagamento === 'credito_cliente' && cliente_id) {
    const clientes = await context.entities.Cliente.filter({ id: cliente_id });
    if (clientes.length > 0) {
      const c = clientes[0];
      await context.entities.Cliente.update(cliente_id, {
        saldo_credito: (c.saldo_credito || 0) - total,
      });
    }
  }

  return { id: venda.id, numero: venda.numero || null, ok: true };
}


// ─────────────────────────────────────────────────────────────────
// Function: pdvCancelarVenda
// Descrição: Cancelar venda e estornar estoque
// Body: { venda_id: string, motivo: string }
// ─────────────────────────────────────────────────────────────────
export default async function pdvCancelarVenda({ body, context }) {
  const { venda_id, motivo } = body;

  const vendas = await context.entities.Venda.filter({ id: venda_id });
  if (!vendas.length) throw new Error('Venda não encontrada');

  const venda = vendas[0];
  if (venda.status === 'cancelada') return { ok: true, msg: 'Já cancelada' };

  // Cancelar
  await context.entities.Venda.update(venda_id, {
    status: 'cancelada',
    observacao_cancelamento: motivo,
    cancelado_em: new Date().toISOString(),
  });

  // Estornar estoque
  const itens = await context.entities.VendaItem?.filter({ venda_id }) || [];
  for (const item of itens) {
    const estoques = await context.entities.EstoqueEmpresa.filter({
      produto_id: item.produto_id,
      deposito_id: venda.deposito_id,
    });
    if (estoques.length > 0) {
      await context.entities.EstoqueEmpresa.update(estoques[0].id, {
        quantidade: (estoques[0].quantidade || 0) + item.quantidade,
      });
    }
    await context.entities.MovimentacaoEstoque.create({
      produto_id: item.produto_id,
      deposito_id: venda.deposito_id,
      tipo: 'entrada',
      quantidade: item.quantidade,
      referencia_id: venda_id,
      referencia_tipo: 'cancelamento',
      observacao: `Cancelamento: ${motivo}`,
    });
  }

  return { ok: true };
}


// ─────────────────────────────────────────────────────────────────
// Function: pdvRegistrarMovimentacaoEstoque
// Descrição: Registrar entrada/saída/ajuste avulso de estoque
// ─────────────────────────────────────────────────────────────────
export default async function pdvRegistrarMovimentacaoEstoque({ body, context }) {
  const { produto_id, deposito_id, empresa_id, tipo, quantidade,
          quantidade_anterior, quantidade_posterior, observacao, operador_id } = body;

  const mov = await context.entities.MovimentacaoEstoque.create({
    produto_id,
    deposito_id: deposito_id || null,
    empresa_id: empresa_id || null,
    tipo,
    quantidade,
    quantidade_anterior: quantidade_anterior || null,
    quantidade_posterior: quantidade_posterior || null,
    operador_id: operador_id || null,
    observacao: observacao || null,
  });

  // Atualizar estoque
  const estoques = await context.entities.EstoqueEmpresa.filter({
    produto_id,
    deposito_id: deposito_id || undefined,
  });

  if (estoques.length > 0) {
    const est = estoques[0];
    const novaQtd = tipo === 'entrada'
      ? (est.quantidade || 0) + quantidade
      : tipo === 'saida'
        ? (est.quantidade || 0) - quantidade
        : quantidade_posterior ?? est.quantidade; // ajuste direto

    await context.entities.EstoqueEmpresa.update(est.id, { quantidade: novaQtd });
  }

  return { id: mov.id, ok: true };
}
