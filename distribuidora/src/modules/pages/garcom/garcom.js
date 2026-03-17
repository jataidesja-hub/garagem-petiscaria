// CONFIGURAÃ‡ÃƒO VERCEL -> GOOGLE
        const URL_GAS = "https://script.google.com/macros/s/AKfycbyk58Cyx04GHujrrEFN8OP_n6VUVnWCR0URrWKtx5IZcLaEsqIk_VpPkvbxKZSbuZ0c/exec";

        // POLYFILL GOOGLE SCRIPT RUN
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

        let idAtivo = null, totalAtual = 0, consumoTotal = 0, estoqueCache = [], itensSessao = [];
        let modoPagamento = 'TOTAL';
        let statusTabAtiva = 'ABERTA';

        function voltarAoPortal() {
            if (window.location.hostname !== 'script.google.com') {
                window.location.href = "index.html";
            } else {
                google.script.run.withSuccessHandler(url => {
                    window.top.location.href = url;
                }).getScriptUrl();
            }
        }

        window.onload = function () {
            iniciarApp();

            // Solicitar permissÃ£o para notificaÃ§Ãµes do sistema
            if ("Notification" in window) {
                if (Notification.permission !== "granted" && Notification.permission !== "denied") {
                    Notification.requestPermission();
                }
            }

            // SincronizaÃ§Ã£o automÃ¡tica a cada 10 segundos
            setInterval(() => {
                verificarNotificacoes();
                if (document.getElementById('modalPagamento').style.display !== 'flex' &&
                    document.getElementById('modalNova').style.display !== 'flex' &&
                    document.getElementById('wrapper-search').style.display !== 'block') {
                    carregarComandas(true);
                }
            }, 30000);

            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js')
                    .then(reg => console.log('SW registrado', reg))
                    .catch(err => console.log('Erro SW', err));
            }
        };

        function iniciarApp() {
            // Recuperar garÃ§om salvo
            const salvo = localStorage.getItem('garcom_ativo');
            if (salvo) document.getElementById('select-garcom').value = salvo;

            setFiltroHojeGarcom();
            carregarComandas();
            carregarProdutos();
        }

        function salvarGarcom(v) {
            localStorage.setItem('garcom_ativo', v);
            showToast("GarÃ§om: " + (v || "Nenhum"), "success");
        }

        function setFiltroHojeGarcom() {
            const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bahia' });
            document.getElementById('filtro-data-inicio').value = hoje;
            document.getElementById('filtro-data-fim').value = hoje;
            document.getElementById('filtro-hora-inicio').value = '00:00';
            document.getElementById('filtro-hora-fim').value = '23:59';
            if (statusTabAtiva === 'FECHADA') carregarComandas();
        }

        function limparFiltrosAvancados() {
            document.getElementById('filtro-data-inicio').value = '';
            document.getElementById('filtro-data-fim').value = '';
            document.getElementById('filtro-hora-inicio').value = '00:00';
            document.getElementById('filtro-hora-fim').value = '23:59';
            carregarComandas();
        }

        function showToast(msg, type = 'success') {
            const cont = document.getElementById('toast-container');
            const t = document.createElement('div');
            t.className = `toast toast-${type}`;
            t.innerHTML = (type === 'success' ? 'âœ… ' : 'âŒ ') + msg;
            cont.appendChild(t);
            setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
        }

        function userConfirm(title, msg, onYes) {
            document.getElementById('confirm-title').innerText = title;
            document.getElementById('confirm-msg').innerText = msg;
            document.getElementById('modalConfirm').style.display = 'flex';
            document.getElementById('confirm-yes').onclick = () => { onYes(); closeConfirm(); };
        }
        function closeConfirm() { document.getElementById('modalConfirm').style.display = 'none'; }

        function mostrarCarregando(t) {
            document.getElementById('loader-spinner').style.display = 'block';
            document.getElementById('loader-success-icon').style.display = 'none';
            document.getElementById('loader').style.display = 'flex';
            document.getElementById('loader-text').innerText = t;
        }

        function mostrarFinalizado(t, callback) {
            document.getElementById('loader-spinner').style.display = 'none';
            document.getElementById('loader-success-icon').style.display = 'block';
            document.getElementById('loader-text').innerText = t;
            setTimeout(() => {
                document.getElementById('loader').style.display = 'none';
                if (callback) callback();
            }, 1300);
        }

        function fecharModais() { document.querySelectorAll('.overlay').forEach(o => o.style.display = 'none'); carregarComandas(); }

        function switchMainTab(status) {
            statusTabAtiva = status;
            document.getElementById('tab-abertas').classList.toggle('active', status === 'ABERTA');
            document.getElementById('tab-fechadas').classList.toggle('active', status === 'FECHADA');
            document.getElementById('btn-nova-mesa').style.display = status === 'ABERTA' ? 'flex' : 'none';

            // Mostrar filtro de data apenas na aba FECHADAS
            const filtroContainer = document.getElementById('filtro-data-container');
            if (status === 'FECHADA') {
                filtroContainer.style.display = 'block';
            } else {
                filtroContainer.style.display = 'none';
            }

            carregarComandas();
        }

        function carregarComandas(isBackground = false) {
            const syncIcon = document.getElementById('sync-icon');
            const grid = document.getElementById('lista-comandas');

            if (syncIcon) syncIcon.classList.add('fa-spin');

            // SÓ mostra skeleton se a grade estiver vazia E não for background sync
            // Isso evita que as mesas sumam enquanto carrega a atualização
            if (!isBackground && grid.innerHTML.trim() === "") {
                grid.innerHTML = `
                    <div class="skeleton-card skeleton"></div>
                    <div class="skeleton-card skeleton"></div>
                    <div class="skeleton-card skeleton"></div>
                    <div class="skeleton-card skeleton"></div>
                `;
            }

            // Obter data do filtro se estiver na aba FECHADAS
            let dataInicio = null;
            let dataFim = null;
            let horaInicio = null;
            let horaFim = null;

            if (statusTabAtiva === 'FECHADA') {
                dataInicio = document.getElementById('filtro-data-inicio').value;
                dataFim = document.getElementById('filtro-data-fim').value;
                horaInicio = document.getElementById('filtro-hora-inicio').value;
                horaFim = document.getElementById('filtro-hora-fim').value;
            }

            google.script.run.withSuccessHandler(lista => {
                if (syncIcon) syncIcon.classList.remove('fa-spin');
                if (!Array.isArray(lista)) return;

                const filtered = lista.filter(c => c.status === statusTabAtiva);

                if (filtered.length === 0) {
                    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted); opacity: 0.8;">
                        <i class="fas fa-beer" style="font-size: 2rem; display: block; margin-bottom: 10px;"></i>
                        Nenhuma mesa ${statusTabAtiva === 'ABERTA' ? 'aberta' : 'fechada'} no momento.
                    </div>`;
                } else {
                    grid.innerHTML = (Array.isArray(filtered) ? filtered : []).map(c => {
                        const isAbertaEAntiga = c.status === 'ABERTA' && c.isAntiga;
                        const styleAntiga = isAbertaEAntiga ? 'border: 1px solid #ff9800; animation: pulse-warn 2s infinite;' : '';
                        const alertaAntiga = isAbertaEAntiga ? '<i class="fas fa-clock" style="color:#ff9800; margin-left:5px;" title="Aberta anteriormente"></i>' : '';

                        return `
                        <div class="comanda-card" onclick="abrirDetalhes('${c.id}', '${c.nome}', '${c.status}')" style="animation: fadeIn 0.3s ease-out forwards; ${styleAntiga}">
                            <b>${c.nome}</b> ${alertaAntiga}<br>
                            <span style="color:var(--primary); font-weight:700">R$ ${c.total.toFixed(2)}</span>
                            <br><small style="font-size: 0.6rem; color: var(--text-muted)">${c.dataExibicao}</small>
                        </div>
                    `}).join('');
                }

                // Se o modal de detalhes estiver aberto e estivermos em background, atualiza os itens
                if (isBackground && document.getElementById('modalDetalhes').style.display === 'flex') {
                    atualizarItens(statusTabAtiva === 'FECHADA', true);
                }
            }).listarTodasComandas(dataInicio, dataFim, horaInicio, horaFim);
        }

        function carregarProdutos() { google.script.run.withSuccessHandler(d => { estoqueCache = d; renderDrop(d); }).listarEstoque(); }
        function renderDrop(lista) {
            document.getElementById('prod-list-dropdown').innerHTML = lista.map(p => `
            <div class="prod-option" onclick="selecionarProduto('${p.codigo}')">
                <img src="${p.imagem}">
                <div><b style="color:white">${p.nome}</b><br><small style="color:var(--primary)">R$ ${p.preco.toFixed(2)}</small></div>
            </div>`).join('');
        }
        function filtrarProdutos(v) { let f = estoqueCache.filter(p => p.nome.toLowerCase().includes(v.toLowerCase())); renderDrop(f); }
        function toggleDropdown(s) {
            document.getElementById('prod-list-dropdown').style.display = s ? 'block' : 'none';
            document.getElementById('wrapper-search').style.display = s ? 'block' : 'none';
            document.getElementById('btn-fechar-busca').style.display = s ? 'flex' : 'none';
            if (!s) {
                document.getElementById('search-prod').value = '';
                renderDrop(estoqueCache);
            }
        }

        function filtrarPorCategoria(cat, el) {
            document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
            el.classList.add('active');
            let f;
            if (cat === 'Tudo') {
                f = estoqueCache;
            } else {
                f = estoqueCache.filter(p => (p.categoria || 'Bebidas') === cat);
            }
            renderDrop(f);
            toggleDropdown(true);
        }

        function selecionarProduto(cod) {
            let p = estoqueCache.find(x => x.codigo === String(cod));
            if (!p) return;

            let nomeProd = p.nome;
            const normCat = (p.categoria || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const isCozinha = normCat.includes('refeicao') || normCat.includes('petisco') || normCat.includes('cozinha');

            if (isCozinha) {
                document.getElementById('obs-prod-nome').innerText = nomeProd;
                document.getElementById('obs-input').value = '';
                document.getElementById('modalObs').style.display = 'flex';
                document.getElementById('obs-input').focus();

                document.getElementById('obs-save').onclick = () => {
                    let obs = document.getElementById('obs-input').value.trim();
                    document.getElementById('modalObs').style.display = 'none';

                    const garcomAtivo = document.getElementById('select-garcom').value;
                    mostrarCarregando("Adicionando...");
                    google.script.run
                        .withSuccessHandler(res => {
                            if (res && res.sucesso) {
                                mostrarFinalizado("Adicionado!", () => {
                                    atualizarItens();
                                    toggleDropdown(false);
                                    document.getElementById('search-prod').value = '';
                                });
                            } else {
                                document.getElementById('loader').style.display = 'none';
                                showToast(res ? res.erro : "Erro ao adicionar", "error");
                            }
                        })
                        .withFailureHandler(err => {
                            document.getElementById('loader').style.display = 'none';
                            showToast("Erro de conexÃ£o", "error");
                        })
                        .adicionarItemComanda(idAtivo, String(cod), obs, garcomAtivo);
                };
            } else {
                userConfirm("Confirmar Pedido", `Deseja adicionar ${nomeProd} Ã  mesa?`, () => {
                    const garcomAtivo = document.getElementById('select-garcom').value;
                    document.getElementById('search-prod').value = '';
                    mostrarCarregando("Adicionando...");
                    google.script.run
                        .withSuccessHandler(res => {
                            if (res && res.sucesso) {
                                mostrarFinalizado("Adicionado!", () => {
                                    atualizarItens();
                                    toggleDropdown(false);
                                });
                            } else {
                                document.getElementById('loader').style.display = 'none';
                                showToast(res ? res.erro : "Erro ao adicionar", "error");
                            }
                        })
                        .withFailureHandler(err => {
                            document.getElementById('loader').style.display = 'none';
                            showToast("Erro de conexÃ£o", "error");
                        })
                        .adicionarItemComanda(idAtivo, String(cod), "", garcomAtivo);
                });
            }
        }

        function abrirDetalhes(id, nome, status = 'ABERTA') {
            idAtivo = String(id); document.getElementById('view-nome').innerText = nome;
            // Configurar botÃµes baseado no status
            const isFechada = status === 'FECHADA';
            document.getElementById('btn-pagar').style.display = isFechada ? 'none' : 'flex';
            document.getElementById('btn-reimprimir').style.display = 'flex';
            document.getElementById('btn-edit-nome').style.display = isFechada ? 'none' : 'block';
            document.querySelector('.search-container').style.display = isFechada ? 'none' : 'block';
            document.querySelectorAll('.btn-del').forEach(b => b.style.display = isFechada ? 'none' : 'block');

            // Limpar tabela e total antes de abrir para nÃ£o mostrar lixo de comanda anterior
            document.getElementById('tabela-itens').innerHTML = '<tr><td colspan="2" align="center">Carregando itens...</td></tr>';
            document.getElementById('view-total').innerText = 'R$ 0,00';
            document.getElementById('modalDetalhes').style.display = 'flex';
            atualizarItens(isFechada);
        }

        function atualizarItens(isFechada = false, isBackground = false, callback = null) {
            if (!idAtivo) return;
            google.script.run.withSuccessHandler(itens => {
                if (!Array.isArray(itens)) return;

                let _total = 0;
                let _consumo = 0;
                let _itensSessao = itens;

                let produtos = itens.filter(i => {
                    let cat = (i.category || i.categoria || i.cat || '').toUpperCase();
                    let nome = (i.nome || '').toUpperCase();
                    // Relaxar filtro: permite i.total === 0 se Qtd > 0 (ex: cortesia)
                    return cat !== 'PAGAMENTO' && !nome.includes('PAGAMENTO PARCIAL') && i.codigo !== 'PAG_AVULSO' && (Math.abs(i.total) >= 0 && i.qtd > 0);
                });
                let pagamentos = itens.filter(i => {
                    let cat = (i.category || i.categoria || i.cat || '').toUpperCase();
                    let nome = (i.nome || '').toUpperCase();
                    return (cat === 'PAGAMENTO' || nome.includes('PAGAMENTO PARCIAL') || i.codigo === 'PAG_AVULSO' || i.codigo === 'PAG_FINAL') && (i.total != 0 || i.codigo === 'PAG_FINAL');
                });

                let html = produtos.map(i => {
                    let sub = Math.abs(i.total);
                    _total += sub;
                    _consumo += sub;
                    return `<tr>
                        <td>
                            <b>${i.nome}</b> ${i.garcom ? `<small style="font-size:0.6rem; background:rgba(212,175,55,0.1); padding:2px 5px; border-radius:5px; color:var(--primary)">ðŸ‘¤ ${i.garcom}</small>` : ''}<br>
                            <small>${i.qtd}x R$ ${i.preco.toFixed(2)}</small>
                            ${i.obs ? `<br><small style="color:var(--primary); font-style:italic">ðŸ“ ${i.obs}</small>` : ''}
                        </td>
                        <td align="right">
                            <div style="display:flex; align-items:center; gap:8px; justify-content:flex-end">
                                <span style="margin-right:8px">R$ ${sub.toFixed(2)}</span>
                                ${!isFechada ? `
                                    <div style="display:flex; gap:2px">
                                        <button class="btn-del" onclick="removerItem('${i.codigo}')${isBackground ? ', true' : ''}" 
                                                style="padding: 2px 8px; font-size: 0.7rem; background:rgba(255,0,0,0.1)">âž–</button>
                                        <button class="btn-del" onclick="adicionarMais('${i.codigo}')${isBackground ? ', true' : ''}" 
                                                style="padding: 2px 8px; font-size: 0.7rem; background:rgba(0,255,0,0.1); color:var(--success); border-color:var(--success)">âž•</button>
                                    </div>
                                ` : ''}
                            </div>
                        </td>
                    </tr>`;
                }).join('');

                if (pagamentos.length > 0) {
                    html += `<tr><td colspan="2" style="padding-top:15px; border-bottom:1px solid var(--primary); color:var(--primary); font-size:0.8rem; font-weight:700">PAGAMENTOS JÃ REALIZADOS</td></tr>`;
                    let pgsVistos = new Set();
                    pagamentos.forEach(p => {
                        let v = Math.abs(p.total);
                        let chave = p.nome + "_" + v.toFixed(2);
                        if (!pgsVistos.has(chave)) {
                            _total += p.total;
                            html += `<tr style="color:var(--success)">
                               <td><i class="fas fa-check-circle"></i> ${p.nome}</td>
                               <td align="right">R$ -${v.toFixed(2)}</td>
                           </tr>`;
                            pgsVistos.add(chave);
                        }
                    });
                }

                // Sincronizar estado global apenas no final
                totalAtual = _total;
                consumoTotal = _consumo;
                itensSessao = _itensSessao;

                document.getElementById('tabela-itens').innerHTML = html || '<tr><td colspan="2" align="center">Vazio</td></tr>';
                document.getElementById('view-total').innerText = (isFechada ? 'Faturado: R$ ' : 'Saldo Aberto: R$ ') + Math.max(0, totalAtual).toFixed(2);

                if (callback) callback();
            }).buscarItensComanda(idAtivo);
        }

        function editarNomeMesa() {
            const nomeAntigo = document.getElementById('view-nome').innerText;
            document.getElementById('edit-mesa-input').value = nomeAntigo;
            document.getElementById('modalEditNome').style.display = 'flex';
            setTimeout(() => document.getElementById('edit-mesa-input').focus(), 100);
        }

        function confirmarEdicaoNome() {
            const novoNome = document.getElementById('edit-mesa-input').value.trim();
            const nomeAntigo = document.getElementById('view-nome').innerText;

            if (!novoNome) return showToast("Digite um nome!", "error");
            if (novoNome === nomeAntigo) {
                document.getElementById('modalEditNome').style.display = 'none';
                return;
            }

            // Alerta de depuraÃ§Ã£o (Remover depois de funcionar)
            console.log("Tentando alterar ID:", idAtivo, "para:", novoNome);

            mostrarCarregando("Atualizando...");
            google.script.run
                .withSuccessHandler(res => {
                    console.log("Resposta do servidor:", res);
                    if (res && res.sucesso) {
                        document.getElementById('modalEditNome').style.display = 'none';
                        document.getElementById('view-nome').innerText = novoNome;
                        mostrarFinalizado("Sucesso!", () => carregarComandas());
                    } else {
                        document.getElementById('loader').style.display = 'none';
                        const erroMsg = res ? res.erro : "Resposta vazia do servidor";
                        showToast(erroMsg, "error");
                    }
                })
                .withFailureHandler(err => {
                    document.getElementById('loader').style.display = 'none';
                    showToast("Falha CrÃ­tica de ConexÃ£o", "error");
                    console.error(err);
                })
                .alterarNomeMesa(idAtivo, novoNome);
        }

        function adicionarMais(cod, isBackground = false) {
            if (!isBackground) mostrarCarregando("Adicionando...");
            const garcomAtivo = document.getElementById('select-garcom').value;
            google.script.run.withSuccessHandler(res => {
                if (res.sucesso) {
                    if (!isBackground) mostrarFinalizado("Adicionado!", () => atualizarItens());
                    else atualizarItens(false, true);
                } else showToast("Erro: " + res.erro, "error");
            }).adicionarItemComanda(idAtivo, String(cod), "", garcomAtivo);
        }

        function reimprimirCupom() {
            let dados = {
                id: idAtivo,
                // Usamos o total que jÃ¡ estÃ¡ na tela ou buscamos dos itens
                total: totalAtual,
                itens: itensSessao,
                forma: "ConferÃªncia",
                isParcial: false,
                isAbatimento: false,
                isPrevia: true
            };
            prepararCupom(dados);
        }

        function removerItem(cod, isBackground = false) {
            if (!isBackground) mostrarCarregando("Removendo...");
            google.script.run.withSuccessHandler(res => {
                if (res.sucesso) {
                    if (!isBackground) mostrarFinalizado("Removido!", () => atualizarItens());
                    else atualizarItens(false, true);
                } else showToast("Erro: " + res.erro, "error");
            }).removerItemComanda(idAtivo, String(cod));
        }

        function setModoPagamento(m) {
            modoPagamento = m;
            document.getElementById('btn-pago-total').className = m === 'TOTAL' ? 'btn btn-primary' : 'btn';
            document.getElementById('btn-pago-abatimento').className = m === 'ABATIMENTO' ? 'btn btn-primary' : 'btn';
            document.getElementById('area-valor-avulso').style.display = m === 'ABATIMENTO' ? 'block' : 'none';
            recalcParcial();
        }

        function recalcParcial() {
            let valor = 0;
            document.getElementById('pag-saldo-atual').innerText = 'R$ ' + totalAtual.toFixed(2);
            if (modoPagamento === 'TOTAL') { valor = totalAtual; }
            else if (modoPagamento === 'ABATIMENTO') { valor = parseFloat(document.getElementById('input-valor-avulso').value) || 0; }
            document.getElementById('pag-total-l').innerText = 'R$ ' + valor.toFixed(2);
            document.getElementById('pag-valor').value = valor.toFixed(2);
            calcTroco();
        }

        function recalcAvulso() {
            document.getElementById('pag-total-l').innerText = 'R$ ' + (parseFloat(document.getElementById('input-valor-avulso').value) || 0).toFixed(2);
            document.getElementById('pag-valor').value = document.getElementById('input-valor-avulso').value;
            calcTroco();
        }

        function calcTroco() {
            let t = parseFloat(document.getElementById('pag-total-l').innerText.replace('R$ ', ''));
            let pago = parseFloat(document.getElementById('pag-valor').value) || 0;
            document.getElementById('pag-troco').innerText = 'R$ ' + (pago > t ? (pago - t).toFixed(2) : '0.00');

            // Dinamizar texto do botÃ£o
            const btn = document.getElementById('btn-finalizar-modal');
            if (modoPagamento === 'ABATIMENTO') {
                if (t >= totalAtual && totalAtual > 0) {
                    btn.innerText = 'FECHAR CONTA';
                    btn.className = 'btn btn-primary';
                } else {
                    btn.innerText = 'ABATER';
                    btn.className = 'btn btn-primary';
                }
            } else {
                btn.innerText = 'FECHAR CONTA';
                btn.className = 'btn btn-primary';
            }
        }

        function abrirPagamento() {
            modoPagamento = 'ABATIMENTO';
            document.getElementById('modalPagamento').style.display = 'flex';
            document.getElementById('input-valor-avulso').value = totalAtual.toFixed(2);
            document.getElementById('split-people').value = 1;
            ajustarCampos();
            recalcParcial();
            setTimeout(() => {
                document.getElementById('input-valor-avulso').select();
            }, 100);
        }

        function finalizarFinal() {
            let valPagar = parseFloat(document.getElementById('pag-total-l').innerText.replace('R$ ', ''));
            if (valPagar <= 0) return showToast("Valor invÃ¡lido", "error");

            let itensPagar = [];
            if (modoPagamento === 'TOTAL') itensPagar = itensSessao;

            let m = document.getElementById('pag-metodo').value;
            let clie = document.getElementById('pag-cliente').value;
            if (m === 'Fiado' && !clie) { showToast("Informe o nome do cliente para Fiado!", "error"); return; }
            let isFullPayment = (modoPagamento === 'ABATIMENTO' && valPagar >= totalAtual) || modoPagamento === 'TOTAL';

            let dados = {
                id: idAtivo, tipo: 'COMANDA', total: valPagar, forma: m,
                cliente: clie,
                pago: parseFloat(document.getElementById('pag-valor').value) || 0,
                troco: parseFloat(document.getElementById('pag-troco').innerText.replace('R$ ', '')),
                itens: isFullPayment ? itensSessao : [],
                isParcial: !isFullPayment,
                isAbatimento: !isFullPayment
            };

            mostrarCarregando("Finalizando...");
            google.script.run.withSuccessHandler(res => {
                if (res.sucesso) {
                    mostrarFinalizado("Venda ConcluÃ­da!", () => {
                        if (isFullPayment) {
                            prepararCupom(dados);
                            fecharModais();
                        } else {
                            // Se for abate, manter modal aberto, atualizar dados e campos
                            carregarComandas(true);
                            atualizarItens(false, false, () => {
                                recalcParcial();
                                document.getElementById('input-valor-avulso').value = '0.00';
                                document.getElementById('pag-valor').value = '';
                                document.getElementById('pag-troco').innerText = 'R$ 0.00';
                            });
                        }
                        document.getElementById('pag-cliente').value = '';
                    });
                } else { showToast("Erro: " + res.erro, "error"); }
            }).finalizarVenda(dados);
        }

        function prepararCupom(dados) {
            const mesa = document.getElementById('view-nome').innerText;
            document.getElementById('cupom-mesa').innerText = mesa;
            document.getElementById('cupom-data-hora').innerText = new Date().toLocaleString('pt-BR', { timeZone: 'America/Bahia' });

            // 1. Filtrar Produtos (Somente positivos e nÃ£o relacionados a pagamento)
            let produtos = dados.itens.filter(i => {
                let cat = (i.category || i.categoria || i.cat || '').toUpperCase();
                let nome = (i.nome || '').toUpperCase();
                return cat !== 'PAGAMENTO' && !nome.includes('PAGAMENTO PARCIAL') && i.codigo !== 'PAG_AVULSO' && i.total > 0;
            });

            // 2. Filtrar Pagamentos Realizados (Pegar apenas os registros originais positivos)
            let pagamentosAnteriores = dados.itens.filter(i => {
                let cat = (i.category || i.categoria || i.cat || '').toUpperCase();
                let nome = (i.nome || '').toUpperCase();
                // Pegamos apenas os registros positivos de pagamento para evitar duplicidade com os de ajuste
                return (cat === 'PAGAMENTO' || nome.includes('PAGAMENTO PARCIAL') || i.codigo === 'PAG_AVULSO') && i.total != 0;
            });

            let totalConsumo = 0;
            let htmlItens = produtos.map(i => {
                let sub = Math.abs(i.total);
                totalConsumo += sub;
                return `<tr><td style="padding:1px 0;">${i.nome} (${i.qtd}x)</td><td align="right" style="padding:1px 0;">R$ ${sub.toFixed(2)}</td></tr>`;
            }).join('');

            let totalPagoAnterior = 0;
            let pgsVistos = new Set();
            if (pagamentosAnteriores.length > 0) {
                htmlItens += `<tr><td colspan="2" style="border-top:1px dashed #000; font-weight:bold; font-size:10px; padding-top:5px;">PAGAMENTOS REALIZADOS:</td></tr>`;
                pagamentosAnteriores.forEach(p => {
                    let v = Math.abs(p.total);
                    // Evitar duplicar o mesmo valor de pagamento no visor do cupom
                    let chave = p.nome + "_" + v.toFixed(2);
                    if (!pgsVistos.has(chave)) {
                        totalPagoAnterior += v;
                        htmlItens += `<tr><td style="padding:1px 0;">${p.nome}</td><td align="right" style="padding:1px 0;">R$ -${v.toFixed(2)}</td></tr>`;
                        pgsVistos.add(chave);
                    }
                });
            }

            if (dados.isAbatimento) {
                htmlItens += `<tr><td style="border-top:1px solid #000; font-weight:bold">PAGAMENTO AGORA (PARCIAL):</td><td align="right" style="border-top:1px solid #000; font-weight:bold">R$ -${dados.total.toFixed(2)}</td></tr>`;
            }

            document.getElementById('cupom-itens').innerHTML = htmlItens;

            // RodapÃ©: Total Conta - Pagamentos = Saldo
            let totalPagoGeral = totalPagoAnterior + (dados.isAbatimento ? dados.total : (dados.isParcial ? dados.total : 0));
            if (!dados.isParcial && !dados.isAbatimento && !dados.isPrevia) totalPagoGeral = totalConsumo;

            let htmlTotal = `
              <div style="border-top:1px solid #000; padding-top:3px; margin-top:5px;">
                <p style="font-size: 0.75rem; display:flex; justify-content:space-between; margin:2px 0;"><span>TOTAL CONTA:</span> <b>R$ ${totalConsumo.toFixed(2)}</b></p>
                <p style="font-size: 0.75rem; display:flex; justify-content:space-between; margin:2px 0;"><span>TOTAL PAGO:</span> <b>R$ -${totalPagoGeral.toFixed(2)}</b></p>
                <p style="font-size: 0.95rem; display:flex; justify-content:space-between; margin:3px 0; border-top:1px dashed #000; padding-top:3px;"><span>A PAGAR:</span> <b>R$ ${Math.max(0, totalConsumo - totalPagoGeral).toFixed(2)}</b></p>
              </div>`;

            document.getElementById('cupom-total').innerHTML = htmlTotal;
            document.getElementById('cupom-forma').innerText = (pagamentosAnteriores.length > 0 && !dados.isParcial) ? "Misto / Final: " + dados.forma : dados.forma;

            const tituloModal = dados.isPrevia ? "ConferÃªncia de Mesa" : "Venda ConcluÃ­da";
            userConfirm(tituloModal, "Deseja imprimir o cupom agora?", () => window.print());
        }

        function abrirModalNova() { document.getElementById('modalNova').style.display = 'flex'; document.getElementById('new-mesa').value = ''; }
        function splitBill() {
            let people = parseInt(document.getElementById('split-people').value) || 1;
            let val = consumoTotal / people;
            document.getElementById('split-result').innerText = 'R$ ' + val.toFixed(2);
            document.getElementById('input-valor-avulso').value = val.toFixed(2);
            recalcAvulso();
        }

        let notificacoesJaVistas = new Set();
        function verificarNotificacoes() {
            google.script.run.withSuccessHandler(lista => {
                if (!Array.isArray(lista)) return;
                lista.forEach(n => {
                    let key = n.rowIndex + "_" + n.idComanda + "_" + (n.timestamp || "");
                    if (!notificacoesJaVistas.has(key)) {
                        notificacoesJaVistas.add(key);

                        const msg = `ðŸ½ï¸ PRONTO: ${n.qtd}x ${n.nome} para a mesa ${n.mesa}`;
                        showToast(msg, "success");
                        executarSomNotificacao();

                        // NotificaÃ§Ã£o de Sistema (Barra de NotificaÃ§Ã£o)
                        if ("Notification" in window && Notification.permission === "granted") {
                            new Notification("Pedido Pronto! ðŸš€", {
                                body: msg,
                                icon: "https://cdn-icons-png.flaticon.com/512/4862/4862562.png"
                            });
                        }
                    }
                });
            })
                .withFailureHandler(err => console.error("Erro ao buscar notificaÃ§Ãµes:", err))
                .getNotificacoesCozinha();
        }

        let audioPronto = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        function executarSomNotificacao() {
            audioPronto.play().catch(e => console.log("Som bloqueado: ", e));
        }

        // FunÃ§Ã£o para desbloquear Ã¡udio em navegadores mobile
        function desbloquearAudio() {
            audioPronto.play().then(() => {
                audioPronto.pause();
                audioPronto.currentTime = 0;
            }).catch(e => console.log("Aguardando interaÃ§Ã£o para Ã¡udio"));
        }

        function confirmarNova() {
            let n = document.getElementById('new-mesa').value; if (!n) return showToast("Digite a mesa!", "error");
            mostrarCarregando("Abrindo...");
            google.script.run.withSuccessHandler(() => { mostrarFinalizado("Aberta!", () => fecharModais()); }).abrirNovaComanda(n);
        }

        function ajustarCampos() {
            recalcParcial();
            const m = document.getElementById('pag-metodo').value;
            const cont = document.getElementById('cont-pag-cliente');
            if (cont) cont.style.display = m === 'Fiado' ? 'block' : 'none';
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
                // Fallback para iOS
                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
                if (isIOS) {
                    alert("No iPhone/iPad:\n1. Toque no Ã­cone de Compartilhar (quadrado com seta)\n2. Role para baixo e selecione 'Adicionar Ã  Tela de InÃ­cio'");
                }
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



