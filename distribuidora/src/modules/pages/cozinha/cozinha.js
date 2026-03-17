// CONFIGURAÃ‡ÃƒO VERCEL -> GOOGLE
        

        // POLYFILL GOOGLE SCRIPT RUN
        

        let soundEnabled = false;
        let lastOrderCount = 0;

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
            carregarPedidos();
            // Atualizar automaticamente a cada 5 segundos para a cozinha
            setInterval(carregarPedidos, 5000);
        };

        function toggleSound() {
            soundEnabled = !soundEnabled;
            const icon = document.getElementById('sound-icon');
            const btn = document.getElementById('btn-sound-toggle');

            if (soundEnabled) {
                icon.className = 'fas fa-volume-up';
                btn.style.background = 'rgba(0, 230, 118, 0.2)';
                // Play a tiny silent/short sound to unlock audio on mobile/browsers
                document.getElementById('notif-sound').play().catch(e => console.log("Ãudio aguardando interaÃ§Ã£o..."));
            } else {
                icon.className = 'fas fa-volume-mute';
                btn.style.background = 'var(--glass)';
            }
        }

        function carregarPedidos() {
            const loader = document.getElementById('loader');
            const list = document.getElementById('order-list');
            loader.style.display = 'block';
            console.log('--- Iniciando busca de pedidos ---');

            // Timeout de seguranÃ§a para aviso se demorar demais
            const fetchTimeout = setTimeout(() => {
                if (loader.style.display === 'block') {
                    console.warn('Busca de pedidos estÃ¡ demorando...');
                    list.innerHTML += '<div style="color:orange; text-align:center; padding:10px;"><small>âš ï¸ A busca estÃ¡ demorando. Verifique sua conexÃ£o ou clique em RECARREGAR.</small></div>';
                }
            }, 8000);

            google.script.run
                .withSuccessHandler(pedidos => {
                    clearTimeout(fetchTimeout);
                    console.log('Resposta recebida! Itens:', pedidos ? pedidos.length : 0);
                    loader.style.display = 'none';

                    if (pedidos && Array.isArray(pedidos)) {
                        const pendingCount = pedidos.filter(p => p.status === 'PENDENTE').length;

                        // Se o nÃºmero de pedidos pendentes aumentou, toca o som
                        if (soundEnabled && pendingCount > lastOrderCount) {
                            document.getElementById('notif-sound').play().catch(e => console.log("Erro ao tocar Ã¡udio:", e));
                        }
                        lastOrderCount = pendingCount;
                    }

                    renderizarPedidos(pedidos);
                })
                .withFailureHandler(err => {
                    clearTimeout(fetchTimeout);
                    console.error('ERRO CRÃTICO NO SERVIDOR:', err);
                    loader.style.display = 'none';
                    list.innerHTML = `
                        <div class="empty-state">
                            <h3>âŒ Erro de Carregamento</h3>
                            <p>O servidor nÃ£o respondeu corretamente.</p>
                            <div style="background:rgba(255,0,0,0.1); padding:15px; border-radius:10px; margin-top:10px; text-align:left;">
                                <code style="color:#ff6b6b; font-size:0.8rem;">Erro: ${err.message}</code><br>
                                <small style="color:var(--text-muted)">Dica: Certifique-se de que a coluna de data (Timestamp) nÃ£o estÃ¡ vazia na planilha ComandaItens.</small>
                            </div>
                            <button onclick="carregarPedidos()" class="btn-ready" style="background:var(--primary); margin-top:20px;">TENTAR NOVAMENTE</button>
                        </div>`;
                })
                .listarPedidosCozinha();
        }

        function renderizarPedidos(pedidos) {
            const list = document.getElementById('order-list');
            if (!pedidos || pedidos.length === 0) {
                list.innerHTML = '<div class="empty-state"><h3>âœ… Tudo pronto por aqui!</h3><p>Nenhum pedido pendente.</p></div>';
                return;
            }

            list.innerHTML = (Array.isArray(pedidos) ? pedidos : []).map(p => {
                // Tratar timestamp vindo como NÃºmero (milissegundos)
                const data = new Date(p.timestamp);
                const hora = isNaN(data.getTime()) ? '--:--' : data.getHours().toString().padStart(2, '0') + ':' + data.getMinutes().toString().padStart(2, '0');
                const isReady = p.status === 'PRONTO';

                return `
                <div class="order-card ${isReady ? 'ready' : ''}" id="card-${p.rowIndex}">
                    <div class="order-header">
                        <div>
                            <span class="mesa-badge">${p.mesa}</span>
                            ${isReady ? '<span class="ready-badge">PRONTO</span>' : ''}
                        </div>
                        <span class="time-badge">ðŸ•’ ${hora}</span>
                    </div>
                    <div class="item-row">
                        <span class="item-name">${p.nome}</span>
                        <span class="item-qtd">${p.qtd}x</span>
                    </div>
                    ${p.obs ? `<div class="obs">ðŸ“ ${p.obs}</div>` : ''}
                    <button class="btn-ready" onclick="marcarPronto(${p.rowIndex})">MARCAR COMO PRONTO</button>
                </div>`;
            }).join('');
        }

        function marcarPronto(rowIndex) {
            const btn = event.target;
            btn.disabled = true;
            btn.innerText = "Processando...";

            google.script.run.withSuccessHandler(res => {
                if (res.sucesso) {
                    const card = document.getElementById(`card-${rowIndex}`);
                    if (card) {
                        card.style.opacity = '0';
                        card.style.transform = 'scale(0.8)';
                    }
                    setTimeout(() => carregarPedidos(), 300);
                } else {
                    alert("Erro ao atualizar: " + res.erro);
                    btn.disabled = false;
                    btn.innerText = "MARCAR COMO PRONTO";
                }
            }).marcarPedidoPronto(rowIndex);
        }

        // O intervalo e o onload jÃ¡ foram configurados no inÃ­cio do script

        // Registro de Service Worker para PWA
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
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




