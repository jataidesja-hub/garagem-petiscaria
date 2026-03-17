/****************************************************
 * SISTEMA DEMONSTRATIVO - V1.0 - SUPABASE INTEGRATED
 ****************************************************/

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🚀 SUPABASE')
    .addItem('Sincronizar Estrutura', 'criarEstruturaSupabase')
    .addItem('Ver Link do Garçom', 'mostrarLinkGarcom')
    .addToUi();
}

function mostrarLinkGarcom() {
  const url = ScriptApp.getService().getUrl() + "?page=garcom";
  const html = HtmlService.createHtmlOutput('Copie o link: <br><input style="width:100%" value="'+url+'" readonly onClick="this.select();"> <br><br>Ou clique para abrir: <a href="'+url+'" target="_blank">Abrir App Garçom</a>').setWidth(400).setHeight(150);
  SpreadsheetApp.getUi().showModalDialog(html, 'Acesso Garçom');
}

const SENHA_ADMIN = "1234";
const SENHA_GARCOM = "1111";
const SENHA_COZINHA = "2222";

function doGet(e) {
  let page = e.parameter && e.parameter.page;
  
  if (page === 'manifest') {
    let type = e.parameter.type;
    let file = type === 'cozinha' ? 'manifest-cozinha' : 'manifest';
    return HtmlService.createTemplateFromFile(file).evaluate()
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .setMimeType(HtmlService.MimeType.JSON);
  }
  
  if (page === 'sw') {
    return HtmlService.createTemplateFromFile('sw').evaluate()
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .setMimeType(HtmlService.MimeType.JAVASCRIPT);
  }

  let pagina = (page === 'garcom') ? 'garcom' : (page === 'cozinha' ? 'cozinha' : 'index');
  return HtmlService.createTemplateFromFile(pagina).evaluate()
    .setTitle('DEMONSTRAÇÃO')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0');
}

function doPost(e) {
  let result;
  try {
    const request = JSON.parse(e.postData.contents);
    const functionName = request.function;
    const args = request.args || [];
    
    if (typeof this[functionName] !== 'function') {
      throw new Error("Função '" + functionName + "' não encontrada no Código.gs");
    }
    
    result = this[functionName].apply(this, args);
  } catch (err) {
    result = { sucesso: false, erro: err.toString() };
  }
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function verificarSenha(senha, papel) {
  let senhaCorreta = "";
  if (papel === 'admin') senhaCorreta = SENHA_ADMIN;
  else if (papel === 'garcom') senhaCorreta = SENHA_GARCOM;
  else if (papel === 'cozinha') senhaCorreta = SENHA_COZINHA;
  
  return { sucesso: (senha === senhaCorreta) };
}

// --- INTEGRAÇÃO SUPABASE ---

function criarEstruturaSupabase() {
  // Esta função envia os dados iniciais de exemplo se o banco estiver vazio
  const res = Supabase.select('estoque');
  if (res.sucesso && res.data.length === 0) {
    const exemplos = [
      {codigo: 'CERV01', nome: 'Cerveja Lata 350ml', preco_venda: 5.50, estoque_atual: 500, estoque_minimo: 50, url_imagem: 'https://cdn-icons-png.flaticon.com/512/931/931949.png', categoria: 'Cervejas'},
      {codigo: 'REFRI01', nome: 'Coca-Cola 2L', preco_venda: 12.00, estoque_atual: 100, estoque_minimo: 20, url_imagem: 'https://cdn-icons-png.flaticon.com/512/2405/2405479.png', categoria: 'Bebidas'},
      {codigo: 'BATATA01', nome: 'Batata Frita G', preco_venda: 25.00, estoque_atual: 100, estoque_minimo: 10, url_imagem: 'https://cdn-icons-png.flaticon.com/512/1046/1046784.png', categoria: 'Petiscos'}
    ];
    Supabase.insert('estoque', exemplos);
    return "Dados de exemplo carregados no Supabase!";
  }
  return "Estrutura já existente ou dados presentes no Supabase.";
}

function listarEstoque() {
  const res = Supabase.select('estoque');
  if (!res.sucesso) return [];
  return res.data.map(r => ({
    codigo: String(r.codigo), 
    nome: String(r.nome), 
    preco: Number(r.preco_venda), 
    estoque: Number(r.estoque_atual), 
    minimo: Number(r.estoque_minimo), 
    critico: Number(r.estoque_atual) <= Number(r.estoque_minimo), 
    imagem: String(r.url_imagem), 
    categoria: String(r.categoria || 'Bebidas')
  }));
}

function salvarEdicaoProduto(p) {
  const res = Supabase.update('estoque', {
    nome: p.nome,
    preco_venda: p.preco,
    estoque_atual: p.estoque, // Note: aqui o app original soma, vamos manter a lógica de update direto se p.estoque for o novo valor
    estoque_minimo: p.minimo,
    url_imagem: p.imagem,
    categoria: p.categoria
  }, `codigo=eq.${p.codigo}`);
  return { sucesso: res.sucesso };
}

function adicionarProduto(p) {
  const res = Supabase.upsert('estoque', {
    codigo: p.codigo,
    nome: p.nome,
    preco_venda: p.preco,
    estoque_atual: p.estoque,
    estoque_minimo: p.minimo,
    url_imagem: p.imagem,
    categoria: p.categoria
  });
  return { sucesso: res.sucesso };
}

function listarTodasComandas(dataInicio, dataFim, horaInicio, horaFim) {
  // Filtro básico no Supabase
  let path = 'comandas?select=*';
  if (dataInicio && dataFim) {
     const start = `${dataInicio}T${horaInicio || '00:00'}:00Z`;
     const end = `${dataFim}T${horaFim || '23:59'}:59Z`;
     path += `&abertura=gte.${start}&abertura=lte.${end}`;
  }
  
  const res = Supabase.fetch(path + '&order=abertura.desc');
  if (!res.sucesso) return [];

  return res.data.map(r => {
    return { 
      id: r.id, 
      nome: r.mesa_nome, 
      cliente: r.cliente,
      data: r.abertura,
      dataExibicao: Utilities.formatDate(new Date(r.abertura), "GMT-3", "dd/MM/yyyy HH:mm"), 
      status: r.status, 
      total: Number(r.total_liquido)
    };
  });
}

function buscarItensComanda(idComanda) {
  const res = Supabase.select('comanda_itens', `*,id_comandas(status)`);
  if (!res.sucesso) return [];
  
  // Filtrar pela comanda
  const itens = res.data.filter(i => i.id_comanda === idComanda);
  
  return itens.map(i => ({
    codigo: i.codigo_produto,
    nome: i.nome_produto,
    qtd: i.qtd,
    preco: i.preco_unit,
    total: i.total_bruto,
    categoria: i.categoria,
    obs: i.observacao,
    garcom: i.garcom
  }));
}

function abrirNovaComanda(nome) {
  const id = 'CM' + new Date().getTime();
  Supabase.insert('comandas', {
    id: id,
    mesa_nome: nome,
    status: 'ABERTA'
  });
  return id;
}

function adicionarItemComanda(idComanda, cod, obs, garcom) {
  const resProd = Supabase.fetch(`estoque?codigo=eq.${cod}`);
  if (!resProd.sucesso || resProd.data.length === 0) return {sucesso: false, erro: "Produto não encontrado"};
  
  const p = resProd.data[0];
  const item = {
    id_comanda: idComanda,
    codigo_produto: p.codigo,
    nome_produto: p.nome,
    qtd: 1,
    preco_unit: p.preco_venda,
    total_bruto: p.preco_venda,
    observacao: obs || '',
    categoria: p.categoria,
    status_item: 'PENDENTE',
    garcom: garcom || ''
  };

  const res = Supabase.insert('comanda_itens', item);
  if (res.sucesso) {
    // Baixa no estoque
    Supabase.rpc('baixar_estoque', { prod_id: cod, quantidade: 1 });
  }
  return { sucesso: res.sucesso };
}

function finalizarVenda(dados) {
  try {
    // 1. Registrar na tabela vendas
    const venda = {
      id_comanda: dados.id,
      tipo_venda: dados.tipo,
      total_liquido: dados.total,
      forma_pagamento: dados.forma,
      cliente: dados.cliente,
      valor_pago: dados.total,
      troco: dados.troco
    };
    Supabase.insert('vendas', venda);

    // 2. Se for comanda, fechar
    if (dados.tipo === 'COMANDA') {
      Supabase.update('comandas', {
        status: 'FECHADA',
        total_liquido: dados.total,
        forma_pagamento: dados.forma,
        valor_pago: dados.total
      }, `id=eq.${dados.id}`);
    } else {
      // Venda Direta - Criamos uma comanda fantasma fechada para histórico
      Supabase.insert('comandas', {
        id: dados.id,
        mesa_nome: 'Venda Direta',
        status: 'FECHADA',
        total_liquido: dados.total,
        cliente: dados.cliente
      });
    }

    return { sucesso: true };
  } catch (err) {
    return { sucesso: false, erro: err.toString() };
  }
}

function listarPedidosCozinha() {
  const res = Supabase.fetch('comanda_itens?status_item=eq.PENDENTE&order=timestamp.asc');
  if (!res.sucesso) return [];
  
  return res.data.map(r => ({
    rowIndex: r.id, // Usamos o ID do banco como referência
    idComanda: r.id_comanda,
    nome: r.nome_produto,
    qtd: r.qtd,
    obs: r.observacao,
    status: r.status_item,
    timestamp: new Date(r.timestamp).getTime()
  }));
}

function marcarPedidoPronto(id) {
  const res = Supabase.update('comanda_itens', { status_item: 'PRONTO' }, `id=eq.${id}`);
  return { sucesso: res.sucesso };
}

function getScriptUrl() {
  return ScriptApp.getService().getUrl();
}
