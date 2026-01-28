/**
 * Sistema de Comissões Young Empreendimentos
 * JavaScript principal do Dashboard
 */

// ================================
// ESTADO GLOBAL
// ================================

let comissoesSelecionadas = [];
let dadosEmpreendimentos = [];
let dadosCorretores = [];
let dadosContratos = [];

// ================================
// UTILITÁRIOS
// ================================

/**
 * Faz uma requisicao com retry automatico
 * @param {string} url - URL da requisicao
 * @param {object} options - Opcoes do fetch
 * @param {number} retries - Numero de tentativas
 * @returns {Promise<Response>}
 */
async function fetchComRetry(url, options = {}, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) {
                return response;
            }
            // Se nao for ok mas nao e erro de rede, retorna mesmo assim
            if (response.status < 500) {
                return response;
            }
            // Erro 5xx, tentar novamente
            if (i < retries - 1) {
                await new Promise(r => setTimeout(r, 1000 * (i + 1)));
            }
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
    throw new Error('Falha apos multiplas tentativas');
}

/**
 * Extrai o numero do lote/unidade de diferentes formatos de dados
 * @param {any} unidadeData - Pode ser array de objetos, JSON string ou string simples
 * @returns {string} - Numero do lote formatado
 */
function extrairNumeroLote(unidadeData) {
    if (!unidadeData) return '';
    
    if (Array.isArray(unidadeData)) {
        // Array de objetos: extrair campo 'name'
        return unidadeData.map(u => u.name || u).join(', ');
    } else if (typeof unidadeData === 'string') {
        // Tentar parse se for JSON string
        try {
            const parsed = JSON.parse(unidadeData);
            if (Array.isArray(parsed)) {
                return parsed.map(u => u.name || u).join(', ');
            }
            return unidadeData;
        } catch {
            return unidadeData;
        }
    }
    return String(unidadeData);
}

function formatCurrency(value) {
    if (value === null || value === undefined || value === '' || value === '-') {
        return '-';
    }
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('pt-BR');
    } catch (e) {
        return dateStr;
    }
}

function showAlert(message, type = 'info') {
    const alertsContainer = document.getElementById('alerts');
    if (!alertsContainer) return;
    
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    alertsContainer.appendChild(alert);
    
    setTimeout(() => {
        alert.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => alert.remove(), 300);
    }, 3000);
}

function showLoading(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.style.display = 'block';
        element.classList.add('active');
    }
}

function hideLoading(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.style.display = 'none';
        element.classList.remove('active');
    }
}

function corrigirEspacamentoNome(nome) {
    if (!nome) return '-';
    return nome.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function traduzirStatusParcela(status) {
    if (!status) return 'Não informado';
    
    const statusLower = status.toLowerCase().trim().replace(/_/g, ' ');
    
    const traducoes = {
        // Status do Sienge (principais)
        'awaiting authorization': 'Aguardando Autorização',
        'awaiting_authorization': 'Aguardando Autorização',
        'awaiting release': 'Aguardando Liberação',
        'awaiting_release': 'Aguardando Liberação',
        'released': 'Liberado',
        // Pago
        'paidout': 'Pago',
        'paid out': 'Pago',
        'paid': 'Pago',
        'pago': 'Pago',
        'settled': 'Pago',
        'liquidado': 'Pago',
        // Pendente
        'pending': 'Pendente',
        'pendente': 'Pendente',
        // Vencido
        'overdue': 'Vencido',
        'vencido': 'Vencido',
        'expired': 'Vencido',
        'late': 'Vencido',
        'atrasado': 'Vencido',
        // Cancelado
        'cancelled': 'Cancelado',
        'canceled': 'Cancelado',
        'cancelado': 'Cancelado',
        // Ativo
        'active': 'Ativo',
        'ativo': 'Ativo',
        // Aberto
        'open': 'Aberto',
        'aberto': 'Aberto',
        'opened': 'Aberto',
        // Parcial
        'partial': 'Parcial',
        'parcial': 'Parcial',
        'partially': 'Parcial',
        'partially paid': 'Parcial',
        // Processando
        'processing': 'Processando',
        'processando': 'Processando',
        'in progress': 'Processando',
        'em andamento': 'Processando',
        // Aprovado
        'approved': 'Aprovado',
        'aprovado': 'Aprovado',
        // Rejeitado
        'rejected': 'Rejeitado',
        'rejeitado': 'Rejeitado',
        'denied': 'Rejeitado',
        'negado': 'Rejeitado',
        // Aguardando
        'waiting': 'Aguardando',
        'aguardando': 'Aguardando',
        'on hold': 'Aguardando',
        // Concluído
        'completed': 'Concluído',
        'concluido': 'Concluído',
        'concluído': 'Concluído',
        'complete': 'Concluído',
        'done': 'Concluído',
        'finalizado': 'Concluído',
        // Em aberto / A vencer
        'due': 'A Vencer',
        'a vencer': 'A Vencer',
        'not due': 'A Vencer',
        'scheduled': 'Agendado',
        'agendado': 'Agendado'
    };
    
    // Busca exata primeiro (com underscore substituído por espaço)
    if (traducoes[statusLower]) {
        return traducoes[statusLower];
    }
    
    // Busca parcial
    for (const [key, value] of Object.entries(traducoes)) {
        if (statusLower.includes(key.replace(/_/g, ' '))) {
            return value;
        }
    }
    
    // Retorna o status original formatado se não encontrar tradução
    return status.replace(/_/g, ' ').split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
}

// ================================
// NAVEGAÇÃO ENTRE PÁGINAS
// ================================

function setupNavigation() {
    const navTabs = document.querySelectorAll('.nav-tab');
    const pages = document.querySelectorAll('.page');
    
    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const pageId = tab.getAttribute('data-page');
            
            navTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            pages.forEach(p => p.classList.remove('active'));
            const targetPage = document.getElementById(pageId);
            if (targetPage) {
                targetPage.classList.add('active');
            }
            
            if (pageId === 'visualizar-comissoes') {
                buscarComissoes();
            } else if (pageId === 'configuracoes') {
                initConfiguracoes();
            }
        });
    });
}

// ================================
// PÁGINA: CONSULTA POR EMPREENDIMENTO
// ================================

async function setupEmpreendimentoPage() {
    const buildingSelect = document.getElementById('buildingSelect');
    const contractSelect = document.getElementById('contractSelect');
    
    if (!buildingSelect) return;
    
    try {
        const response = await fetchComRetry('/api/empreendimentos');
        if (!response.ok) {
            console.error('Erro na resposta da API empreendimentos:', response.status);
            return;
        }
        const empreendimentos = await response.json();
        
        if (empreendimentos.erro) {
            console.error('Erro ao carregar empreendimentos:', empreendimentos.erro);
            showAlert('Erro ao carregar empreendimentos: ' + empreendimentos.erro, 'error');
            return;
        }
        
        dadosEmpreendimentos = empreendimentos;
        
        buildingSelect.innerHTML = '<option value="">Selecione um empreendimento</option>';
        empreendimentos.forEach(emp => {
            const option = document.createElement('option');
            option.value = emp.sienge_id || emp.id;
            option.textContent = emp.nome;
            buildingSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar empreendimentos:', error);
        showAlert('Erro ao carregar empreendimentos', 'error');
    }
    
    buildingSelect.addEventListener('change', async () => {
        const buildingId = buildingSelect.value;
        const loadingContracts = document.getElementById('loadingContracts');
        const contractInfo = document.getElementById('contractInfo');
        
        if (!buildingId) {
            contractSelect.disabled = true;
            contractSelect.innerHTML = '<option value="">Selecione um contrato</option>';
            if (contractInfo) contractInfo.classList.add('hidden');
            return;
        }
        
        showLoading('loadingContracts');
        contractSelect.disabled = true;
        if (contractInfo) contractInfo.classList.add('hidden');
        
        try {
            const response = await fetchComRetry(`/api/contratos?building_id=${buildingId}`);
            if (!response.ok) {
                console.error('Erro na resposta da API contratos:', response.status);
                hideLoading('loadingContracts');
                return;
            }
            const contratos = await response.json();
            
            if (contratos.erro) {
                console.error('Erro ao carregar contratos:', contratos.erro);
                showAlert('Erro ao carregar contratos: ' + contratos.erro, 'error');
                hideLoading('loadingContracts');
                return;
            }
            
            dadosContratos = contratos;
            
            contractSelect.innerHTML = '<option value="">Selecione um contrato</option>';
            contratos.forEach(contrato => {
                const option = document.createElement('option');
                option.value = contrato.numero_contrato;
                option.dataset.buildingId = buildingId;
                const unidadeDisplay = extrairNumeroLote(contrato.unidade || contrato.unidades);
                option.textContent = `Lote ${unidadeDisplay || contrato.numero_contrato} - ${corrigirEspacamentoNome(contrato.nome_cliente)}`;
                contractSelect.appendChild(option);
            });
            
            contractSelect.disabled = false;
        } catch (error) {
            console.error('Erro ao carregar contratos:', error);
            showAlert('Erro ao carregar contratos', 'error');
        }
        
        hideLoading('loadingContracts');
    });
    
    if (contractSelect) {
        contractSelect.addEventListener('change', async () => {
            const numeroContrato = contractSelect.value;
            const buildingId = buildingSelect.value;
            
            if (!numeroContrato || !buildingId) {
                const contractInfo = document.getElementById('contractInfo');
                if (contractInfo) contractInfo.classList.add('hidden');
                return;
            }
            
            showLoading('loadingInfo');
            
            try {
                const response = await fetchComRetry(`/api/contrato-info?numero_contrato=${numeroContrato}&building_id=${buildingId}`);
                const info = await response.json();
                
                if (info.erro) {
                    showAlert(info.erro, 'error');
                } else {
                    displayContractInfo(info);
                }
            } catch (error) {
                console.error('Erro ao carregar info do contrato:', error);
                showAlert('Erro ao carregar informações', 'error');
            }
            
            hideLoading('loadingInfo');
        });
    }
}

function displayContractInfo(info) {
    const contractInfo = document.getElementById('contractInfo');
    if (!contractInfo) return;
    
    document.getElementById('infoNumeroContrato').textContent = info.numero_contrato || '-';
    document.getElementById('infoCliente').textContent = corrigirEspacamentoNome(info.nome_cliente);
    document.getElementById('infoCorretor').textContent = corrigirEspacamentoNome(info.corretor_principal);
    document.getElementById('infoValorComissao').textContent = formatCurrency(info.valor_comissao);
    document.getElementById('infoValorTotal').textContent = formatCurrency(info.valor_total);
    document.getElementById('infoValorVista').textContent = formatCurrency(info.valor_a_vista || info.valor_total);
    document.getElementById('infoValorITBI').textContent = formatCurrency(info.valor_itbi);
    document.getElementById('infoValorPago').textContent = formatCurrency(info.valor_pago);
    
    const gatilhoSection = document.getElementById('gatilhoInfo');
    if (gatilhoSection) {
        document.getElementById('infoRegraGatilho').textContent = info.regra_gatilho || '10% + ITBI';
        document.getElementById('infoValorGatilho').textContent = formatCurrency(info.valor_gatilho);
        document.getElementById('infoAtingiuGatilho').textContent = info.atingiu_gatilho ? 'SIM' : 'NÃO';
        document.getElementById('infoAtingiuGatilho').className = info.atingiu_gatilho ? 'info-value gatilho-sim' : 'info-value gatilho-nao';
        gatilhoSection.classList.remove('hidden');
    }
    
    contractInfo.classList.remove('hidden');
}

// ================================
// PÁGINA: CONSULTA POR CONTRATO (LOTE)
// ================================

async function setupContratoPage() {
    const loteSearch = document.getElementById('loteSearch');
    const autocompleteResults = document.getElementById('autocompleteResults');
    
    if (!loteSearch) return;
    
    let debounceTimer;
    
    loteSearch.addEventListener('input', async (e) => {
        const query = e.target.value.trim();
        
        clearTimeout(debounceTimer);
        
        if (query.length < 2) {
            autocompleteResults.classList.remove('active');
            autocompleteResults.innerHTML = '';
            return;
        }
        
        debounceTimer = setTimeout(async () => {
            try {
                const response = await fetchComRetry(`/api/buscar-por-lote?lote=${encodeURIComponent(query)}`);
                const contratos = await response.json();
                
                if (contratos && contratos.length > 0) {
                    autocompleteResults.innerHTML = contratos.map(c => {
                        const unidadeDisplay = extrairNumeroLote(c.unidade || c.unidades);
                        return `
                        <div class="autocomplete-item" data-numero="${c.numero_contrato}" data-building="${c.building_id}">
                            <strong>Lote ${unidadeDisplay || c.numero_contrato}</strong> - ${corrigirEspacamentoNome(c.nome_cliente)}<br>
                            <small>${c.sienge_empreendimentos?.nome || ''} - Contrato: ${c.numero_contrato}</small>
                        </div>
                    `}).join('');
                    
                    autocompleteResults.classList.add('active');
                    
                    autocompleteResults.querySelectorAll('.autocomplete-item').forEach(item => {
                        item.addEventListener('click', () => {
                            const numeroContrato = item.dataset.numero;
                            const buildingId = item.dataset.building;
                            selectLoteContrato(numeroContrato, buildingId);
                            autocompleteResults.classList.remove('active');
                            loteSearch.value = numeroContrato;
                        });
                    });
                } else {
                    autocompleteResults.innerHTML = '<div class="autocomplete-item">Nenhum resultado encontrado</div>';
                    autocompleteResults.classList.add('active');
                }
            } catch (error) {
                console.error('Erro na busca:', error);
            }
        }, 300);
    });
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-wrapper')) {
            autocompleteResults.classList.remove('active');
        }
    });
}

async function selectLoteContrato(numeroContrato, buildingId) {
    showLoading('loadingInfoLote');
    const loteInfo = document.getElementById('loteInfo');
    if (loteInfo) loteInfo.classList.add('hidden');
    
    try {
        const response = await fetchComRetry(`/api/contrato-info?numero_contrato=${numeroContrato}&building_id=${buildingId}`);
        const info = await response.json();
        
        if (info.erro) {
            showAlert(info.erro, 'error');
        } else {
            displayLoteInfo(info);
        }
    } catch (error) {
        console.error('Erro ao carregar info do lote:', error);
        showAlert('Erro ao carregar informações', 'error');
    }
    
    hideLoading('loadingInfoLote');
}

function displayLoteInfo(info) {
    const loteInfo = document.getElementById('loteInfo');
    if (!loteInfo) return;
    
    document.getElementById('infoLoteNumero').textContent = info.numero_contrato || '-';
    document.getElementById('infoLoteEmpreendimento').textContent = info.empreendimento_nome || '-';
    document.getElementById('infoLoteCliente').textContent = corrigirEspacamentoNome(info.nome_cliente);
    document.getElementById('infoLoteCorretor').textContent = corrigirEspacamentoNome(info.corretor_principal);
    document.getElementById('infoLoteComissao').textContent = formatCurrency(info.valor_comissao);
    document.getElementById('infoLoteValorTotal').textContent = formatCurrency(info.valor_a_vista || info.valor_total);
    document.getElementById('infoLoteITBI').textContent = formatCurrency(info.valor_itbi);
    document.getElementById('infoLoteValorPago').textContent = formatCurrency(info.valor_pago);
    
    const gatilhoLote = document.getElementById('gatilhoInfoLote');
    if (gatilhoLote) {
        document.getElementById('infoLoteRegraGatilho').textContent = info.regra_gatilho || '10% + ITBI';
        document.getElementById('infoLoteValorGatilho').textContent = formatCurrency(info.valor_gatilho);
        document.getElementById('infoLoteAtingiuGatilho').textContent = info.atingiu_gatilho ? 'SIM' : 'NÃO';
        document.getElementById('infoLoteAtingiuGatilho').className = info.atingiu_gatilho ? 'info-value gatilho-sim' : 'info-value gatilho-nao';
        gatilhoLote.classList.remove('hidden');
    }
    
    loteInfo.classList.remove('hidden');
}

// ================================
// PÁGINA: CONSULTA POR CORRETOR
// ================================

async function setupCorretorPage() {
    const corretorSelect = document.getElementById('corretorSelect');
    if (!corretorSelect) return;
    
    try {
        const response = await fetchComRetry('/api/corretores');
        if (!response.ok) {
            console.error('Erro na resposta da API corretores:', response.status);
            return;
        }
        const corretores = await response.json();
        if (!corretores || corretores.erro) {
            console.error('Erro ao carregar corretores:', corretores?.erro);
            return;
        }
        dadosCorretores = corretores;
        
        corretorSelect.innerHTML = '<option value="">Selecione um corretor</option>';
        corretores.forEach(corretor => {
            const option = document.createElement('option');
            option.value = corretor.sienge_id || corretor.id;
            option.textContent = corretor.nome;
            corretorSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar corretores:', error);
    }
    
    corretorSelect.addEventListener('change', async () => {
        const corretorId = corretorSelect.value;
        const corretorNome = corretorSelect.options[corretorSelect.selectedIndex].text;
        const contratosCorretor = document.getElementById('contratosCorretor');
        const listaContratosCorretor = document.getElementById('listaContratosCorretor');
        
        if (!corretorId) {
            if (contratosCorretor) contratosCorretor.classList.add('hidden');
            return;
        }
        
        showLoading('loadingContratosCorretor');
        if (contratosCorretor) contratosCorretor.classList.add('hidden');
        
        try {
            const response = await fetchComRetry(`/api/contratos-por-corretor?corretor_id=${corretorId}&corretor_nome=${encodeURIComponent(corretorNome)}`);
            const contratos = await response.json();
            
            if (contratos && contratos.length > 0) {
                listaContratosCorretor.innerHTML = contratos.map(c => `
                    <div class="contrato-item">
                        <div class="contrato-header">
                            <div class="contrato-numero">${c.numero_contrato || c.contract_number || '-'} - Lote ${c.unit_name || c.unidade || '-'}</div>
                            <div class="contrato-empreendimento">${c.enterprise_name || c.empreendimento || '-'}</div>
                        </div>
                        <div class="contrato-details">
                            <div class="detail-item">
                                <div class="detail-label">Cliente</div>
                                <div class="detail-value">${corrigirEspacamentoNome(c.customer_name || c.nome_cliente)}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Comissão</div>
                                <div class="detail-value currency">${formatCurrency(c.commission_value || c.valor_comissao)}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Status</div>
                                <div class="detail-value">${traduzirStatusParcela(c.installment_status || c.status_parcela)}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Gatilho</div>
                                <div class="detail-value ${c.atingiu_gatilho ? 'gatilho-sim' : ''}">Atingido: ${c.atingiu_gatilho ? 'Sim' : 'Não'}</div>
                            </div>
                        </div>
                    </div>
                `).join('');
                
                if (contratosCorretor) contratosCorretor.classList.remove('hidden');
            } else {
                listaContratosCorretor.innerHTML = '<p>Nenhum contrato encontrado para este corretor.</p>';
                if (contratosCorretor) contratosCorretor.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Erro ao carregar contratos do corretor:', error);
            showAlert('Erro ao carregar contratos', 'error');
        }
        
        hideLoading('loadingContratosCorretor');
    });
}

// ================================
// PÁGINA: VISUALIZAR COMISSÕES
// ================================

async function carregarStatusParcela() {
    const select = document.getElementById('filtroStatusParcela');
    if (!select) return;
    
    try {
        const response = await fetchComRetry('/api/comissoes/status-parcela');
        const data = await response.json();
        
        if (data.sucesso && data.status) {
            // Manter opção "Todos"
            select.innerHTML = '<option value="">Todos</option>';
            
            // Mapeamento de status traduzidos para valores originais do banco
            const statusMap = new Map();
            
            data.status.forEach(status => {
                const traduzido = traduzirStatusParcela(status);
                // Se ainda não existe este status traduzido, adiciona
                if (!statusMap.has(traduzido)) {
                    statusMap.set(traduzido, status);
                }
            });
            
            // Ordenar e adicionar as opções únicas
            const statusOrdenados = Array.from(statusMap.entries()).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
            
            statusOrdenados.forEach(([traduzido, original]) => {
                const option = document.createElement('option');
                option.value = original;
                option.textContent = traduzido;
                select.appendChild(option);
            });
            
            console.log('Status de parcela carregados (únicos):', statusOrdenados);
        }
    } catch (error) {
        console.error('Erro ao carregar status de parcela:', error);
    }
}

async function buscarComissoes() {
    const loading = document.getElementById('loadingComissoes');
    const tabelaContainer = document.getElementById('tabelaComissoesContainer');
    
    if (loading) loading.style.display = 'block';
    if (tabelaContainer) tabelaContainer.style.display = 'none';
    
    try {
        const statusParcela = document.getElementById('filtroStatusParcela')?.value || '';
        const gatilhoAtingido = document.getElementById('filtroGatilho')?.value || '';
        const statusAprovacao = document.getElementById('filtroStatusAprovacao')?.value || '';
        
        let url = '/api/comissoes/listar?';
        if (statusParcela) url += `status_parcela=${statusParcela}&`;
        if (gatilhoAtingido) url += `gatilho_atingido=${gatilhoAtingido}&`;
        if (statusAprovacao) url += `status_aprovacao=${statusAprovacao}&`;
        
        const response = await fetchComRetry(url);
        const data = await response.json();
        
        if (loading) loading.style.display = 'none';
        
        if (data.sucesso && data.comissoes) {
            renderizarTabelaComissoes(data.comissoes);
            if (tabelaContainer) tabelaContainer.style.display = 'block';
        } else {
            showAlert('Nenhuma comissão encontrada', 'info');
        }
    } catch (error) {
        console.error('Erro ao buscar comissões:', error);
        if (loading) loading.style.display = 'none';
        showAlert('Erro ao carregar comissões', 'error');
    }
}

function renderizarTabelaComissoes(comissoes) {
    const tbody = document.getElementById('corpoTabelaComissoes');
    if (!tbody) return;
    
    comissoesSelecionadas = [];
    atualizarAcoesLote();
    
    tbody.innerHTML = comissoes.map(c => {
        const atingiuGatilho = c.atingiu_gatilho;
        const statusAprovacao = c.status_aprovacao || 'Pendente';
        const isPendente = statusAprovacao === 'Pendente';
        const destacar = isPendente && atingiuGatilho;
        
        return `
            <tr class="${destacar ? 'highlight-pendente-gatilho' : ''}">
                <td>
                    ${isPendente ? `
                        <input type="checkbox" 
                               class="checkbox-comissao" 
                               data-id="${c.id}"
                               onchange="toggleComissaoSelecionada(this)">
                    ` : ''}
                </td>
                <td><span class="badge-status ${getStatusParcelaClass(c.installment_status)}">${traduzirStatusParcela(c.installment_status)}</span></td>
                <td>${corrigirEspacamentoNome(c.broker_nome)}</td>
                <td>${c.enterprise_name || '-'}</td>
                <td>${c.unit_name || '-'}</td>
                <td>${corrigirEspacamentoNome(c.customer_name)}</td>
                <td>${formatCurrency(c.commission_value)}</td>
                <td>${formatCurrency(c.valor_gatilho)}</td>
                <td class="${atingiuGatilho ? 'gatilho-sim' : 'gatilho-nao'}">${atingiuGatilho ? 'SIM' : 'NÃO'}</td>
                <td><span class="badge-status ${getStatusAprovacaoClass(statusAprovacao)}">${statusAprovacao}</span></td>
            </tr>
        `;
    }).join('');
}

function getStatusParcelaClass(status) {
    if (!status) return 'badge-info';
    const s = status.toLowerCase();
    
    // Sucesso (verde)
    if (s.includes('paid') || s.includes('pago') || s.includes('conclu') || s.includes('settled') || s.includes('liquidado') || s.includes('done') || s.includes('finalizado')) {
        return 'badge-success';
    }
    // Perigo (vermelho)
    if (s.includes('overdue') || s.includes('vencido') || s.includes('expired') || s.includes('late') || s.includes('atrasado') || s.includes('cancel') || s.includes('rejected') || s.includes('rejeitado') || s.includes('denied') || s.includes('negado')) {
        return 'badge-danger';
    }
    // Aviso (amarelo/laranja)
    if (s.includes('pending') || s.includes('pendente') || s.includes('aguard') || s.includes('waiting') || s.includes('partial') || s.includes('parcial') || s.includes('processing') || s.includes('progress')) {
        return 'badge-warning';
    }
    // Info (azul)
    if (s.includes('open') || s.includes('aberto') || s.includes('active') || s.includes('ativo') || s.includes('due') || s.includes('vencer') || s.includes('scheduled') || s.includes('agendado')) {
        return 'badge-info';
    }
    
    return 'badge-secondary';
}

function getStatusAprovacaoClass(status) {
    if (!status) return 'badge-info';
    const s = status.toLowerCase();
    if (s.includes('aprovad')) return 'badge-success';
    if (s.includes('pendente de aprovação')) return 'badge-warning';
    if (s.includes('rejeitad')) return 'badge-danger';
    if (s.includes('pag')) return 'badge-info';
    return 'badge-secondary';
}

function toggleComissaoSelecionada(checkbox) {
    const id = parseInt(checkbox.dataset.id);
    
    if (checkbox.checked) {
        if (!comissoesSelecionadas.includes(id)) {
            comissoesSelecionadas.push(id);
        }
    } else {
        comissoesSelecionadas = comissoesSelecionadas.filter(cId => cId !== id);
    }
    
    atualizarAcoesLote();
}

function toggleTodasComissoes() {
    const checkboxPrincipal = document.getElementById('selecionarTodas');
    const checkboxes = document.querySelectorAll('.checkbox-comissao');
    
    comissoesSelecionadas = [];
    
    checkboxes.forEach(cb => {
        cb.checked = checkboxPrincipal.checked;
        if (checkboxPrincipal.checked) {
            comissoesSelecionadas.push(parseInt(cb.dataset.id));
        }
    });
    
    atualizarAcoesLote();
}

function atualizarAcoesLote() {
    const acoesLote = document.getElementById('acoesLote');
    const qtdSelecionadas = document.getElementById('qtdSelecionadas');
    
    if (!acoesLote) return;
    
    if (comissoesSelecionadas.length > 0) {
        acoesLote.classList.remove('hidden');
        if (qtdSelecionadas) qtdSelecionadas.textContent = comissoesSelecionadas.length;
    } else {
        acoesLote.classList.add('hidden');
    }
}

async function enviarParaAprovacao() {
    if (comissoesSelecionadas.length === 0) {
        showAlert('Selecione ao menos uma comissão', 'error');
        return;
    }
    
    if (!confirm(`Enviar ${comissoesSelecionadas.length} comissão(ões) para aprovação da direção?`)) {
        return;
    }
    
    try {
        const response = await fetch('/api/comissoes/enviar-aprovacao', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ comissoes_ids: comissoesSelecionadas })
        });
        
        const data = await response.json();
        
        if (response.ok && data.sucesso) {
            showAlert(data.mensagem || 'Comissões enviadas para aprovação!', 'success');
            comissoesSelecionadas = [];
            atualizarAcoesLote();
            buscarComissoes();
        } else {
            const erro = data.erro || data.mensagem || 'Erro ao enviar para aprovação';
            showAlert(erro, 'error');
            console.error('Erro do servidor:', data);
        }
    } catch (error) {
        console.error('Erro de rede:', error);
        showAlert('Erro de conexão ao enviar para aprovação', 'error');
    }
}

function limparFiltrosComissoes() {
    const filtroStatus = document.getElementById('filtroStatusParcela');
    const filtroGatilho = document.getElementById('filtroGatilho');
    const filtroAprovacao = document.getElementById('filtroStatusAprovacao');
    
    if (filtroStatus) filtroStatus.value = '';
    if (filtroGatilho) filtroGatilho.value = '';
    if (filtroAprovacao) filtroAprovacao.value = '';
    
    buscarComissoes();
}

// ================================
// PÁGINA: CONFIGURAÇÕES
// ================================

function initConfiguracoes() {
    carregarUsuariosConfig();
    carregarCorretoresConfig();
    carregarConfiguracoesEmails();
}

async function carregarUsuariosConfig() {
    const lista = document.getElementById('listaUsuariosConfig');
    if (!lista) return;
    
    try {
        const response = await fetchComRetry('/api/usuarios');
        if (!response.ok) {
            lista.innerHTML = '<p>Erro ao carregar usuários ou sem permissão.</p>';
            return;
        }
        const usuarios = await response.json();
        
        if (usuarios.erro) {
            lista.innerHTML = '<p>Erro: ' + usuarios.erro + '</p>';
            return;
        }
        
        renderizarUsuariosConfig(usuarios);
    } catch (error) {
        console.error('Erro ao carregar usuários:', error);
        lista.innerHTML = '<p>Erro ao carregar usuários.</p>';
    }
}

function renderizarUsuariosConfig(usuarios) {
    const lista = document.getElementById('listaUsuariosConfig');
    if (!lista) return;
    
    if (!usuarios || usuarios.length === 0) {
        lista.innerHTML = '<p>Nenhum usuário cadastrado.</p>';
        return;
    }
    
    lista.innerHTML = `
        <table class="tabela-config">
            <thead>
                <tr>
                    <th>Nome</th>
                    <th>Username</th>
                    <th>Perfil</th>
                    <th>Admin</th>
                    <th>Último Login</th>
                </tr>
            </thead>
            <tbody>
                ${usuarios.map(u => `
                    <tr>
                        <td>${u.nome_completo || '-'}</td>
                        <td>${u.username}</td>
                        <td>${u.perfil || 'Gestor'}</td>
                        <td>${u.is_admin ? 'Sim' : 'Não'}</td>
                        <td>${u.ultimo_login ? formatDate(u.ultimo_login) : 'Nunca'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function carregarCorretoresConfig() {
    const lista = document.getElementById('listaCorretoresConfig');
    if (!lista) return;
    
    try {
        const response = await fetchComRetry('/api/corretores-usuarios');
        const data = await response.json();
        
        if (data.sucesso && data.corretores) {
            renderizarCorretoresConfig(data.corretores);
        }
    } catch (error) {
        console.error('Erro ao carregar corretores:', error);
    }
}

function renderizarCorretoresConfig(corretores) {
    const lista = document.getElementById('listaCorretoresConfig');
    if (!lista) return;
    
    if (corretores.length === 0) {
        lista.innerHTML = '<p>Nenhum corretor cadastrado.</p>';
        return;
    }
    
    lista.innerHTML = `
        <table class="tabela-config">
            <thead>
                <tr>
                    <th>Nome</th>
                    <th>CPF</th>
                    <th>E-mail</th>
                    <th>Último Login</th>
                </tr>
            </thead>
            <tbody>
                ${corretores.map(c => `
                    <tr>
                        <td>${c.nome}</td>
                        <td>${c.cpf}</td>
                        <td>${c.email || '-'}</td>
                        <td>${c.ultimo_login ? formatDate(c.ultimo_login) : 'Nunca'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function carregarConfiguracoesEmails() {
    const lista = document.getElementById('configEmailsList');
    if (!lista) return;
    
    try {
        const response = await fetchComRetry('/api/configuracoes-emails');
        const data = await response.json();
        
        if (data.sucesso && data.configuracoes) {
            renderizarConfiguracoesEmails(data.configuracoes);
        }
    } catch (error) {
        console.error('Erro ao carregar configurações de emails:', error);
    }
}

function renderizarConfiguracoesEmails(configuracoes) {
    const lista = document.getElementById('configEmailsList');
    if (!lista) return;
    
    lista.innerHTML = configuracoes.map(config => `
        <div class="config-email-card">
            <div class="config-email-header">
                <h4>${config.descricao || config.tipo}</h4>
                <button class="btn-editar-email" onclick="abrirModalEditarEmails('${config.tipo}', '${(config.emails || []).join(', ')}')">
                    Editar
                </button>
            </div>
            <div class="config-email-lista">
                ${(config.emails || []).map(email => `<span class="email-tag">${email}</span>`).join('')}
            </div>
        </div>
    `).join('');
}

// ================================
// SINCRONIZAÇÃO
// ================================

async function sincronizarDados() {
    const btn = document.getElementById('syncButton');
    const status = document.getElementById('syncStatus');
    
    if (btn) btn.disabled = true;
    if (status) status.textContent = 'Sincronizando...';
    
    try {
        const response = await fetch('/api/sincronizar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (data.sucesso) {
            if (status) status.textContent = 'Sincronizado!';
            showAlert('Dados sincronizados com sucesso!', 'success');
        } else {
            if (status) status.textContent = 'Erro';
            showAlert(data.erro || 'Erro na sincronização', 'error');
        }
    } catch (error) {
        console.error('Erro:', error);
        if (status) status.textContent = 'Erro';
        showAlert('Erro na sincronização', 'error');
    }
    
    if (btn) btn.disabled = false;
    
    setTimeout(() => {
        if (status) status.textContent = '';
    }, 3000);
}

// ================================
// EXPORTAÇÕES (placeholder)
// ================================

window.exportarComissoes = function(formato) {
    showAlert(`Exportando comissões em ${formato.toUpperCase()}...`, 'info');
};

window.exportarContratos = function(formato) {
    showAlert(`Exportando contratos em ${formato.toUpperCase()}...`, 'info');
};

window.exportarITBI = function(formato) {
    showAlert(`Exportando ITBI em ${formato.toUpperCase()}...`, 'info');
};

window.exportarValoresPagos = function(formato) {
    showAlert(`Exportando valores pagos em ${formato.toUpperCase()}...`, 'info');
};

window.exportarRelatorioCompleto = function(formato) {
    showAlert(`Exportando relatório completo em ${formato.toUpperCase()}...`, 'info');
};

window.exportarRelatorioGeral = function(formato) {
    showAlert(`Exportando relatório geral em ${formato.toUpperCase()}...`, 'info');
};

// ================================
// MODAL NOVO USUARIO
// ================================

window.abrirModalNovoUsuario = function() {
    const modal = document.getElementById('modalNovoUsuario');
    if (modal) {
        modal.style.display = 'flex';
        // Limpar formulario
        document.getElementById('formNovoUsuario').reset();
    }
};

window.fecharModalNovoUsuario = function() {
    const modal = document.getElementById('modalNovoUsuario');
    if (modal) {
        modal.style.display = 'none';
    }
};

window.salvarNovoUsuario = async function(event) {
    event.preventDefault();
    
    const username = document.getElementById('novoUsername').value.trim().toLowerCase();
    const nome_completo = document.getElementById('novoNomeCompleto').value.trim();
    const senha = document.getElementById('novoSenha').value;
    const perfil = document.getElementById('novoPerfil').value;
    const is_admin = document.getElementById('novoIsAdmin').checked;
    
    if (!username || !nome_completo || !senha) {
        showAlert('Preencha todos os campos obrigatorios', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/usuarios/criar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                nome_completo,
                senha,
                perfil,
                is_admin
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showAlert('Usuário criado com sucesso!', 'success');
            fecharModalNovoUsuario();
            carregarUsuariosConfig(); // Recarregar lista
        } else {
            showAlert(result.erro || 'Erro ao criar usuário', 'error');
        }
    } catch (error) {
        console.error('Erro ao criar usuario:', error);
        showAlert('Erro ao criar usuário', 'error');
    }
};

// Fechar modal ao clicar fora
document.addEventListener('click', (e) => {
    const modal = document.getElementById('modalNovoUsuario');
    if (e.target === modal) {
        fecharModalNovoUsuario();
    }
});

// ================================
// INICIALIZAÇÃO
// ================================

async function inicializarSistema() {
    try {
        // Setup navegacao primeiro (sincrono)
        setupNavigation();
        
        // Setup do botao de sincronizacao
        const syncButton = document.getElementById('syncButton');
        if (syncButton) {
            syncButton.addEventListener('click', sincronizarDados);
        }
        
        // Inicializar paginas de forma assincrona com tratamento de erro individual
        await Promise.allSettled([
            setupEmpreendimentoPage().catch(e => console.warn('Erro ao setup empreendimento:', e)),
            setupContratoPage().catch(e => console.warn('Erro ao setup contrato:', e)),
            setupCorretorPage().catch(e => console.warn('Erro ao setup corretor:', e)),
            carregarStatusParcela().catch(e => console.warn('Erro ao carregar status parcela:', e))
        ]);
        
        console.log('Sistema de Comissoes Young inicializado!');
    } catch (error) {
        console.error('Erro na inicializacao:', error);
    }
}

// Garantir que o DOM esta completamente carregado
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarSistema);
} else {
    // DOM ja carregado
    inicializarSistema();
}
