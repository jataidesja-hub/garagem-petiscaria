/****************************************************
 * SISTEMA DISTRIBUIDORA DE BEBIDAS - V12.0 (PDV PRO)
 ****************************************************/

const ABA_ESTOQUE       = 'Estoque';
const ABA_VENDAS        = 'Vendas';
const ABA_COMANDAS      = 'Comandas';
const ABA_COMANDA_ITENS = 'ComandaItens';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🚀 DEMONSTRAÇÃO')
    .addItem('Restaurar Estrutura e Exemplos', 'criarEstrutura')
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

// NOVA FUNÇÃO PARA ACEITAR CONEXÃO DA VERCEL
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

function getOrCreateSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function criarEstrutura() {
  const abas = [
    {nome: ABA_ESTOQUE, cabecalho: ['Código', 'Nome', 'Unidade', 'Tipo Controle', 'Qtd por Caixa', 'Preço Venda', 'Estoque Atual', 'Estoque Mínimo', 'URL Imagem', 'Categoria']},
    {nome: ABA_VENDAS, cabecalho: ['Data/Hora', 'Tipo', 'ID Comanda', 'Cód Produto', 'Nome', 'Qtd', 'Preço Unit', 'Total Bruto', 'Desconto', 'Total Líquido', 'Pagamento', 'Valor Pago', 'Troco']},
    {nome: ABA_COMANDAS, cabecalho: ['ID Comanda', 'Mesa/Nome', 'Cliente', 'Abertura', 'Status', 'Bruto', 'Desconto', 'Líquido', 'Pagamento', 'Valor Pago', 'Troco']},
    {nome: ABA_COMANDA_ITENS, cabecalho: ['ID Comanda', 'Cód Produto', 'Nome', 'Qtd', 'Preço Unit', 'Total Bruto', 'Desconto', 'Observação', 'Categoria', 'StatusItem', 'Timestamp']}
  ];
  abas.forEach(a => {
    let sh = getOrCreateSheet(a.nome);
    sh.clear();
    sh.appendRow(a.cabecalho);
  });
  
  const shEstoque = getOrCreateSheet(ABA_ESTOQUE);
  shEstoque.appendRow(['CERV01', 'Cerveja Lata 350ml', 'un', 'un', 0, 5.50, 500, 50, 'https://cdn-icons-png.flaticon.com/512/931/931949.png', 'Cervejas']);
  shEstoque.appendRow(['REFRI01', 'Coca-Cola 2L', 'un', 'un', 0, 12.00, 100, 20, 'https://cdn-icons-png.flaticon.com/512/2405/2405479.png', 'Bebidas']);
  shEstoque.appendRow(['BATATA01', 'Batata Frita G', 'un', 'un', 0, 25.00, 100, 10, 'https://cdn-icons-png.flaticon.com/512/1046/1046784.png', 'Petiscos']);
  
  return "Estrutura e exemplos criados com sucesso!";
}

function listarEstoque() {
  const sh = getOrCreateSheet(ABA_ESTOQUE);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  return data.slice(1).map(r => ({
    codigo: String(r[0]), nome: String(r[1]), preco: Number(r[5]), estoque: Number(r[6]), minimo: Number(r[7]), critico: Number(r[6]) <= Number(r[7]), imagem: String(r[8]), categoria: String(r[9] || 'Bebidas')
  }));
}

function salvarEdicaoProduto(p) {
  const sh = getOrCreateSheet(ABA_ESTOQUE);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(p.codigo)) {
      let novaQtd = Number(data[i][6]) + Number(p.estoque);
      sh.getRange(i + 1, 2, 1, 9).setValues([[p.nome, 'un', 'un', 0, p.preco, novaQtd, p.minimo, p.imagem, p.categoria]]);
      return { sucesso: true };
    }
  }
  return { sucesso: false };
}

function adicionarProduto(p) {
  const sh = getOrCreateSheet(ABA_ESTOQUE);
  const data = sh.getDataRange().getValues();
  
  // Verificar se produto já existe pelo código
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(p.codigo)) {
      let novaQtd = Number(data[i][6]) + Number(p.estoque);
      sh.getRange(i + 1, 7).setValue(novaQtd);
      return { sucesso: true, mensagem: "Quantidade somada ao produto existente." };
    }
  }

  let cod = p.codigo || ('PROD' + (sh.getLastRow() + 1));
  sh.appendRow([cod, p.nome, 'un', 'un', 0, p.preco, p.estoque, p.minimo, p.imagem, p.categoria]);
  return { sucesso: true };
}

function listarTodasComandas(dataInicio, dataFim) {
  const sh = getOrCreateSheet(ABA_COMANDAS);
  const shItens = getOrCreateSheet(ABA_COMANDA_ITENS);
  const data = sh.getDataRange().getValues();
  const itens = shItens.getDataRange().getValues();
  if (data.length < 2) return [];
  
  // Se não passar datas (null, undefined ou vazio), considera apenas o dia atual
  const hoje = Utilities.formatDate(new Date(), "GMT-3", "yyyy-MM-dd");
  const inicio = (dataInicio && dataInicio !== '') ? dataInicio : hoje;
  const fim = (dataFim && dataFim !== '') ? dataFim : hoje;
  
  return data.slice(1).reverse().map(r => {
    let id = String(r[0]);
    let status = r[4];
    let totalComanda = 0;
    if (status === 'ABERTA') {
      for(let i=1; i<itens.length; i++) {
        if(String(itens[i][0]) === id) totalComanda += (Number(itens[i][5]) || 0);
      }
    } else {
      totalComanda = Number(r[7]) || 0;
    }
    
    let dataFormatada = "";
    let dataParaFiltro = "";
    let isAntiga = false;
    try { 
      let d = new Date(r[3]);
      dataFormatada = Utilities.formatDate(d, "GMT-3", "dd/MM/yyyy HH:mm");
      dataParaFiltro = Utilities.formatDate(d, "GMT-3", "yyyy-MM-dd"); 
      // Se a data da comanda for menor que hoje, é antiga
      if (dataParaFiltro < hoje) isAntiga = true;
    } catch(e) { }
    
    return { 
      id: id, 
      nome: r[1], 
      data: dataParaFiltro, 
      dataExibicao: dataFormatada, 
      status: status, 
      total: totalComanda,
      isAntiga: isAntiga 
    };
  }).filter(comanda => {
    // REGRA DE FILTRO:
    // 1. Se estiver ABERTA, mostra sempre (independente da data)
    // 2. Se estiver FECHADA ou outro status, valida o filtro de data
    if (comanda.status === 'ABERTA') return true;
    
    if (!comanda.data) return false;
    return comanda.data >= inicio && comanda.data <= fim;
  });
}

function buscarItensComanda(idComanda) {
  const sh = getOrCreateSheet(ABA_COMANDA_ITENS);
  const data = sh.getDataRange().getValues();
  let itens = [];
  
  if (idComanda && data.length > 1) {
    // Pegamos todos os itens da comanda
    const rawItens = data.slice(1).filter(r => String(r[0]) === String(idComanda));
    
    // Mapeamos e AGRUPAMOS para o garçom ver a soma (ex: 3x Cerveja)
    // Se houver observação diferente, mantemos separado para clareza
    let agrupados = {};
    rawItens.forEach(r => {
      let cod = String(r[1]);
      let cat = String(r[8] || '');
      let chave = (cat === 'PAGAMENTO' || cat === 'Venda') ? (cod + Math.random()) : (cod + "_" + (r[7] || ''));
      
      if (!agrupados[chave]) {
        agrupados[chave] = {
          codigo: cod,
          nome: String(r[2]),
          qtd: 0,
          preco: Number(r[4]),
          total: 0,
          categoria: cat,
          obs: String(r[7] || '')
        };
      }
      agrupados[chave].qtd += Number(r[3]);
      agrupados[chave].total += Number(r[5]);
    });
    itens = Object.values(agrupados);
  }

  if (idComanda && itens.length === 0) {
    const shV = getOrCreateSheet(ABA_VENDAS);
    const dataV = shV.getDataRange().getValues();
    if (dataV.length > 1) {
      itens = dataV.filter(r => String(r[2]) === String(idComanda)).map(r => ({
        codigo: String(r[3]), nome: String(r[4]), qtd: Number(r[5]), preco: Number(r[6]), total: Number(r[7]), categoria: 'Venda'
      }));
    }
  }
  
  return itens;
}

function abrirNovaComanda(nome) {
  const sh = getOrCreateSheet(ABA_COMANDAS);
  const id = 'CM' + new Date().getTime();
  sh.appendRow([id, nome, '', new Date(), 'ABERTA', 0, 0, 0, '', 0, 0]);
  return id;
}

function adicionarItemComanda(idComanda, cod, obs) {
  if (!idComanda || !cod) return {sucesso: false, erro: "Dados incompletos"};
  
  const shEst = getOrCreateSheet(ABA_ESTOQUE);
  const estData = shEst.getDataRange().getValues();
  let produto = estData.find(r => String(r[0]) === String(cod));
  if(!produto) return {sucesso: false, erro: "Produto não encontrado"};
  
  const shItens = getOrCreateSheet(ABA_COMANDA_ITENS);
  let cat = String(produto[9] || 'Bebidas');
  
  // SEMPRE adiciona uma nova linha com Qtd 1.
  // Assim, a cozinha recebe pedidos individuais separados.
  shItens.appendRow([
    idComanda, 
    produto[0], 
    produto[1], 
    1, 
    produto[5], 
    produto[5], 
    0, 
    obs || '', 
    cat, 
    'PENDENTE', 
    new Date()
  ]);

  processarBaixaUnica(cod, 1);
  return {sucesso: true};
}
function removerItemComanda(idComanda, cod) {
  if (!idComanda || !cod) return {sucesso: false, erro: "ID ou Código faltando"};
  const shItens = getOrCreateSheet(ABA_COMANDA_ITENS);
  const itensData = shItens.getDataRange().getValues();
  
  // Buscar de trás para frente para evitar problemas com deleteRow se houvesse múltiplos (mesmo que nossa lógica tente mesclar)
  for (let i = itensData.length - 1; i >= 1; i--) {
    if (String(itensData[i][0]) === String(idComanda) && String(itensData[i][1]) === String(cod)) {
      let qtdAtual = Number(itensData[i][3]);
      if (qtdAtual > 1) {
        let novaQtd = qtdAtual - 1;
        shItens.getRange(i + 1, 4).setValue(novaQtd);
        shItens.getRange(i + 1, 6).setValue(novaQtd * Number(itensData[i][4]));
      } else {
        shItens.deleteRow(i + 1);
      }
      processarEstorno(String(cod), 1);
      return {sucesso: true};
    }
  }
  return {sucesso: false, erro: "Item não encontrado na comanda"};
}

/**
 * FINALIZAR VENDA (TOTAL, PARCIAL OU ABATIMENTO)
 */
function finalizarVenda(dados) {
  try {
    const shCom = getOrCreateSheet(ABA_COMANDAS);
    const shVend = getOrCreateSheet(ABA_VENDAS);
    const shItens = getOrCreateSheet(ABA_COMANDA_ITENS);
    const idStr = String(dados.id);
    const isParcial = dados.isParcial === true;
    const isAbatimento = dados.isAbatimento === true;

    // 1. Registrar na ABA VENDAS para o caixa
    if (isAbatimento) {
      // Registrar abate como item positivo no caixa (entrada de dinheiro)
      shVend.appendRow([new Date(), 'ABATIMENTO', idStr, 'PAG_AVULSO', 'Pagamento Parcial (Abatimento)', 1, dados.total, dados.total, 0, dados.total, dados.forma, dados.total, 0]);
      // Adicionar item negativo na comanda para reduzir saldo pendente
      shItens.appendRow([idStr, 'PAGAMENTO', 'Pagamento Parcial: ' + dados.forma, 1, -dados.total, -dados.total, 0, 'Autogerado', 'PAGAMENTO', 'CONCLUIDO', new Date()]);
    } else {
      dados.itens.forEach(it => {
        // Registrar item no histórico de vendas (caixa)
        // Se for um registro de PAGAMENTO anterior, ele entra como negativo para ajustar o saldo deste fechamento
        // Isso garante que o Total do Caixa (Soma de ABA_VENDAS) bata com o dinheiro real recebido hoje.
        shVend.appendRow([new Date(), dados.tipo, idStr, it.codigo, it.nome, it.qtd, it.preco, it.total, 0, it.total, dados.forma, it.pagoItem || it.total, 0]);
        
        if (dados.tipo === "VENDA_DIRETA") processarBaixaUnica(String(it.codigo), Number(it.qtd));
        
        // Se for comanda, remover os produtos reais da lista de itens em aberto
        if (dados.tipo === "COMANDA" && (it.categoria || '').toUpperCase() !== 'PAGAMENTO') {
           removerParcialItem(idStr, it.codigo, it.qtd);
        }
      });
      
      // Limpar os registros de PAGAMENTO da comanda após o fechamento TOTAL
      if (dados.tipo === "COMANDA") {
         const itensRestantes = shItens.getDataRange().getValues();
         for(let i = itensRestantes.length - 1; i >= 1; i--) {
           if (String(itensRestantes[i][0]) === idStr) shItens.deleteRow(i + 1);
         }
      }
    }

    // 2. Se for TOTAL, fechar a comanda
    if (dados.tipo === "COMANDA" && !isParcial && !isAbatimento) {
      const dataCom = shCom.getDataRange().getValues();
      let rowIndex = -1;
      for (let i = 0; i < dataCom.length; i++) {
        if (String(dataCom[i][0]) === idStr) { rowIndex = i + 1; break; }
      }
      if (rowIndex > 0) {
        // Calcular total real de consumo (ignorando registros de pagamento parcial que diminuem o saldo)
        let consumoReal = 0;
        dados.itens.forEach(it => {
          if ((it.categoria || '').toUpperCase() !== 'PAGAMENTO') {
            consumoReal += Number(it.total) || 0;
          }
        });

        // No histórico de comandas, queremos ver o valor TOTAL da conta fechada
        shCom.getRange(rowIndex, 5, 1, 7).setValues([['FECHADA', consumoReal, 0, consumoReal, dados.forma, consumoReal, dados.troco]]);
      }
    } else if (dados.tipo === "VENDA_DIRETA") {
      // Registrar Venda Direta como uma comanda já fechada no histórico
      shCom.appendRow([idStr, "Venda Direta", "Balcão", new Date(), "FECHADA", dados.total, 0, dados.total, dados.forma, dados.total, dados.troco]);
    }

    return { sucesso: true };
  } catch (err) {
    return { sucesso: false, erro: err.toString() };
  }
}

function processarBaixaUnica(cod, qtd) {
  const sh = getOrCreateSheet(ABA_ESTOQUE);
  const data = sh.getDataRange().getValues();
  for(let i=1; i<data.length; i++) {
    if(String(data[i][0]) === String(cod)) {
      let novoEstoque = Number(data[i][6]) - Number(qtd);
      sh.getRange(i+1, 7).setValue(novoEstoque);
      break;
    }
  }
}

function removerParcialItem(idComanda, codigo, qtdPaga) {
  const sh = getOrCreateSheet(ABA_COMANDA_ITENS);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(idComanda) && String(data[i][1]) === String(codigo)) {
      let qtdAtual = Number(data[i][3]);
      if (qtdAtual <= qtdPaga) {
        sh.deleteRow(i + 1);
      } else {
        let novaQtd = qtdAtual - qtdPaga;
        sh.getRange(i+1, 4).setValue(novaQtd);
        sh.getRange(i+1, 6).setValue(novaQtd * Number(data[i][4]));
      }
      return;
    }
  }
}

function processarEstorno(cod, qtd) {
  const sh = getOrCreateSheet(ABA_ESTOQUE);
  const data = sh.getDataRange().getValues();
  for(let i=1; i<data.length; i++) {
    if(String(data[i][0]) === String(cod)) {
      let novoEstoque = Number(data[i][6]) + Number(qtd);
      sh.getRange(i+1, 7).setValue(novoEstoque);
      break;
    }
  }
}

function getDashboardData(inicio, fim) {
  const shVend = getOrCreateSheet(ABA_VENDAS);
  const shEst = getOrCreateSheet(ABA_ESTOQUE);
  
  const data = shVend.getDataRange().getValues();
  const estoque = shEst.getDataRange().getValues().slice(1).map(r => String(r[0])); // Lista de IDs/Códigos válidos
  
  let total = 0, qtd = 0;
  let pagamentos = {};
  let produtos = {}; 
  let categorias = {}; // Para média por categoria
  let diasUnicos = new Set();
  let seriesHoras = {}; // Para o gráfico por hora

  if (data.length > 1) {
    data.slice(1).forEach(r => {
      const cod = String(r[3]);
      const q = Number(r[5]) || 0;
      const t = Number(r[9]) || 0;
      const met = String(r[10]);
      const prodNome = String(r[4]);
      
      // Capturar data (YYYY-MM-DD)
      let dStr = "";
      let hora = 0;
      try {
        let d = new Date(r[0]);
        if (!isNaN(d)) {
          dStr = Utilities.formatDate(d, "GMT-3", "yyyy-MM-dd");
          hora = d.getHours();
          diasUnicos.add(dStr);
        }
      } catch(e){}

      // Filtro de período
      if (inicio && dStr && dStr < inicio) return;
      if (fim && dStr && dStr > fim) return;

      // 1. Métricas financeiras globais (inclui tudo)
      total += t;
      if(met && met !== 'undefined') {
        pagamentos[met] = (pagamentos[met] || 0) + t;
      }

      // 2. Séries temporais (se for período de 1 dia ou hoje, agrupa por hora)
      if (!inicio || inicio === fim) { 
        // Se não tem data ou se é o mesmo dia (ex: filtro de hoje), preenche o gráfico
        seriesHoras[hora] = (seriesHoras[hora] || 0) + t;
      }

      // 3. Métricas de Produtos (Apenas se o código existir no Estoque)
      if(estoque.includes(cod)) {
        qtd += q;
        if(!produtos[prodNome]) produtos[prodNome] = { qtd: 0, total: 0, categoria: 'Bebidas' };
        produtos[prodNome].qtd += q;
        produtos[prodNome].total += t;
      }
    });
  }

  // Mapear categorias do estoque
  const estoqueData = shEst.getDataRange().getValues();
  let mapaCategorias = {};
  estoqueData.slice(1).forEach(row => {
    mapaCategorias[String(row[1])] = String(row[9] || 'Bebidas'); // Nome -> Categoria
  });

  // Recalcular produtos com categoria correta e preencher categorias
  Object.keys(produtos).forEach(nome => {
    let cat = mapaCategorias[nome] || 'Bebidas';
    produtos[nome].categoria = cat;
    if(!categorias[cat]) categorias[cat] = { qtd: 0, total: 0 };
    categorias[cat].qtd += produtos[nome].qtd;
    categorias[cat].total += produtos[nome].total;
  });

  const numDias = diasUnicos.size || 1;

  // Converter produtos em array e calcular médias - LISTA COMPLETA com categoria
  let todosProdutos = Object.keys(produtos).map(nome => ({
    nome: nome,
    categoria: produtos[nome].categoria,
    qtd: produtos[nome].qtd,
    total: produtos[nome].total,
    mediaDiaria: produtos[nome].qtd / numDias
  })).sort((a, b) => b.qtd - a.qtd);

  let ranking = todosProdutos.slice(0, 5);

  let rankingCategorias = Object.keys(categorias).map(cat => ({
    nome: cat,
    qtd: categorias[cat].qtd,
    total: categorias[cat].total,
    mediaDiaria: categorias[cat].qtd / numDias
  })).sort((a, b) => b.qtd - a.qtd);

  return {
    totalVendido: total,
    qtdVendida: qtd,
    criticos: listarEstoque().filter(p => p.critico).length,
    numDiasPercorridos: numDias,
    metodos: pagamentos,
    ranking: ranking,
    todosProdutos: todosProdutos,
    rankingCategorias: rankingCategorias,
    seriesHoras: seriesHoras
  };
}

/**
 * FUNÇÕES PARA A TELA DA COZINHA
 */
function listarPedidosCozinha() {
  try {
    const shItens = getOrCreateSheet(ABA_COMANDA_ITENS);
    const shCom = getOrCreateSheet(ABA_COMANDAS);
    const itensData = shItens.getDataRange().getValues();
    const comData = shCom.getDataRange().getValues();
    
    if (itensData.length < 2) return [];
    
    // Criar um mapa de ID Comanda -> Nome da Mesa
    let mesaMap = {};
    comData.slice(1).forEach(r => mesaMap[String(r[0])] = r[1]);
    
    const agora = new Date();
    const hojeStr = Utilities.formatDate(agora, "GMT-3", "yyyy-MM-dd");
    
    let resultado = [];
    
    // Iterar para capturar o rowIndex real da planilha
    for (let i = 1; i < itensData.length; i++) {
       let r = itensData[i];
       let cat = String(r[8] || '').toLowerCase().trim();
       let status = String(r[9] || '').toUpperCase().trim();
       let dataPed = "";
       try { 
         if (r[10] instanceof Date) {
           dataPed = Utilities.formatDate(r[10], "GMT-3", "yyyy-MM-dd");
         }
       } catch(e) {}
       
       // FILTRO DE COZINHA: Expandido para aceitar quase qualquer termo de comida/preparo
       let listaCozinha = ['refeições', 'refeicao', 'petiscos', 'petisco', 'cozinha', 'comida', 'lanche', 'porção', 'porcao', 'pizza', 'massa', 'sobremesa', 'hamburguer', 'espetinho', 'caldo', 'porções', 'sucos', 'suco', 'batida', 'caipirinha', 'drinks', 'drink', 'bebibas preparadas'];
       let isCozinha = listaCozinha.some(termo => cat.includes(termo));
       
       // Fallback: se a categoria for "Bebidas" ou "Cervejas", NÃO vai para a cozinha, 
       // a menos que o nome do produto contenha palavras de preparo (opcional).
       
       let showPendente = (status === 'PENDENTE');
       let showProntoHoje = (status === 'PRONTO' && dataPed === hojeStr);

       if (isCozinha && (showPendente || showProntoHoje)) {
         resultado.push({
           rowIndex: i + 1, // i é 0-indexed do array, +1 para 1-indexed do sheet
           idComanda: String(r[0]),
           mesa: mesaMap[String(r[0])] || '?',
           codigo: String(r[1]),
           nome: String(r[2]),
           qtd: Number(r[3]),
           obs: String(r[7] || ''),
           status: status,
           timestamp: r[10] instanceof Date ? r[10].getTime() : agora.getTime()
         });
       }
    }
    
    return resultado.sort((a, b) => {
      if (a.status === 'PENDENTE' && b.status !== 'PENDENTE') return -1;
      if (a.status !== 'PENDENTE' && b.status === 'PENDENTE') return 1;
      return a.timestamp - b.timestamp;
    });

  } catch (err) {
    console.error("Erro em listarPedidosCozinha: " + err.stack);
    throw new Error("Falha ao carregar pedidos da cozinha. Detalhe: " + err.message);
  }
}

function getNotificacoesCozinha() {
  const shItens = getOrCreateSheet(ABA_COMANDA_ITENS);
  const shCom = getOrCreateSheet(ABA_COMANDAS);
  const itensData = shItens.getDataRange().getValues();
  const comData = shCom.getDataRange().getValues();
  
  if (itensData.length < 2) return [];
  
  let mesaMap = {};
  comData.slice(1).forEach(r => mesaMap[String(r[0])] = r[1]);
  
  const agora = new Date().getTime();
  const limite = agora - 60000; // Último 1 minuto
  
  return itensData.slice(1)
    .filter(r => {
      let status = String(r[9] || '').toUpperCase().trim();
      let ts = r[10] instanceof Date ? r[10].getTime() : 0;
      return status === 'PRONTO' && ts > limite;
    })
    .map(r => ({
      idComanda: String(r[0]),
      mesa: mesaMap[String(r[0])] || '?',
      nome: String(r[2]),
      qtd: Number(r[3])
    }));
}

function marcarPedidoPronto(rowIndex) {
  const sh = getOrCreateSheet(ABA_COMANDA_ITENS);
  // Validamos se o rowIndex é válido e se a linha corresponde ao esperado
  if (rowIndex > 1) {
    sh.getRange(rowIndex, 10).setValue('PRONTO');
    sh.getRange(rowIndex, 11).setValue(new Date()); 
    return { sucesso: true };
  }
  return { sucesso: false, erro: "Item não encontrado ou índice inválido" };
}


function alterarNomeMesa(idComanda, novoNome) {
  if (!idComanda || !novoNome) return { sucesso: false, erro: "Dados incompletos" };
  const sh = getOrCreateSheet(ABA_COMANDAS);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    // Usamos trim() e String() para garantir a comparação
    if (String(data[i][0]).trim() === String(idComanda).trim()) {
      sh.getRange(i + 1, 2).setValue(novoNome);
      return { sucesso: true };
    }
  }
  return { sucesso: false, erro: "Comanda ID " + idComanda + " não encontrada" };
}

function getScriptUrl() {
  return ScriptApp.getService().getUrl();
}

