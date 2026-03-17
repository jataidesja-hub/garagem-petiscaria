// CONFIGURAÃ‡ÃƒO VERCEL -> GOOGLE
        // COLE SEU LINK DO GOOGLE SCRIPT AQUI PARA FUNCIONAR NA VERCEL:
        const URL_GAS = "https://script.google.com/macros/s/AKfycbyk58Cyx04GHujrrEFN8OP_n6VUVnWCR0URrWKtx5IZcLaEsqIk_VpPkvbxKZSbuZ0c/exec"; // EX: https://script.google.com/macros/s/.../exec

        // POLYFILL GOOGLE SCRIPT RUN (Para funcionamento na Vercel)
        (function () {
            if (typeof google === 'undefined') window.google = {};
            if (typeof google.script === 'undefined') google.script = {};
            function createRunner(handlers) {
                return new Proxy({}, {
                    get: function (target, prop) {
                        if (prop === 'withSuccessHandler') return (cb) => createRunner({ ...handlers, success: cb });
                        if (prop === 'withFailureHandler') return (eb) => createRunner({ ...handlers, failure: eb });
                        return function (...args) {
                            fetch(URL_GAS, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ function: prop, args: args }), redirect: 'follow' })
                                .then(r => r.json()).then(res => {
                                    if (res && res.sucesso === false && handlers.failure) handlers.failure({ message: res.erro || "Erro no servidor" });
                                    else if (handlers.success) handlers.success(res);
                                }).catch(err => { if (handlers.failure) handlers.failure(err); });
                        };
                    }
                });
            }
            google.script.run = createRunner({ success: null, failure: null });
        })();

        let estoqueCache = [], carrinhoVD = [], editingCode = null;

        function mostrarCarregando(t) {
            document.getElementById('loader').style.display = 'flex';
            document.getElementById('loader-text').innerText = t;
        }
        function esconderCarregando() { document.getElementById('loader').style.display = 'none'; }

        function showToast(message, type = 'info', duration = 3000) {
            const toastContainer = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.textContent = message;
            toast.style.setProperty('--delay', `${duration / 1000}s`); // Set CSS variable for animation delay

            toastContainer.appendChild(toast);

            // Remove toast after animation
            setTimeout(() => {
                toast.remove();
            }, duration + 500); // 500ms for fadeOut animation
        }

        function switchTab(id, el) {
            document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.getElementById(id).style.display = 'block';
            el.classList.add('active');
            if (id === 'tab-dash') carregarDash();
            if (id === 'tab-estoque') carregarEstoque();
        }

        let notificacoesVistas = new Set();
        function checarNotificacoes() {
            google.script.run.withSuccessHandler(lista => {
                if (!Array.isArray(lista)) return;
                lista.forEach(n => {
                    let chave = n.idComanda + n.nome + n.qtd;
                    if (!notificacoesVistas.has(chave)) {
                        showToast(`ðŸ³ PRONTO: ${n.nome} (${n.qtd}x) - Mesa: ${n.mesa}`, "ready", 30000);
                        notificacoesVistas.add(chave);
                    }
                });
            }).getNotificacoesCozinha();
        }

        // Iniciar polling de notificaÃ§Ãµes a cada 10 segundos e Dashboard a cada 30 segundos
        setInterval(checarNotificacoes, 10000);
        setInterval(() => {
            if (document.getElementById('tab-dash').style.display !== 'none') {
                carregarDash();
            }
        }, 30000);

        function carregarDash() {
            const inicio = document.getElementById('dash-inicio').value;
            const fim = document.getElementById('dash-fim').value;
            const hInicio = document.getElementById('dash-h-inicio').value || '00:00';
            const hFim = document.getElementById('dash-h-fim').value || '23:59';

            google.script.run.withSuccessHandler(lista => {
                let html = "";
                if (Array.isArray(lista)) {
                    lista.forEach(c => {
                        // O servidor jÃ¡ filtra por data e hora em listarTodasComandas, 
                        // mas mantemos uma validaÃ§Ã£o extra se necessÃ¡rio ou apenas renderizamos.
                        const borderStyle = c.isAntiga && c.status === 'ABERTA' ? 'border: 2px solid #ff9800; animation: pulse-warn 2s infinite;' : '';
                        const alertIcon = c.isAntiga && c.status === 'ABERTA' ? '<i class="fas fa-clock" style="color:#ff9800; margin-right:5px;"></i>' : '';

                        html += `
                            <div class="comanda-item" style="${borderStyle}" onclick="visualizar('${c.id}', '${c.nome}')">
                                <span class="status-badge" style="background:${c.status === 'ABERTA' ? 'rgba(0,230,118,0.2)' : 'rgba(255,255,255,0.1)'}; color:${c.status === 'ABERTA' ? 'var(--success)' : 'var(--text-muted)'}">${c.status}</span>
                                <b>${alertIcon}${c.nome}</b>
                                ${c.cliente && c.cliente !== 'BalcÃ£o' ? `<br><small style="color:var(--primary); font-size:0.7rem">ðŸ‘¤ ${c.cliente}</small>` : ''}<br>
                                <span style="color:${c.status === 'ABERTA' ? 'var(--success)' : 'var(--text)'}; font-weight:700">R$ ${(c.total || 0).toFixed(2)}</span>
                                <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 5px;">${c.dataExibicao}</div>
                            </div>`;
                    });
                }
                document.getElementById('lista-comandas-hist').innerHTML = (Array.isArray(lista) ? html : '') || 'Sem dados.';
            }).listarTodasComandas(inicio, fim, hInicio, hFim);

            google.script.run.withSuccessHandler(d => {
                if (!d) return;
                document.getElementById('d-total').innerText = 'R$ ' + (d.totalVendido || 0).toFixed(2);
                document.getElementById('d-qtd').innerText = d.qtdVendida || 0;
                document.getElementById('d-criticos').innerText = d.criticos || 0;

                // Renderizar Ranking com MÃ©dia DiÃ¡ria
                document.getElementById('d-ranking').innerHTML = `
                    <thead>
                        <tr>
                            <th style="font-size:0.7rem">PRODUTO</th>
                            <th style="font-size:0.7rem; text-align:center"> TOTAL</th>
                            <th style="font-size:0.7rem; text-align:right">MÃ‰DIA/DIA</th>
                        </tr>
                    </thead>
                    <tbody>
                    ${(d.ranking || []).map(p => `
                        <tr>
                            <td style="padding: 10px 5px;"><b>${p.nome}</b></td>
                            <td align="center">${p.qtd}x</td>
                            <td align="right"><b>${(p.mediaDiaria || 0).toFixed(1)}/dia</b></td>
                        </tr>
                    `).join('')}
                    </tbody>` || '<tr><td colspan="3" align="center">Nenhuma venda de produto registrada.</td></tr>';

                // Renderizar Ranking de Produtos Agrupados por Categoria
                let groupedHtml = "";
                let todosProds = d.todosProdutos || [];
                let cats = [...new Set(todosProds.map(p => p.categoria))].sort();

                if (d.todosProdutos.length === 0) {
                    groupedHtml = '<p style="text-align:center; color:var(--text-muted)">Nenhuma venda registrada.</p>';
                } else {
                    cats.forEach(cat => {
                        let prods = todosProds.filter(p => p.categoria === cat);
                        groupedHtml += `
                            <div style="margin-bottom: 20px;">
                                <h4 style="color:var(--accent); border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:5px; margin-bottom:10px;">${cat}</h4>
                                <table style="width:100%">
                                    <thead>
                                        <tr>
                                            <th style="font-size:0.6rem; text-align:left">PRODUTO</th>
                                            <th style="font-size:0.6rem; text-align:center">TOTAL</th>
                                            <th style="font-size:0.6rem; text-align:right">MÃ‰DIA</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${prods.map(p => `
                                            <tr>
                                                <td style="font-size:0.85rem"><b>${p.nome}</b></td>
                                                <td align="center" style="font-size:0.85rem">${p.qtd}x</td>
                                                <td align="right" style="font-size:0.85rem"><b>${(p.mediaDiaria || 0).toFixed(1)}/dia</b></td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>`;
                    });
                }
                document.getElementById('d-ranking-cat').innerHTML = groupedHtml;

                // Renderizar Pagamentos
                let pagHtml = "";
                for (let m in d.metodos) {
                    pagHtml += `
                        <div style="display:flex; justify-content:space-between; padding:10px; background:rgba(255,255,255,0.03); border-radius:10px;">
                            <span>${m}</span>
                            <b>R$ ${d.metodos[m].toFixed(2)}</b>
                        </div>`;
                }
                document.getElementById('d-pagamentos').innerHTML = pagHtml || 'Nenhum pagamento.';

                // Renderizar Fiados
                if (d.fiados && d.fiados.length > 0) {
                    document.getElementById('card-fiados').style.display = 'block';
                    document.getElementById('fiados-count').innerText = d.fiados.length;
                    document.getElementById('lista-fiados').innerHTML = d.fiados.map(f => `
                        <tr>
                            <td>${f.data}</td>
                            <td><b>${f.cliente}</b></td>
                            <td><small>${f.mesa}</small></td>
                            <td align="right"><b>R$ ${f.valor.toFixed(2)}</b></td>
                            <td align="center"><span style="color:${f.dias > 30 ? 'var(--accent)' : 'var(--warning)'}">${f.dias} dias</span></td>
                            <td align="right">
                                <button class="btn btn-outline" style="padding: 4px 8px; font-size: 0.7rem;" onclick="visualizar('${f.id}', '${f.cliente}')">ðŸ”Ž Ver</button>
                                <button class="btn btn-primary" style="padding: 4px 8px; font-size: 0.7rem; margin-left:5px" onclick="abrirPagamentoFiado('${f.id}', '${f.cliente}', ${f.valor})">ðŸ’° Pagar</button>
                            </td>
                        </tr>
                    `).join('');
                } else {
                    document.getElementById('card-fiados').style.display = 'none';
                }
            }).getDashboardData(inicio, fim, hInicio, hFim);
        }

        function abrirPagamentoFiado(id, cliente, total) {
            // Reaproveita a lÃ³gica de visualizaÃ§Ã£o para mostrar o que o cliente deve antes de pagar?
            // Para simplificar agora, apenas abre a interface de pagamento para essa comanda
            visualizar(id, cliente);
        }

        function carregarEstoque() {
            google.script.run.withSuccessHandler(data => {
                estoqueCache = data;
                let html = `<table>
                    <thead>
                        <tr>
                            <th></th>
                            <th>Produto</th>
                            <th>Categoria</th>
                            <th>PreÃ§o</th>
                            <th>Estoque</th>
                            <th>AÃ§Ãµes</th>
                        </tr>
                    </thead>
                    <tbody>`;

                if (Array.isArray(data)) {
                    data.forEach(p => {
                        html += `
                        <tr>
                            <td><img src="${p.imagem}" class="img-estoque"></td>
                            <td><b>${p.nome}</b><br><small>${p.codigo}</small></td>
                            <td><small>${p.categoria}</small></td>
                            <td>R$ ${p.preco.toFixed(2)}</td>
                            <td style="color:${p.critico ? 'var(--primary)' : 'inherit'}">${p.estoque} ${p.critico ? 'âš ï¸' : ''}</td>
                            <td><button class="btn btn-outline" style="padding: 0.5rem 1rem;" onclick="abrirEdicao('${p.codigo}')">Editar</button></td>
                        </tr>`;
                    });
                }
                document.getElementById('lista-estoque').innerHTML = html + '</tbody></table>';
            }).listarEstoque();
        }

        function abrirNovoProduto() {
            editingCode = null;
            document.getElementById('edit-title').innerText = "ðŸ†• Novo Produto";
            document.getElementById('label-estoque').innerText = "Estoque Inicial";
            document.getElementById('edit-nome').value = "";
            document.getElementById('edit-preco').value = "";
            document.getElementById('edit-estoque').value = "";
            document.getElementById('edit-minimo').value = "";
            document.getElementById('edit-codigo').value = "";
            document.getElementById('edit-img').value = "";
            document.getElementById('modalEdit').style.display = 'flex';
        }

        function abrirEdicao(cod) {
            let p = estoqueCache.find(x => x.codigo === cod);
            editingCode = cod;
            document.getElementById('edit-title').innerText = "ðŸ“ Editar Produto";
            document.getElementById('label-estoque').innerText = "Adicionar ao Estoque";
            document.getElementById('edit-nome').value = p.nome;
            document.getElementById('edit-categoria').value = p.categoria || "Bebida";
            document.getElementById('edit-preco').value = p.preco;
            document.getElementById('edit-estoque').value = 0;
            document.getElementById('edit-minimo').value = p.minimo;
            document.getElementById('edit-codigo').value = p.codigo;
            document.getElementById('edit-img').value = p.imagem;
            document.getElementById('modalEdit').style.display = 'flex';
        }

        function salvarEdicao() {
            let p = {
                codigo: document.getElementById('edit-codigo').value || null,
                nome: document.getElementById('edit-nome').value,
                categoria: document.getElementById('edit-categoria').value,
                preco: parseFloat(document.getElementById('edit-preco').value),
                estoque: parseFloat(document.getElementById('edit-estoque').value),
                minimo: parseFloat(document.getElementById('edit-minimo').value),
                imagem: document.getElementById('edit-img').value
            };
            if (!p.nome || isNaN(p.preco)) {
                alert("Preencha Nome e PreÃ§o!");
                return;
            }

            mostrarCarregando("Salvando...");
            const func = editingCode ? 'salvarEdicaoProduto' : 'adicionarProduto';
            google.script.run.withSuccessHandler(() => {
                esconderCarregando(); fecharModais(); carregarEstoque();
            })[func](p);
        }

        function visualizar(id, nome) {
            document.getElementById('v-nome').innerText = nome;
            // Limpar dados anteriores para evitar que apareÃ§am antes da nova carga
            document.getElementById('v-itens').innerHTML = '<tr><td colspan="3" align="center">Carregando...</td></tr>';
            document.getElementById('v-total').innerText = 'Total: R$ 0,00';

            google.script.run.withSuccessHandler(itens => {
                let t = 0;
                let produtos = itens.filter(i => {
                    let cat = (i.category || i.categoria || i.cat || '').toUpperCase();
                    let nome = (i.nome || '').toUpperCase();
                    return cat !== 'PAGAMENTO' && !nome.includes('PAGAMENTO PARCIAL') && i.codigo !== 'PAG_AVULSO' && i.total > 0;
                });
                let pagamentos = itens.filter(i => {
                    let cat = (i.category || i.categoria || i.cat || '').toUpperCase();
                    let nome = (i.nome || '').toUpperCase();
                    return (cat === 'PAGAMENTO' || nome.includes('PAGAMENTO PARCIAL') || i.codigo === 'PAG_AVULSO') && i.total != 0;
                });

                let html = produtos.map(i => {
                    t += i.total;
                    return `<tr><td>${i.nome}</td><td>${i.qtd}x</td><td align="right">R$ ${i.total.toFixed(2)}</td></tr>`;
                }).join('');

                if (pagamentos.length > 0) {
                    html += `<tr><td colspan="3" style="padding-top:10px; border-bottom:1px solid #000; font-weight:bold; font-size:10px;">PAGAMENTOS REALIZADOS:</td></tr>`;
                    let pgsVistos = new Set();
                    pagamentos.forEach(p => {
                        let v = Math.abs(p.total);
                        let chave = p.nome + "_" + v.toFixed(2);
                        if (!pgsVistos.has(chave)) {
                            t += p.total;
                            html += `<tr style="color:#28a745"><td>${p.nome}</td><td></td><td align="right">R$ -${v.toFixed(2)}</td></tr>`;
                            pgsVistos.add(chave);
                        }
                    });
                }

                document.getElementById('v-itens').innerHTML = html || '<tr><td colspan="3" align="center">Vazio</td></tr>';
                document.getElementById('v-total').innerText = 'Saldo Pendente: R$ ' + t.toFixed(2);
                document.getElementById('modalVisualizar').style.display = 'flex';
            }).buscarItensComanda(id);
        }

        function buscarVD(v) {
            let f = v ? estoqueCache.filter(p => p.nome.toLowerCase().includes(v.toLowerCase())) : estoqueCache;
            document.getElementById('vd-drop').innerHTML = f.map(p => `
                <div style="padding:15px; cursor:pointer; border-bottom:1px solid var(--glass); display:flex; gap:10px; align-items:center;" onclick="addVD('${p.codigo}')">
                    <img src="${p.imagem}" style="width:40px; height:40px; border-radius:8px; object-fit:cover;">
                    <div><b>${p.nome}</b><br><small style="color:var(--primary)">R$ ${p.preco.toFixed(2)}</small></div>
                </div>
            `).join('');
            document.getElementById('vd-drop').style.display = 'block';
        }

        function addVD(cod) {
            let p = estoqueCache.find(x => x.codigo === cod);
            let item = carrinhoVD.find(x => x.codigo === cod);
            if (item) item.qtd++; else carrinhoVD.push({ ...p, qtd: 1 });
            renderVD(); document.getElementById('vd-drop').style.display = 'none';
            document.getElementById('vd-busca').value = '';
        }

        function renderVD() {
            let t = 0;
            document.querySelector('#vd-carrinho tbody').innerHTML = carrinhoVD.map(i => {
                t += (i.preco * i.qtd);
                return `<tr>
                    <td><b>${i.nome}</b></td>
                    <td style="white-space:nowrap">
                        <button class="btn btn-outline" style="padding: 2px 10px; font-size: 0.8rem; min-width: 30px;" onclick="updateVD('${i.codigo}', -1)">-</button>
                        <span style="display: inline-block; width: 30px; text-align: center; font-weight: 700;">${i.qtd}</span>
                        <button class="btn btn-outline" style="padding: 2px 10px; font-size: 0.8rem; min-width: 30px;" onclick="updateVD('${i.codigo}', 1)">+</button>
                    </td>
                    <td align="right">R$ ${(i.preco * i.qtd).toFixed(2)}</td>
                </tr>`;
            }).join('');

            // Adicionar taxa de entrega se marcado
            if (document.getElementById('vd-entrega').checked) {
                let taxaEntrega = parseFloat(document.getElementById('vd-taxa-entrega').value) || 0;
                t += taxaEntrega;
            }

            document.getElementById('vd-total').innerText = 'R$ ' + t.toFixed(2);
        }

        function updateVD(cod, delta) {
            let item = carrinhoVD.find(x => x.codigo === cod);
            if (!item) return;
            item.qtd += delta;
            if (item.qtd <= 0) {
                carrinhoVD = carrinhoVD.filter(x => x.codigo !== cod);
            }
            renderVD();
        }

        function finalizarVD() {
            if (carrinhoVD.length === 0) return;
            let m = document.getElementById('vd-pagamento').value;
            let clie = document.getElementById('vd-cliente').value;
            if (m === 'Fiado' && !clie) { showToast("Informe o nome do cliente para Fiado!", "error"); return; }
            if (!confirm(`Confirmar venda no ${m}?`)) return;

            mostrarCarregando("Finalizando...");
            let t = parseFloat(document.getElementById('vd-total').innerText.replace('R$ ', ''));

            // Preparar itens do carrinho
            let itensVenda = carrinhoVD.map(it => ({
                codigo: it.codigo,
                nome: it.nome,
                qtd: it.qtd,
                preco: it.preco,
                total: it.preco * it.qtd
            }));

            // Adicionar taxa de entrega como item se marcado
            if (document.getElementById('vd-entrega').checked) {
                let taxaEntrega = parseFloat(document.getElementById('vd-taxa-entrega').value) || 0;
                if (taxaEntrega > 0) {
                    itensVenda.push({
                        codigo: 'TAXA_ENTREGA',
                        nome: 'Taxa de Entrega',
                        qtd: 1,
                        preco: taxaEntrega,
                        total: taxaEntrega
                    });
                }
            }

            let dados = {
                id: 'VD' + new Date().getTime(),
                tipo: 'VENDA_DIRETA',
                total: t,
                forma: m,
                cliente: clie,
                pago: t,
                troco: 0,
                itens: itensVenda
            };

            google.script.run.withSuccessHandler(() => {
                esconderCarregando();
                carrinhoVD = [];
                document.getElementById('vd-cliente').value = '';
                document.getElementById('vd-entrega').checked = false;
                document.getElementById('vd-taxa-entrega').value = '0.00';
                document.getElementById('vd-taxa-entrega-cont').style.display = 'none';
                toggleVdCliente();
                renderVD();
                carregarDash();
                carregarVDSerecente();
                showToast("Venda Direta realizada com sucesso!", "success");

                // Abrir recibo para impressÃ£o imediata
                visualizarVD(dados.id, 'Venda Direta');
            }).finalizarVenda(dados);
        }

        function carregarVDSerecente() {
            google.script.run.withSuccessHandler(lista => {
                if (!Array.isArray(lista)) {
                    document.getElementById('lista-vd-hist').innerHTML = 'Nenhuma venda recente.';
                    return;
                }
                let html = "";
                // Somente VENDAS DIRETAS (ID comeÃ§a com VD)
                lista.filter(c => c.id && String(c.id).startsWith('VD')).slice(0, 10).forEach(v => {
                    html += `
                        <div class="comanda-item" onclick="visualizarVD('${v.id}', 'Venda Direta')">
                            <span class="status-badge" style="background:rgba(212,175,55,0.1); color:var(--primary)">DIRETA</span>
                            <b>${v.id}</b><br>
                            <span style="font-weight:700">R$ ${v.total.toFixed(2)}</span>
                            <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 5px;">${v.dataExibicao}</div>
                        </div>`;
                });
                document.getElementById('lista-vd-hist').innerHTML = html || 'Sem vendas recentes.';
            }).listarTodasComandas();
        }

        function visualizarVD(id, nome) {
            document.getElementById('v-nome').innerText = nome + " #" + id;
            document.getElementById('v-itens').innerHTML = '<tr><td colspan="3" align="center">Carregando...</td></tr>';
            document.getElementById('v-total').innerText = 'Total: R$ 0,00';

            google.script.run.withSuccessHandler(itens => {
                let t = 0;
                // Filtrar itens: pegamos produtos e taxas. 
                // Se for entrega, vamos ignorar o "Pagamento Final" no visual do cupom para o cliente pagar na porta.
                let produtosETaxas = itens.filter(i => {
                    let cat = (i.category || i.categoria || i.cat || '').toUpperCase();
                    let nomeItem = (i.nome || '').toUpperCase();
                    // Se for Entrega (tem item TAXA_ENTREGA), filtramos os pagamentos negativos
                    return cat !== 'PAGAMENTO' && !nomeItem.includes('PAGAMENTO FINAL');
                });

                document.getElementById('v-itens').innerHTML = produtosETaxas.map(i => {
                    t += i.total;
                    return `<tr><td>${i.nome}</td><td>${i.qtd}x</td><td align="right">R$ ${i.total.toFixed(2)}</td></tr>`;
                }).join('');

                document.getElementById('v-total').innerText = 'Total a Pagar: R$ ' + t.toFixed(2);
                document.getElementById('modalVisualizar').style.display = 'flex';
            }).buscarItensComanda(id);
        }

        function restaurarSistema() { if (confirm("CUIDADO: Isso limpa tudo. Continuar?")) google.script.run.withSuccessHandler(() => location.reload()).criarEstrutura(); }
        function limparFiltro() {
            document.getElementById('dash-inicio').value = '';
            document.getElementById('dash-fim').value = '';
            document.getElementById('dash-h-inicio').value = '00:00';
            document.getElementById('dash-h-fim').value = '23:59';
            carregarDash();
        }

        function setFiltroHoje() {
            const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bahia' });
            document.getElementById('dash-inicio').value = hoje;
            document.getElementById('dash-fim').value = hoje;
            document.getElementById('dash-h-inicio').value = '00:00';
            document.getElementById('dash-h-fim').value = '23:59';
            carregarDash();
        }

        function setFiltroMes() {
            const d = new Date();
            const inicio = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
            const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bahia' });
            document.getElementById('dash-inicio').value = inicio;
            document.getElementById('dash-fim').value = hoje;
            document.getElementById('dash-h-inicio').value = '00:00';
            document.getElementById('dash-h-fim').value = '23:59';
            carregarDash();
        }

        function toggleComandas() {
            const container = document.getElementById('container-comandas-hist');
            const txt = document.getElementById('txt-toggle');
            const icon = document.getElementById('icon-toggle');
            if (container.style.display === 'none') {
                container.style.display = 'block';
                txt.innerText = 'Recolher';
                icon.className = 'fas fa-chevron-up';
            } else {
                container.style.display = 'none';
                txt.innerText = 'Expandir';
                icon.className = 'fas fa-chevron-down';
            }
        }
        function fecharModais() { document.querySelectorAll('.overlay').forEach(m => m.style.display = 'none'); }

        function carregarTudo() {
            // Setar data de hoje por padrÃ£o nos filtros (Salvador/BA)
            const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bahia' });
            document.getElementById('dash-inicio').value = hoje;
            document.getElementById('dash-fim').value = hoje;
            document.getElementById('dash-h-inicio').value = '00:00';
            document.getElementById('dash-h-fim').value = '23:59';

            carregarDash();
            carregarEstoque();
            carregarVDSerecente();
            checarNotificacoes();
        }



        // Controle de NavegaÃ§Ã£o do Portal
        function irParaModulo(p) {
            // Se estiver na Vercel, as pÃ¡ginas estÃ£o na mesma pasta
            if (window.location.hostname !== 'script.google.com') {
                window.location.href = '../' + p + '/index.html';
            } else {
                // Se estiver no Google, usa o parÃ¢metro page
                google.script.run.withSuccessHandler(url => {
                    window.top.location.href = url + "?page=" + p;
                }).getScriptUrl();
            }
        }

        function irParaLogin() {
            document.getElementById('view-portal').style.display = 'none';
            document.getElementById('login-overlay').style.display = 'flex';
            document.getElementById('login-pass').focus();
        }

        function voltarAoPortal() {
            sessionStorage.removeItem('auth_admin');
            document.getElementById('view-admin').style.display = 'none';
            document.getElementById('login-overlay').style.display = 'none';
            document.getElementById('view-portal').style.display = 'flex';
        }

        function tentarLogin() {
            const pass = document.getElementById('login-pass').value;
            const btn = document.querySelector('.login-box button');
            const err = document.getElementById('login-err');

            if (!pass) return;

            // Verificar se o ambiente do Google estÃ¡ disponÃ­vel
            if (typeof google === 'undefined' || !google.script) {
                alert("AVISO: O sistema nÃ£o detectou o ambiente do Google Apps Script. Se vocÃª estÃ¡ testando localmente ou na Vercel, a senha nÃ£o poderÃ¡ ser validada. Use o link oficial do Google Script (ExecuÃ§Ã£o).");
                btn.innerHTML = 'ENTRAR';
                btn.disabled = false;
                return;
            }

            btn.innerHTML = 'VALIDANDO...';
            btn.disabled = true;
            err.style.display = 'none';

            google.script.run
                .withSuccessHandler(res => {
                    if (res.sucesso) {
                        sessionStorage.setItem('auth_admin', 'true');
                        document.getElementById('login-overlay').style.display = 'none';
                        document.getElementById('view-admin').style.display = 'block';
                        carregarTudo();
                    } else {
                        btn.innerHTML = 'ENTRAR';
                        btn.disabled = false;
                        err.style.display = 'block';
                        document.getElementById('login-pass').value = '';
                    }
                })
                .withFailureHandler(e => {
                    btn.innerHTML = 'ENTRAR';
                    btn.disabled = false;
                    alert("Erro no servidor: " + e.message);
                })
                .verificarSenha(pass, 'admin');
        }

        window.onload = () => {
            if (sessionStorage.getItem('auth_admin') === 'true') {
                document.getElementById('view-portal').style.display = 'none';
                document.getElementById('view-admin').style.display = 'block';
                carregarTudo();
            } else {
                document.getElementById('view-portal').style.display = 'flex';
            }

            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('<?= ScriptApp.getService().getUrl() ?>?page=sw')
                    .then(reg => console.log('SW registrado', reg))
                    .catch(err => console.log('Erro SW', err));
            }

            // PWA Install Prompt
            let deferredPrompt;
            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault();
                deferredPrompt = e;
                // Mostrar o botÃ£o de instalaÃ§Ã£o
                document.getElementById('install-button').style.display = 'block';
            });

            document.getElementById('install-button').addEventListener('click', async () => {
                if (!deferredPrompt) {
                    return;
                }
                // Mostrar o prompt de instalaÃ§Ã£o
                deferredPrompt.prompt();
                // Aguardar a escolha do usuÃ¡rio
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`User response to the install prompt: ${outcome}`);
                // Limpar o prompt
                deferredPrompt = null;
                // Esconder o botÃ£o apÃ³s a instalaÃ§Ã£o
                document.getElementById('install-button').style.display = 'none';
            });

            // Esconder o botÃ£o se o app jÃ¡ estiver instalado
            window.addEventListener('appinstalled', () => {
                console.log('PWA foi instalado');
                document.getElementById('install-button').style.display = 'none';
            });
        };
        function toggleVdCliente() {
            const m = document.getElementById('vd-pagamento').value;
            document.getElementById('vd-cliente-cont').style.display = m === 'Fiado' ? 'block' : 'none';
        }

        function toggleVdEntrega() {
            const isEntrega = document.getElementById('vd-entrega').checked;
            document.getElementById('vd-taxa-entrega-cont').style.display = isEntrega ? 'block' : 'none';
            if (!isEntrega) {
                document.getElementById('vd-taxa-entrega').value = '0.00';
            }
            renderVD();
        }

        function atualizarTotalVD() {
            renderVD();
        }


