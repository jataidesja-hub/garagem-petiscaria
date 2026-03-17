const SUPABASE_URL = "https://ryyhzptmpmqnhgyzzxin.supabase.co";
const SUPABASE_KEY = "sb_publishable_0zFsYtEPHozL_bONYnbBkg_QToxw6P-";

const SupabaseClient = {
    async fetch(path, options = {}) {
        const url = `${SUPABASE_URL}/rest/v1/${path}`;
        const defaultHeaders = {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        };

        const res = await fetch(url, {
            ...options,
            headers: { ...defaultHeaders, ...options.headers }
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || "Erro na requisição ao Supabase");
        }

        if (options.method === 'DELETE' || res.status === 204) return { sucesso: true };
        
        const data = await res.json();
        return { sucesso: true, data };
    },

    async select(table, query = "*") {
        return this.fetch(`${table}?select=${query}`);
    },

    async insert(table, data) {
        return this.fetch(table, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async update(table, data, matchQuery) {
        return this.fetch(`${table}?${matchQuery}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    },

    async rpc(fn, params) {
        return this.fetch(`rpc/${fn}`, {
            method: 'POST',
            body: JSON.stringify(params)
        });
    }
};

// Adaptador para manter compatibilidade com as chamadas antigas google.script.run
window.google = {
    script: {
        run: {
            handlers: { success: null, failure: null },
            withSuccessHandler(cb) { this.handlers.success = cb; return this; },
            withFailureHandler(eb) { this.handlers.failure = eb; return this; },
            
            async _exec(fn, ...args) {
                try {
                    const res = await SupabaseAPI[fn](...args);
                    if (this.handlers.success) this.handlers.success(res);
                } catch (err) {
                    if (this.handlers.failure) this.handlers.failure(err);
                    else console.error(err);
                }
            },

            listarEstoque(...args) { this._exec('listarEstoque', ...args); },
            listarTodasComandas(...args) { this._exec('listarTodasComandas', ...args); },
            buscarItensComanda(...args) { this._exec('buscarItensComanda', ...args); },
            abrirNovaComanda(...args) { this._exec('abrirNovaComanda', ...args); },
            adicionarItemComanda(...args) { this._exec('adicionarItemComanda', ...args); },
            removerItemComanda(...args) { this._exec('removerItemComanda', ...args); },
            finalizarVenda(...args) { this._exec('finalizarVenda', ...args); },
            listarPedidosCozinha(...args) { this._exec('listarPedidosCozinha', ...args); },
            marcarPedidoPronto(...args) { this._exec('marcarPedidoPronto', ...args); },
            alterarNomeMesa(...args) { this._exec('alterarNomeMesa', ...args); },
            getNotificacoesCozinha(...args) { this._exec('getNotificacoesCozinha', ...args); }
        }
    }
};

const SupabaseAPI = {
    async listarEstoque() {
        const res = await SupabaseClient.select('estoque');
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
    },

    async listarTodasComandas(dataInicio, dataFim, horaInicio, horaFim) {
        let path = 'comandas?select=*';
        if (dataInicio && dataFim) {
            const start = `${dataInicio}T${horaInicio || '00:00'}:00Z`;
            const end = `${dataFim}T${horaFim || '23:59'}:59Z`;
            path += `&abertura=gte.${start}&abertura=lte.${end}`;
        }
        const res = await SupabaseClient.fetch(path + '&order=abertura.desc');
        return res.data.map(r => ({
            id: r.id,
            nome: r.mesa_nome,
            cliente: r.cliente,
            data: r.abertura,
            dataExibicao: new Date(r.abertura).toLocaleString('pt-BR'),
            status: r.status,
            total: Number(r.total_liquido)
        }));
    },

    async buscarItensComanda(idComanda) {
        const res = await SupabaseClient.fetch(`comanda_itens?id_comanda=eq.${idComanda}&select=*`);
        return res.data.map(i => ({
            codigo: i.codigo_produto,
            nome: i.nome_produto,
            qtd: i.qtd,
            preco: i.preco_unit,
            total: i.total_bruto,
            categoria: i.categoria,
            obs: i.observacao,
            garcom: i.garcom
        }));
    },

    async abrirNovaComanda(nome) {
        const id = 'CM' + new Date().getTime();
        await SupabaseClient.insert('comandas', { id, mesa_nome: nome, status: 'ABERTA' });
        return { sucesso: true, id };
    },

    async adicionarItemComanda(idComanda, cod, obs, garcom) {
        const prodRes = await SupabaseClient.fetch(`estoque?codigo=eq.${cod}&select=*`);
        const p = prodRes.data[0];
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
        await SupabaseClient.insert('comanda_itens', item);
        await SupabaseClient.rpc('baixar_estoque', { prod_id: cod, quantidade: 1 });
        return { sucesso: true };
    },

    async finalizarVenda(dados) {
        const venda = {
            id_comanda: dados.id,
            tipo_venda: dados.tipo,
            total_liquido: dados.total,
            forma_pagamento: dados.forma,
            cliente: dados.cliente,
            valor_pago: dados.total,
            troco: dados.troco
        };
        await SupabaseClient.insert('vendas', venda);
        if (dados.tipo === 'COMANDA') {
            await SupabaseClient.update('comandas', {
                status: 'FECHADA',
                total_liquido: dados.total,
                forma_pagamento: dados.forma,
                valor_pago: dados.total
            }, `id=eq.${dados.id}`);
        }
        return { sucesso: true };
    },

    async removerItemComanda(idComanda, cod) {
        // Lógica simplificada: deleta UM item que combine com o código na comanda
        const res = await SupabaseClient.fetch(`comanda_itens?id_comanda=eq.${idComanda}&codigo_produto=eq.${cod}&limit=1&select=id`);
        if (res.data.length > 0) {
            await SupabaseClient.fetch(`comanda_itens?id=eq.${res.data[0].id}`, { method: 'DELETE' });
            await SupabaseClient.rpc('estornar_estoque', { prod_id: cod, quantidade: 1 });
        }
        return { sucesso: true };
    },

    async marcarPedidoPronto(id) {
        await SupabaseClient.update('comanda_itens', { status_item: 'PRONTO' }, `id=eq.${id}`);
        return { sucesso: true };
    },

    async listarPedidosCozinha() {
        const res = await SupabaseClient.fetch('comanda_itens?status_item=eq.PENDENTE&order=timestamp.asc&select=*');
        return res.data.map(r => ({
            rowIndex: r.id,
            idComanda: r.id_comanda,
            nome: r.nome_produto,
            qtd: r.qtd,
            obs: r.observacao,
            status: r.status_item,
            timestamp: new Date(r.timestamp).getTime()
        }));
    },

    async getNotificacoesCozinha() {
        const res = await SupabaseClient.fetch('comanda_itens?status_item=eq.PRONTO&order=timestamp.desc&limit=5&select=*,comandas(mesa_nome)');
        return res.data.map(r => ({
            rowIndex: r.id,
            idComanda: r.id_comanda,
            nome: r.nome_produto,
            qtd: r.qtd,
            mesa: r.comandas ? r.comandas.mesa_nome : 'Desconhecida',
            timestamp: new Date(r.timestamp).getTime()
        }));
    }
};
