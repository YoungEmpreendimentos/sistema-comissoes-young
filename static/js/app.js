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
let observacoesComissoes = {}; // Armazena observações por ID de comissão
let comissaoAtualObservacao = null; // ID da comissão sendo editada

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
 * @returns {string} - Numero do lote formatado (apenas o número, sem "Lote")
 */
function extrairNumeroLote(unidadeData) {
    if (!unidadeData) return '';
    
    let resultado = '';
    
    if (Array.isArray(unidadeData)) {
        // Array de objetos: extrair campo 'name'
        resultado = unidadeData.map(u => u.name || u).join(', ');
    } else if (typeof unidadeData === 'string') {
        // Tentar parse se for JSON string
        try {
            const parsed = JSON.parse(unidadeData);
            if (Array.isArray(parsed)) {
                resultado = parsed.map(u => u.name || u).join(', ');
            } else {
                resultado = unidadeData;
            }
        } catch {
            resultado = unidadeData;
        }
    } else {
        resultado = String(unidadeData);
    }
    
    // Remover prefixo "Lote" se existir (para evitar "Lote Lote")
    resultado = resultado.replace(/^Lote\s*/i, '').trim();
    
    return resultado;
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
            } else if (pageId === 'relatorio-comissoes') {
                carregarFiltrosRelatorio();
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
                // Formato padrão: "Lote [Numero] - [Nome Cliente]"
                const loteNumero = unidadeDisplay || contrato.numero_contrato;
                option.textContent = `Lote ${loteNumero} - ${corrigirEspacamentoNome(contrato.nome_cliente)}`;
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
                        const loteNumero = unidadeDisplay || c.numero_contrato;
                        return `
                        <div class="autocomplete-item" data-numero="${c.numero_contrato}" data-building="${c.building_id}">
                            <strong>Lote ${loteNumero}</strong> - ${corrigirEspacamentoNome(c.nome_cliente)}<br>
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

// ================================
// FUNÇÕES DE MULTI-SELECT
// ================================

function toggleMultiSelect(filtroId) {
    const container = document.getElementById(`container${capitalizeFirst(filtroId)}`);
    if (!container) return;
    
    // Fechar outros dropdowns abertos
    document.querySelectorAll('.multi-select-container.open').forEach(c => {
        if (c !== container) c.classList.remove('open');
    });
    
    container.classList.toggle('open');
}

function capitalizeFirst(str) {
    // Converte 'statusParcela' para 'StatusParcela'
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function updateMultiSelectText(filtroId) {
    const container = document.getElementById(`container${capitalizeFirst(filtroId)}`);
    const textElement = document.getElementById(`text${capitalizeFirst(filtroId)}`);
    if (!container || !textElement) return;
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
    
    if (checkboxes.length === 0) {
        textElement.textContent = 'Todos';
    } else if (checkboxes.length === 1) {
        // Pegar o texto do label (o texto após o checkbox)
        const label = checkboxes[0].closest('label');
        textElement.textContent = label ? label.textContent.trim() : checkboxes[0].value;
    } else {
        textElement.textContent = `${checkboxes.length} selecionados`;
    }
}

function getMultiSelectValues(filtroId) {
    const container = document.getElementById(`container${capitalizeFirst(filtroId)}`);
    if (!container) return [];
    
    const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

function clearMultiSelect(filtroId) {
    const container = document.getElementById(`container${capitalizeFirst(filtroId)}`);
    if (!container) return;
    
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
    });
    updateMultiSelectText(filtroId);
}

// Fechar dropdowns ao clicar fora
document.addEventListener('click', function(e) {
    if (!e.target.closest('.multi-select-container')) {
        document.querySelectorAll('.multi-select-container.open').forEach(c => {
            c.classList.remove('open');
        });
    }
});

// ================================
// PÁGINA: VISUALIZAR COMISSÕES
// ================================

async function buscarComissoes() {
    const loading = document.getElementById('loadingComissoes');
    const tabelaContainer = document.getElementById('tabelaComissoesContainer');
    
    if (loading) loading.style.display = 'block';
    if (tabelaContainer) tabelaContainer.style.display = 'none';
    
    try {
        // Obter valores dos multi-selects
        const statusParcela = getMultiSelectValues('statusParcela');
        const gatilhoAtingido = getMultiSelectValues('gatilho');
        const statusAprovacao = getMultiSelectValues('statusAprovacao');
        
        // Obter filtros de data
        const dataInicio = document.getElementById('filtroDataInicio')?.value || '';
        const dataFim = document.getElementById('filtroDataFim')?.value || '';
        
        let url = '/api/comissoes/listar?';
        
        // Enviar arrays como valores separados por vírgula
        if (statusParcela.length > 0) url += `status_parcela=${statusParcela.join(',')}&`;
        if (gatilhoAtingido.length > 0) url += `gatilho_atingido=${gatilhoAtingido.join(',')}&`;
        if (statusAprovacao.length > 0) url += `status_aprovacao=${statusAprovacao.join(',')}&`;
        if (dataInicio) url += `data_inicio=${dataInicio}&`;
        if (dataFim) url += `data_fim=${dataFim}&`;
        
        const response = await fetchComRetry(url);
        const data = await response.json();
        
        if (loading) loading.style.display = 'none';
        
        if (data.sucesso && data.comissoes) {
            renderizarTabelaComissoes(data.comissoes);
            if (tabelaContainer) tabelaContainer.style.display = 'block';
            
            // Mostrar contagem de resultados
            const total = data.total || data.comissoes.length;
            showAlert(`${total} comissões encontradas`, 'info');
        } else {
            showAlert('Nenhuma comissão encontrada', 'info');
            const tbody = document.getElementById('corpoTabelaComissoes');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="13" style="text-align: center; padding: 2rem; color: #888;">Nenhuma comissão encontrada com os filtros selecionados</td></tr>';
            }
            if (tabelaContainer) tabelaContainer.style.display = 'block';
        }
    } catch (error) {
        console.error('Erro ao buscar comissões:', error);
        if (loading) loading.style.display = 'none';
        showAlert('Erro ao carregar comissões', 'error');
    }
}

function traduzirStatusAprovacao(status) {
    if (!status) return 'Aguardando liberação';
    
    const statusLower = status.toLowerCase().trim();
    
    if (statusLower === 'pendente') return 'Aguardando liberação';
    if (statusLower === 'pendente de aprovação') return 'Em análise da direção';
    
    // Retorna o status original para outros casos (Aprovada, Rejeitada, etc.)
    return status;
}

function renderizarTabelaComissoes(comissoes) {
    const tbody = document.getElementById('corpoTabelaComissoes');
    if (!tbody) return;
    
    comissoesSelecionadas = [];
    atualizarAcoesLote();
    
    tbody.innerHTML = comissoes.map(c => {
        const atingiuGatilho = c.atingiu_gatilho;
        const statusAprovacao = c.status_aprovacao || 'Pendente';
        const statusAprovacaoExibicao = traduzirStatusAprovacao(statusAprovacao);
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
                <td>${formatDate(c.data_contrato)}</td>
                <td>${corrigirEspacamentoNome(c.customer_name)}</td>
                <td>${formatCurrency(c.valor_comissao || c.commission_value)}</td>
                <td>${formatCurrency(c.valor_pago || 0)}</td>
                <td>${formatCurrency(c.valor_gatilho)}</td>
                <td class="${atingiuGatilho ? 'gatilho-sim' : 'gatilho-nao'}">${atingiuGatilho ? 'SIM' : 'NÃO'}</td>
                <td><span class="badge-status ${getStatusAprovacaoClass(statusAprovacao)}">${statusAprovacaoExibicao}</span></td>
                <td style="text-align: center;">
                    ${isPendente ? `
                        <button 
                            class="btn-observacao ${observacoesComissoes[c.id] ? 'tem-observacao' : ''}" 
                            onclick="abrirModalObservacaoComissao(${c.id}, '${corrigirEspacamentoNome(c.broker_nome)}', '${c.unit_name || '-'}')"
                            title="Adicionar observações para a direção">
                            💬
                        </button>
                    ` : '-'}
                </td>
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
    if (!status) return 'badge-secondary';
    const s = status.toLowerCase();
    if (s.includes('aprovad')) return 'badge-success';
    if (s.includes('pendente de aprovação')) return 'badge-warning';
    if (s.includes('rejeitad')) return 'badge-danger';
    if (s.includes('pag')) return 'badge-info';
    if (s === 'pendente') return 'badge-secondary';
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

// ==================== OBSERVAÇÕES PARA DIREÇÃO ====================

window.abrirModalObservacaoComissao = function(comissaoId, nomeCorretor, lote) {
    comissaoAtualObservacao = comissaoId;
    const modal = document.getElementById('modalObservacaoComissao');
    const textarea = document.getElementById('textareaObservacaoComissao');
    const info = document.getElementById('infoComissaoModalObs');
    
    // Preencher informações da comissão
    info.innerHTML = `<strong>Corretor:</strong> ${nomeCorretor} | <strong>Lote:</strong> ${lote}`;
    
    // Carregar observação existente se houver
    textarea.value = observacoesComissoes[comissaoId] || '';
    
    modal.classList.add('active');
    setTimeout(() => textarea.focus(), 100);
};

window.fecharModalObservacaoComissao = function() {
    const modal = document.getElementById('modalObservacaoComissao');
    modal.classList.remove('active');
    comissaoAtualObservacao = null;
};

window.salvarObservacaoComissao = function() {
    if (!comissaoAtualObservacao) return;
    
    const textarea = document.getElementById('textareaObservacaoComissao');
    const observacao = textarea.value.trim();
    
    if (observacao) {
        observacoesComissoes[comissaoAtualObservacao] = observacao;
        showAlert('Observação salva! Será enviada à direção.', 'success');
    } else {
        // Remove observação se o campo estiver vazio
        delete observacoesComissoes[comissaoAtualObservacao];
    }
    
    // Atualizar visual do botão
    const btn = document.querySelector(`.btn-observacao[onclick*="${comissaoAtualObservacao}"]`);
    if (btn) {
        if (observacao) {
            btn.classList.add('tem-observacao');
        } else {
            btn.classList.remove('tem-observacao');
        }
    }
    
    fecharModalObservacaoComissao();
};

async function enviarParaAprovacao() {
    if (comissoesSelecionadas.length === 0) {
        showAlert('Selecione ao menos uma comissão', 'error');
        return;
    }
    
    if (!confirm(`Enviar ${comissoesSelecionadas.length} comissão(ões) para aprovação da direção?`)) {
        return;
    }
    
    try {
        // Preparar observações das comissões selecionadas
        const observacoes = {};
        comissoesSelecionadas.forEach(id => {
            if (observacoesComissoes[id]) {
                observacoes[id] = observacoesComissoes[id];
            }
        });
        
        const response = await fetch('/api/comissoes/enviar-aprovacao', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                comissoes_ids: comissoesSelecionadas,
                observacoes: observacoes
            })
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
    // Limpar multi-selects
    clearMultiSelect('statusParcela');
    clearMultiSelect('gatilho');
    clearMultiSelect('statusAprovacao');
    
    // Limpar campos de data
    const dataInicio = document.getElementById('filtroDataInicio');
    const dataFim = document.getElementById('filtroDataFim');
    if (dataInicio) dataInicio.value = '';
    if (dataFim) dataFim.value = '';
    
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
                    <th style="text-align: center;">Ações</th>
                </tr>
            </thead>
            <tbody>
                ${usuarios.map(u => `
                    <tr>
                        <td>${u.nome_completo || '-'}</td>
                        <td>${u.username}</td>
                        <td>
                            <select class="form-select-mini" onchange="alterarPerfilUsuario(${u.id}, this.value)" style="padding: 0.25rem 0.5rem; font-size: 0.85rem;">
                                <option value="Gestor" ${u.perfil === 'Gestor' ? 'selected' : ''}>Gestor</option>
                                <option value="Direção" ${u.perfil === 'Direção' ? 'selected' : ''}>Direção</option>
                            </select>
                        </td>
                        <td>${u.is_admin ? 'Sim' : 'Não'}</td>
                        <td>${u.ultimo_login ? formatDate(u.ultimo_login) : 'Nunca'}</td>
                        <td style="text-align: center;">
                            <button class="btn-action btn-edit" onclick="abrirModalEditarUsuario(${u.id}, '${u.username}', '${u.nome_completo || ''}')" title="Editar">✏️</button>
                            <button class="btn-action btn-delete" onclick="confirmarExcluirUsuario(${u.id}, '${u.nome_completo || u.username}')" title="Excluir">🗑️</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Funções de edição de usuário
async function alterarPerfilUsuario(userId, novoPerfil) {
    try {
        const response = await fetch(`/api/usuarios/${userId}/perfil`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ perfil: novoPerfil })
        });
        
        if (response.ok) {
            mostrarNotificacao('Perfil atualizado com sucesso!', 'success');
        } else {
            mostrarNotificacao('Erro ao atualizar perfil', 'error');
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarNotificacao('Erro ao atualizar perfil', 'error');
    }
}

function abrirModalEditarUsuario(userId, username, nomeCompleto) {
    const novaSenha = prompt(`Redefinir senha para ${nomeCompleto || username}?\n\nDigite a nova senha (deixe vazio para cancelar):`);
    
    if (novaSenha === null || novaSenha === '') return;
    
    if (novaSenha.length < 6) {
        alert('A senha deve ter pelo menos 6 caracteres!');
        return;
    }
    
    redefinirSenhaUsuario(userId, novaSenha);
}

async function redefinirSenhaUsuario(userId, novaSenha) {
    try {
        const response = await fetch(`/api/usuarios/${userId}/senha`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nova_senha: novaSenha })
        });
        
        if (response.ok) {
            mostrarNotificacao('Senha redefinida com sucesso!', 'success');
        } else {
            mostrarNotificacao('Erro ao redefinir senha', 'error');
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarNotificacao('Erro ao redefinir senha', 'error');
    }
}

async function confirmarExcluirUsuario(userId, nome) {
    if (!confirm(`Tem certeza que deseja desativar o usuário "${nome}"?\n\nEle não poderá mais acessar o sistema.`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/usuarios/${userId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            mostrarNotificacao('Usuário desativado com sucesso!', 'success');
            carregarUsuariosConfig();
        } else {
            mostrarNotificacao('Erro ao desativar usuário', 'error');
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarNotificacao('Erro ao desativar usuário', 'error');
    }
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
        lista.innerHTML = '<p>Nenhum corretor cadastrado no sistema.</p>';
        return;
    }
    
    lista.innerHTML = `
        <table class="tabela-config">
            <thead>
                <tr>
                    <th>Nome</th>
                    <th>CPF/CNPJ</th>
                    <th>E-mail</th>
                    <th>Cadastro</th>
                    <th>Último Login</th>
                    <th style="text-align: center;">Ações</th>
                </tr>
            </thead>
            <tbody>
                ${corretores.map(c => `
                    <tr>
                        <td>${c.nome}</td>
                        <td>${c.cpf}</td>
                        <td>${c.email || '-'}</td>
                        <td>${c.cadastro_em ? formatDate(c.cadastro_em) : '-'}</td>
                        <td>${c.ultimo_login ? formatDate(c.ultimo_login) : 'Nunca'}</td>
                        <td style="text-align: center;">
                            <button class="btn-action btn-edit" onclick="abrirModalEditarCorretor(${c.sienge_id}, '${c.nome}', '${c.email || ''}')" title="Editar">✏️</button>
                            <button class="btn-action btn-delete" onclick="confirmarExcluirCorretor(${c.sienge_id}, '${c.nome}')" title="Remover Acesso">🗑️</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Funções de edição de corretor
function abrirModalEditarCorretor(siengeId, nome, email) {
    const opcao = prompt(`Editar corretor: ${nome}\n\n1 - Redefinir senha\n2 - Alterar e-mail\n\nDigite a opção (1 ou 2):`);
    
    if (opcao === '1') {
        const novaSenha = prompt('Digite a nova senha (mínimo 6 caracteres):');
        if (novaSenha && novaSenha.length >= 6) {
            redefinirSenhaCorretor(siengeId, novaSenha);
        } else if (novaSenha) {
            alert('A senha deve ter pelo menos 6 caracteres!');
        }
    } else if (opcao === '2') {
        const novoEmail = prompt('Digite o novo e-mail:', email);
        if (novoEmail && novoEmail !== email) {
            alterarEmailCorretor(siengeId, novoEmail);
        }
    }
}

async function redefinirSenhaCorretor(siengeId, novaSenha) {
    try {
        const response = await fetch(`/api/corretores/${siengeId}/senha`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nova_senha: novaSenha })
        });
        
        if (response.ok) {
            mostrarNotificacao('Senha do corretor redefinida com sucesso!', 'success');
        } else {
            mostrarNotificacao('Erro ao redefinir senha', 'error');
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarNotificacao('Erro ao redefinir senha', 'error');
    }
}

async function alterarEmailCorretor(siengeId, novoEmail) {
    try {
        const response = await fetch(`/api/corretores/${siengeId}/email`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: novoEmail })
        });
        
        if (response.ok) {
            mostrarNotificacao('E-mail atualizado com sucesso!', 'success');
            carregarCorretoresConfig();
        } else {
            mostrarNotificacao('Erro ao atualizar e-mail', 'error');
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarNotificacao('Erro ao atualizar e-mail', 'error');
    }
}

async function confirmarExcluirCorretor(siengeId, nome) {
    if (!confirm(`Tem certeza que deseja remover o acesso do corretor "${nome}"?\n\nEle não poderá mais fazer login no sistema.`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/corretores/${siengeId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            mostrarNotificacao('Acesso do corretor removido com sucesso!', 'success');
            carregarCorretoresConfig();
        } else {
            mostrarNotificacao('Erro ao remover acesso', 'error');
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarNotificacao('Erro ao remover acesso', 'error');
    }
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
    
    const modalRegra = document.getElementById('modalRegra');
    if (e.target === modalRegra) {
        fecharModalRegra();
    }
    
    const modalConfirmacao = document.getElementById('modalConfirmacaoExclusao');
    if (e.target === modalConfirmacao) {
        fecharModalConfirmacao();
    }
    
    const modalObsComissao = document.getElementById('modalObservacaoComissao');
    if (e.target === modalObsComissao) {
        fecharModalObservacaoComissao();
    }
});

// Fechar modais com ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modalObsComissao = document.getElementById('modalObservacaoComissao');
        if (modalObsComissao && modalObsComissao.classList.contains('active')) {
            fecharModalObservacaoComissao();
        }
    }
});

// ================================
// REGRAS DE COMISSÃO (GATILHO E FATURAMENTO)
// ================================

let regrasGatilho = [];
let regraParaExcluir = null;

// Função para mostrar aba de configuração
window.mostrarConfigTab = function(tabId) {
    // Esconder todas as abas
    const tabs = ['configUsuarios', 'configCorretores', 'configEmails', 'configRegras'];
    tabs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    
    // Mostrar a aba selecionada
    const selectedTab = document.getElementById(tabId);
    if (selectedTab) {
        selectedTab.style.display = 'block';
    }
    
    // Atualizar botões ativos
    document.querySelectorAll('.config-tab').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.config === tabId) {
            btn.classList.add('active');
        }
    });
};

// Toggle entre tipo de regra (gatilho vs faturamento)
window.toggleTipoRegra = function() {
    const tipoSelecionado = document.querySelector('input[name="tipoRegra"]:checked')?.value || 'gatilho';
    const camposGatilho = document.getElementById('camposGatilho');
    const camposFaturamento = document.getElementById('camposFaturamento');
    
    if (tipoSelecionado === 'gatilho') {
        camposGatilho.style.display = 'block';
        camposFaturamento.style.display = 'none';
    } else {
        camposGatilho.style.display = 'none';
        camposFaturamento.style.display = 'block';
    }
};

// Carregar regras de gatilho (usando tabela existente regras_gatilho)
window.carregarRegrasComissao = async function() {
    const tbody = document.getElementById('corpoTabelaRegras');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: #999;"><div class="spinner" style="margin: 0 auto;"></div><p>Carregando regras...</p></td></tr>';
    
    try {
        const response = await fetch('/api/regras-gatilho');
        const data = await response.json();
        
        if (Array.isArray(data)) {
            regrasGatilho = data;
            renderizarTabelaRegras();
        } else if (data.status === 'erro') {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: #f87171;">Erro ao carregar regras: ' + (data.mensagem || 'Erro desconhecido') + '</td></tr>';
        } else {
            regrasGatilho = [];
            renderizarTabelaRegras();
        }
    } catch (error) {
        console.error('Erro ao carregar regras:', error);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: #f87171;">Erro ao carregar regras de comissão</td></tr>';
    }
};

// Formatar valor em moeda
function formatarMoeda(valor) {
    if (!valor && valor !== 0) return '-';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

// Renderizar tabela de regras
function renderizarTabelaRegras() {
    const tbody = document.getElementById('corpoTabelaRegras');
    if (!tbody) return;
    
    if (regrasGatilho.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 3rem; color: #666;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="1.5" style="margin-bottom: 1rem;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                    <p style="margin-bottom: 0.5rem;">Nenhuma regra de comissão cadastrada</p>
                    <p style="font-size: 0.85rem; color: #555;">Clique em "Nova Regra" para adicionar</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = regrasGatilho.map(regra => {
        const tipoRegra = regra.tipo_regra || 'gatilho';
        let regraFormatada = '';
        let tipoBadge = '';
        
        if (tipoRegra === 'faturamento') {
            // Regra de faturamento
            tipoBadge = '<span style="background: rgba(96, 165, 250, 0.15); color: #60a5fa; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 500;">Faturamento</span>';
            regraFormatada = `
                <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                    <code style="background: #2a2a2a; padding: 0.25rem 0.5rem; border-radius: 4px; color: #60a5fa; font-size: 0.85rem;">Mín. ${formatarMoeda(regra.faturamento_minimo)} → ${regra.percentual}%</code>
                    ${regra.percentual_auditoria ? `<code style="background: #2a2a2a; padding: 0.25rem 0.5rem; border-radius: 4px; color: #fbbf24; font-size: 0.8rem;">+ ${regra.percentual_auditoria}% auditoria</code>` : ''}
                </div>
            `;
        } else {
            // Regra de gatilho (padrão)
            tipoBadge = '<span style="background: rgba(74, 222, 128, 0.15); color: #4ade80; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 500;">Gatilho</span>';
            const regraTexto = regra.inclui_itbi ? `${regra.percentual}% + ITBI` : `${regra.percentual}%`;
            regraFormatada = `<code style="background: #2a2a2a; padding: 0.25rem 0.5rem; border-radius: 4px; color: #4ade80; font-size: 0.85rem;">${regraTexto}</code>`;
        }
        
        return `
        <tr style="border-bottom: 1px solid #333; transition: background 0.2s;" onmouseover="this.style.background='#1a1a1a'" onmouseout="this.style.background='transparent'">
            <td style="padding: 1rem; font-weight: 500;">${regra.nome || '-'}</td>
            <td style="padding: 1rem;">${tipoBadge}</td>
            <td style="padding: 1rem;">${regraFormatada}</td>
            <td style="padding: 1rem; color: #999; font-size: 0.9rem;">${regra.descricao || '-'}</td>
            <td style="padding: 1rem; text-align: center;">
                <span style="display: inline-block; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.85rem; ${regra.ativo !== false ? 'background: rgba(74, 222, 128, 0.2); color: #4ade80;' : 'background: rgba(248, 113, 113, 0.2); color: #f87171;'}">
                    ${regra.ativo !== false ? 'Ativa' : 'Inativa'}
                </span>
            </td>
            <td style="padding: 1rem; text-align: center;">
                <div style="display: flex; gap: 0.5rem; justify-content: center;">
                    <button onclick="editarRegra(${regra.id})" class="btn-icon" style="background: #2a2a2a; border: 1px solid #444; padding: 0.5rem 0.75rem; border-radius: 4px; cursor: pointer; color: #fff; font-size: 0.8rem; transition: all 0.2s;" title="Editar" onmouseover="this.style.background='#333'" onmouseout="this.style.background='#2a2a2a'">
                        Editar
                    </button>
                    <button onclick="excluirRegra(${regra.id})" class="btn-icon" style="background: transparent; border: 1px solid #444; padding: 0.5rem 0.75rem; border-radius: 4px; cursor: pointer; color: #888; font-size: 0.8rem; transition: all 0.2s;" title="Excluir" onmouseover="this.style.color='#f87171';this.style.borderColor='#f87171'" onmouseout="this.style.color='#888';this.style.borderColor='#444'">
                        Excluir
                    </button>
                </div>
            </td>
        </tr>
    `}).join('');
}

// Abrir modal para nova regra
window.abrirModalNovaRegra = function() {
    document.getElementById('tituloModalRegra').textContent = 'Nova Regra de Comissão';
    document.getElementById('regraId').value = '';
    document.getElementById('regraNome').value = '';
    
    // Reset tipo de regra para gatilho
    document.querySelector('input[name="tipoRegra"][value="gatilho"]').checked = true;
    toggleTipoRegra();
    
    // Campos de gatilho
    document.getElementById('regraPercentual').value = '10';
    document.getElementById('regraIncluiItbi').checked = true;
    
    // Campos de faturamento
    document.getElementById('regraFaturamentoMinimo').value = '120000';
    document.getElementById('regraPercentualFaturamento').value = '5';
    document.getElementById('regraPercentualAuditoria').value = '1';
    
    document.getElementById('regraDescricao').value = '';
    
    document.getElementById('modalRegra').style.display = 'flex';
};

// Editar regra existente
window.editarRegra = function(id) {
    const regra = regrasGatilho.find(r => r.id === id);
    if (!regra) return;
    
    document.getElementById('tituloModalRegra').textContent = 'Editar Regra de Comissão';
    document.getElementById('regraId').value = regra.id;
    document.getElementById('regraNome').value = regra.nome || '';
    document.getElementById('regraDescricao').value = regra.descricao || '';
    
    // Definir tipo de regra
    const tipoRegra = regra.tipo_regra || 'gatilho';
    document.querySelector(`input[name="tipoRegra"][value="${tipoRegra}"]`).checked = true;
    toggleTipoRegra();
    
    if (tipoRegra === 'faturamento') {
        document.getElementById('regraFaturamentoMinimo').value = regra.faturamento_minimo || 120000;
        document.getElementById('regraPercentualFaturamento').value = regra.percentual || 5;
        document.getElementById('regraPercentualAuditoria').value = regra.percentual_auditoria || 0;
    } else {
        document.getElementById('regraPercentual').value = regra.percentual || 10;
        document.getElementById('regraIncluiItbi').checked = regra.inclui_itbi !== false;
    }
    
    document.getElementById('modalRegra').style.display = 'flex';
};

// Fechar modal de regra
window.fecharModalRegra = function() {
    document.getElementById('modalRegra').style.display = 'none';
};

// Salvar regra
window.salvarRegra = async function(event) {
    event.preventDefault();
    
    const id = document.getElementById('regraId').value;
    const nome = document.getElementById('regraNome').value.trim();
    const descricao = document.getElementById('regraDescricao').value.trim();
    const tipoRegra = document.querySelector('input[name="tipoRegra"]:checked')?.value || 'gatilho';
    
    if (!nome) {
        showAlert('Nome da regra é obrigatório', 'error');
        return;
    }
    
    let dados = {
        nome,
        descricao,
        tipo_regra: tipoRegra
    };
    
    if (tipoRegra === 'faturamento') {
        const faturamentoMinimo = parseFloat(document.getElementById('regraFaturamentoMinimo').value);
        const percentual = parseFloat(document.getElementById('regraPercentualFaturamento').value);
        const percentualAuditoria = parseFloat(document.getElementById('regraPercentualAuditoria').value) || 0;
        
        if (isNaN(faturamentoMinimo) || faturamentoMinimo <= 0) {
            showAlert('Faturamento mínimo deve ser maior que zero', 'error');
            return;
        }
        
        if (isNaN(percentual) || percentual <= 0 || percentual > 100) {
            showAlert('Percentual deve ser um valor entre 0 e 100', 'error');
            return;
        }
        
        dados.faturamento_minimo = faturamentoMinimo;
        dados.percentual = percentual;
        dados.percentual_auditoria = percentualAuditoria;
        dados.inclui_itbi = false;
    } else {
        const percentual = parseFloat(document.getElementById('regraPercentual').value);
        const inclui_itbi = document.getElementById('regraIncluiItbi').checked;
        
        if (isNaN(percentual) || percentual <= 0 || percentual > 100) {
            showAlert('Percentual deve ser um valor entre 0 e 100', 'error');
            return;
        }
        
        dados.percentual = percentual;
        dados.inclui_itbi = inclui_itbi;
        dados.faturamento_minimo = null;
        dados.percentual_auditoria = null;
    }
    
    try {
        const url = id ? `/api/regras-gatilho/${id}` : '/api/regras-gatilho';
        const method = id ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        
        const result = await response.json();
        
        if (response.ok && result.status === 'sucesso') {
            showAlert(id ? 'Regra atualizada com sucesso!' : 'Regra criada com sucesso!', 'success');
            fecharModalRegra();
            carregarRegrasComissao();
        } else {
            showAlert(result.mensagem || 'Erro ao salvar regra', 'error');
        }
    } catch (error) {
        console.error('Erro ao salvar regra:', error);
        showAlert('Erro ao salvar regra', 'error');
    }
};

// Excluir regra
window.excluirRegra = function(id) {
    regraParaExcluir = id;
    document.getElementById('modalConfirmacaoExclusao').style.display = 'flex';
};

// Fechar modal de confirmação
window.fecharModalConfirmacao = function() {
    document.getElementById('modalConfirmacaoExclusao').style.display = 'none';
    regraParaExcluir = null;
};

// Confirmar exclusão
window.confirmarExclusaoRegra = async function() {
    if (!regraParaExcluir) return;
    
    try {
        const response = await fetch(`/api/regras-gatilho/${regraParaExcluir}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (response.ok && result.status === 'sucesso') {
            showAlert('Regra excluída com sucesso!', 'success');
            fecharModalConfirmacao();
            carregarRegrasComissao();
        } else {
            showAlert(result.mensagem || 'Erro ao excluir regra', 'error');
        }
    } catch (error) {
        console.error('Erro ao excluir regra:', error);
        showAlert('Erro ao excluir regra', 'error');
    }
};

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

// ================================
// RELATÓRIO DE COMISSÕES
// ================================

let dadosRelatorio = [];

// Função auxiliar para preencher dropdown multi-select
function populateMultiSelect(filtroId, options, valueField = 'id', textField = 'nome') {
    const dropdown = document.getElementById(`dropdown${capitalizeFirst(filtroId)}`);
    if (!dropdown || !options) return;
    
    dropdown.innerHTML = options.map(opt => `
        <label class="multi-select-option">
            <input type="checkbox" value="${opt[valueField] || opt}" onchange="updateMultiSelectText('${filtroId}')"> ${opt[textField] || opt}
        </label>
    `).join('');
}

// Carregar filtros do relatório
window.carregarFiltrosRelatorio = async function() {
    try {
        // Carregar empreendimentos
        const empreendimentosResponse = await fetch('/api/empreendimentos');
        const empreendimentos = await empreendimentosResponse.json();
        
        if (Array.isArray(empreendimentos)) {
            populateMultiSelect('relatorioEmpreendimento', empreendimentos, 'id', 'nome');
        }
        
        // Carregar corretores
        const corretoresResponse = await fetch('/api/relatorio-comissoes/corretores');
        const corretores = await corretoresResponse.json();
        
        if (Array.isArray(corretores)) {
            populateMultiSelect('relatorioCorretor', corretores, 'id', 'nome');
        }
        
        // Carregar regras
        const regrasResponse = await fetch('/api/regras-gatilho');
        const regras = await regrasResponse.json();
        
        if (Array.isArray(regras)) {
            populateMultiSelect('relatorioRegra', regras, 'id', 'nome');
        }
    } catch (error) {
        console.error('Erro ao carregar filtros do relatório:', error);
    }
};

// Carregar relatório de comissões
window.carregarRelatorioComissoes = async function() {
    console.log('[RELATÓRIO] Iniciando carregamento...');
    const tbody = document.getElementById('corpoTabelaRelatorio');
    const loading = document.getElementById('loadingRelatorio');
    const resumo = document.getElementById('resumoRelatorio');
    
    console.log('[RELATÓRIO] Elementos encontrados:', { tbody: !!tbody, loading: !!loading, resumo: !!resumo });
    
    if (!tbody) {
        console.error('[RELATÓRIO] Elemento corpoTabelaRelatorio não encontrado!');
        return;
    }
    
    // Mostrar loading
    if (loading) loading.style.display = 'flex';
    tbody.innerHTML = '';
    
    try {
        // Obter valores dos multi-selects
        const empreendimentos = getMultiSelectValues('relatorioEmpreendimento');
        const corretores = getMultiSelectValues('relatorioCorretor');
        const regras = getMultiSelectValues('relatorioRegra');
        const auditorias = getMultiSelectValues('relatorioAuditoria');
        
        // Obter filtros de data
        const dataInicio = document.getElementById('filtroRelatorioDataInicio')?.value || '';
        const dataFim = document.getElementById('filtroRelatorioDataFim')?.value || '';
        
        // Montar URL com filtros
        let url = '/api/relatorio-comissoes?';
        
        if (empreendimentos.length > 0) url += `empreendimento_id=${empreendimentos.join(',')}&`;
        if (corretores.length > 0) url += `corretor_id=${corretores.join(',')}&`;
        if (regras.length > 0) url += `regra_id=${regras.join(',')}&`;
        if (auditorias.length > 0) url += `auditoria=${auditorias.join(',')}&`;
        if (dataInicio) url += `data_inicio=${dataInicio}&`;
        if (dataFim) url += `data_fim=${dataFim}&`;
        
        const response = await fetch(url);
        const result = await response.json();
        
        if (loading) loading.style.display = 'none';
        
        console.log('[RELATÓRIO] Resposta da API:', result);
        
        if (result.sucesso && result.dados) {
            dadosRelatorio = result.dados;
            console.log('[RELATÓRIO] Dados carregados:', dadosRelatorio.length, 'registros');
            
            // Atualizar resumo
            if (resumo) {
                resumo.style.display = 'block';
                document.getElementById('totalVendasRelatorio').textContent = result.resumo.total_vendas;
                document.getElementById('totalComissoesRelatorio').textContent = formatCurrency(result.resumo.total_comissoes);
                document.getElementById('totalCorretoresRelatorio').textContent = result.resumo.total_corretores;
                document.getElementById('totalAuditoriasRelatorio').textContent = result.resumo.auditorias_aprovadas;
                console.log('[RELATÓRIO] Resumo atualizado');
            }
            
            // Renderizar tabela
            console.log('[RELATÓRIO] Renderizando tabela...');
            renderizarTabelaRelatorio(dadosRelatorio);
            console.log('[RELATÓRIO] Tabela renderizada');
        } else {
            console.error('[RELATÓRIO] Erro na resposta:', result.erro);
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: #f87171;">Erro ao carregar relatório: ${result.erro || 'Erro desconhecido'}</td></tr>`;
        }
    } catch (error) {
        console.error('Erro ao carregar relatório:', error);
        if (loading) loading.style.display = 'none';
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: #f87171;">Erro ao carregar relatório de comissões</td></tr>';
    }
};

// Renderizar tabela do relatório
function renderizarTabelaRelatorio(dados) {
    const tbody = document.getElementById('corpoTabelaRelatorio');
    if (!tbody) return;
    
    if (dados.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 4rem 2rem; color: #666;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="1.5" style="margin-bottom: 1rem;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    <p style="font-size: 0.95rem;">Nenhum registro encontrado com os filtros selecionados</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = dados.map(item => {
        // Badge de tipo de regra
        let regraBadge = '';
        if (item.tipo_regra === 'faturamento') {
            regraBadge = `<span style="display: inline-block; background: rgba(96, 165, 250, 0.15); color: #60a5fa; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.7rem; margin-bottom: 0.25rem; font-weight: 500;">Faturamento</span>`;
        } else {
            regraBadge = `<span style="display: inline-block; background: rgba(74, 222, 128, 0.15); color: #4ade80; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.7rem; margin-bottom: 0.25rem; font-weight: 500;">Gatilho</span>`;
        }
        
        // Badge de auditoria
        let auditoriaBadge = '';
        if (item.auditoria_aprovada === true) {
            auditoriaBadge = '<span style="background: rgba(74, 222, 128, 0.15); color: #4ade80; padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.8rem; font-weight: 500;">Aprovada</span>';
        } else if (item.auditoria_aprovada === false) {
            auditoriaBadge = '<span style="background: rgba(248, 113, 113, 0.15); color: #f87171; padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.8rem; font-weight: 500;">Reprovada</span>';
        } else {
            auditoriaBadge = '<span style="background: rgba(156, 163, 175, 0.15); color: #9ca3af; padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.8rem;">Pendente</span>';
        }
        
        return `
        <tr style="border-bottom: 1px solid #333; transition: background 0.2s;" onmouseover="this.style.background='#1a1a1a'" onmouseout="this.style.background='transparent'">
            <td style="padding: 1rem; font-weight: 500; color: #FE5009;">${item.lote || '-'}</td>
            <td style="padding: 1rem;">${item.cliente || '-'}</td>
            <td style="padding: 1rem; color: #999;">${item.empreendimento || '-'}</td>
            <td style="padding: 1rem;">${item.corretor || '-'}</td>
            <td style="padding: 1rem;">
                <div style="display: flex; flex-direction: column;">
                    ${regraBadge}
                    <span style="font-weight: 500;">${item.regra_nome || 'Não definida'}</span>
                    <span style="font-size: 0.8rem; color: #999;">${item.regra_descricao || ''}</span>
                </div>
            </td>
            <td style="padding: 1rem; text-align: center;">${auditoriaBadge}</td>
            <td style="padding: 1rem; text-align: right; font-weight: 600; color: #4ade80;">${formatCurrency(item.valor_comissao)}</td>
        </tr>
    `}).join('');
}

// Limpar filtros do relatório
window.limparFiltrosRelatorio = function() {
    // Limpar multi-selects
    clearMultiSelect('relatorioEmpreendimento');
    clearMultiSelect('relatorioCorretor');
    clearMultiSelect('relatorioRegra');
    clearMultiSelect('relatorioAuditoria');
    
    // Limpar campos de data
    const dataInicio = document.getElementById('filtroRelatorioDataInicio');
    const dataFim = document.getElementById('filtroRelatorioDataFim');
    if (dataInicio) dataInicio.value = '';
    if (dataFim) dataFim.value = '';
    
    // Limpar tabela
    const tbody = document.getElementById('corpoTabelaRelatorio');
    if (tbody) {
        tbody.innerHTML = `
            <tr><td colspan="7" style="text-align: center; padding: 4rem 2rem; color: #666;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="1.5" style="margin-bottom: 1rem;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                <p style="font-size: 0.95rem;">Clique em "Buscar" para carregar o relatório</p>
            </td></tr>
        `;
    }
    
    // Esconder resumo
    const resumo = document.getElementById('resumoRelatorio');
    if (resumo) resumo.style.display = 'none';
    
    dadosRelatorio = [];
};

// Exportar relatório para Excel
window.exportarRelatorioComissoes = async function(formato) {
    if (dadosRelatorio.length === 0) {
        showAlert('Carregue o relatório antes de exportar', 'warning');
        return;
    }
    
    try {
        // Criar dados para CSV/Excel
        const headers = ['Lote', 'Cliente', 'Empreendimento', 'Corretor', 'Regra Aplicada', 'Tipo Regra', 'Auditoria', 'Valor Comissão'];
        
        const rows = dadosRelatorio.map(item => [
            item.lote || '',
            item.cliente || '',
            item.empreendimento || '',
            item.corretor || '',
            `${item.regra_nome || ''} - ${item.regra_descricao || ''}`,
            item.tipo_regra === 'faturamento' ? 'Faturamento' : 'Gatilho',
            item.auditoria_aprovada === true ? 'Aprovada' : (item.auditoria_aprovada === false ? 'Reprovada' : 'Pendente'),
            item.valor_comissao || 0
        ]);
        
        // Criar CSV
        let csvContent = '\uFEFF'; // BOM para UTF-8
        csvContent += headers.join(';') + '\n';
        rows.forEach(row => {
            csvContent += row.map(cell => {
                // Escapar aspas e vírgulas
                const cellStr = String(cell).replace(/"/g, '""');
                return `"${cellStr}"`;
            }).join(';') + '\n';
        });
        
        // Download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `relatorio_comissoes_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showAlert('Relatório exportado com sucesso!', 'success');
    } catch (error) {
        console.error('Erro ao exportar relatório:', error);
        showAlert('Erro ao exportar relatório', 'error');
    }
};

// Inicializar filtros quando a página de relatório for aberta
document.addEventListener('DOMContentLoaded', function() {
    // Observar mudança de página para carregar filtros
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.attributeName === 'class') {
                const relatorioPage = document.getElementById('relatorio-comissoes');
                if (relatorioPage && relatorioPage.classList.contains('active')) {
                    carregarFiltrosRelatorio();
                }
            }
        });
    });
    
    const relatorioPage = document.getElementById('relatorio-comissoes');
    if (relatorioPage) {
        observer.observe(relatorioPage, { attributes: true });
    }
});

// Garantir que o DOM esta completamente carregado
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarSistema);
} else {
    // DOM ja carregado
    inicializarSistema();
}
