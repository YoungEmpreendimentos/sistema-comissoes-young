/**
 * JavaScript para Dashboard da Direção
 * Sistema de Comissões Young Empreendimentos
 */

// Estado global
let comissoesSelecionadasDirecao = [];

// ==================== FUNÇÕES UTILITÁRIAS ====================

function formatCurrency(value) {
    if (value === null || value === undefined || value === '' || value === '-') {
        return 'R$ 0,00';
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
    }, 4000);
}

function corrigirEspacamentoNome(nome) {
    if (!nome) return '-';
    // Adiciona espaço antes de letras maiúsculas que seguem letras minúsculas
    return nome.replace(/([a-z])([A-Z])/g, '$1 $2');
}

// ==================== CARREGAR COMISSÕES ====================

async function carregarComissoesPendentes() {
    const loading = document.getElementById('loadingDirecao');
    const tabelaContainer = document.getElementById('tabelaContainer');
    const emptyState = document.getElementById('emptyState');
    
    try {
        loading.style.display = 'block';
        tabelaContainer.style.display = 'none';
        emptyState.style.display = 'none';
        
        const response = await fetch('/api/comissoes/pendentes-aprovacao');
        const data = await response.json();
        
        loading.style.display = 'none';
        
        if (!data.sucesso || !data.comissoes || data.comissoes.length === 0) {
            emptyState.style.display = 'block';
            atualizarEstatisticas([]);
            return;
        }
        
        tabelaContainer.style.display = 'block';
        renderizarTabelaComissoesDirecao(data.comissoes);
        atualizarEstatisticas(data.comissoes);
        
    } catch (error) {
        console.error('Erro ao carregar comissões:', error);
        loading.style.display = 'none';
        showAlert('Erro ao carregar comissões pendentes', 'error');
    }
}

function atualizarEstatisticas(comissoes) {
    const total = comissoes.length;
    const valorTotal = comissoes.reduce((sum, c) => sum + parseFloat(c.commission_value || 0), 0);
    
    document.getElementById('totalPendente').textContent = total;
    document.getElementById('valorTotal').textContent = formatCurrency(valorTotal);
}

// ==================== RENDERIZAR TABELA ====================

function renderizarTabelaComissoesDirecao(comissoes) {
    const tbody = document.getElementById('corpoTabelaDirecao');
    
    tbody.innerHTML = comissoes.map(comissao => {
        const atingiuGatilho = comissao.atingiu_gatilho;
        const gatilhoClass = atingiuGatilho ? 'gatilho-sim' : 'gatilho-nao';
        const gatilhoText = atingiuGatilho ? 'SIM' : 'NÃO';
        
        return `
            <tr>
                <td>
                    <input type="checkbox" 
                           class="checkbox-direcao checkbox-comissao-direcao" 
                           data-id="${comissao.id}"
                           data-valor="${comissao.commission_value || 0}"
                           onchange="toggleComissaoSelecionadaDirecao(this)">
                </td>
                <td>${corrigirEspacamentoNome(comissao.broker_nome)}</td>
                <td>${comissao.enterprise_name || '-'}</td>
                <td>${comissao.unit_name || '-'}</td>
                <td>${corrigirEspacamentoNome(comissao.customer_name)}</td>
                <td>${formatCurrency(comissao.commission_value)}</td>
                <td>${formatDate(comissao.commission_date)}</td>
                <td class="${gatilhoClass}">${gatilhoText}</td>
                <td>${formatDate(comissao.data_envio_aprovacao)}</td>
            </tr>
        `;
    }).join('');
}

// ==================== SELEÇÃO DE COMISSÕES ====================

function toggleComissaoSelecionadaDirecao(checkbox) {
    const id = parseInt(checkbox.dataset.id);
    
    if (checkbox.checked) {
        if (!comissoesSelecionadasDirecao.includes(id)) {
            comissoesSelecionadasDirecao.push(id);
        }
    } else {
        comissoesSelecionadasDirecao = comissoesSelecionadasDirecao.filter(cId => cId !== id);
    }
    
    atualizarAcoesLoteDirecao();
}

function toggleTodasDirecao() {
    const checkboxPrincipal = document.getElementById('selecionarTodasDirecao');
    const checkboxes = document.querySelectorAll('.checkbox-comissao-direcao');
    
    comissoesSelecionadasDirecao = [];
    
    checkboxes.forEach(cb => {
        cb.checked = checkboxPrincipal.checked;
        if (checkboxPrincipal.checked) {
            comissoesSelecionadasDirecao.push(parseInt(cb.dataset.id));
        }
    });
    
    atualizarAcoesLoteDirecao();
}

function atualizarAcoesLoteDirecao() {
    const acoesLote = document.getElementById('acoesLoteDirecao');
    const qtdSelecionadas = document.getElementById('qtdSelecionadas');
    
    if (comissoesSelecionadasDirecao.length > 0) {
        acoesLote.classList.remove('hidden');
        qtdSelecionadas.textContent = comissoesSelecionadasDirecao.length;
    } else {
        acoesLote.classList.add('hidden');
    }
}

// ==================== APROVAR/REJEITAR ====================

async function aprovarComissoesSelecionadas() {
    if (comissoesSelecionadasDirecao.length === 0) {
        showAlert('Selecione ao menos uma comissão', 'error');
        return;
    }
    
    if (!confirm(`Confirma a aprovação de ${comissoesSelecionadasDirecao.length} comissão(ões)?`)) {
        return;
    }
    
    try {
        const response = await fetch('/api/comissoes/aprovar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                comissoes_ids: comissoesSelecionadasDirecao
            })
        });
        
        const data = await response.json();
        
        if (data.sucesso) {
            showAlert(data.mensagem || 'Comissões aprovadas com sucesso!', 'success');
            comissoesSelecionadasDirecao = [];
            carregarComissoesPendentes();
        } else {
            showAlert(data.erro || data.mensagem || 'Erro ao aprovar', 'error');
        }
    } catch (error) {
        console.error('Erro ao aprovar:', error);
        showAlert('Erro ao aprovar comissões', 'error');
    }
}

function abrirModalRejeitar() {
    if (comissoesSelecionadasDirecao.length === 0) {
        showAlert('Selecione ao menos uma comissão', 'error');
        return;
    }
    
    document.getElementById('modalRejeitar').classList.add('active');
    document.getElementById('motivoRejeicao').value = '';
    document.getElementById('motivoRejeicao').focus();
}

function fecharModalRejeitar() {
    document.getElementById('modalRejeitar').classList.remove('active');
}

async function confirmarRejeicao() {
    const motivo = document.getElementById('motivoRejeicao').value.trim();
    
    if (!motivo) {
        showAlert('Informe o motivo da rejeição', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/comissoes/rejeitar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                comissoes_ids: comissoesSelecionadasDirecao,
                motivo: motivo
            })
        });
        
        const data = await response.json();
        
        if (data.sucesso) {
            showAlert(data.mensagem || 'Comissões rejeitadas', 'success');
            comissoesSelecionadasDirecao = [];
            fecharModalRejeitar();
            carregarComissoesPendentes();
        } else {
            showAlert(data.erro || data.mensagem || 'Erro ao rejeitar', 'error');
        }
    } catch (error) {
        console.error('Erro ao rejeitar:', error);
        showAlert('Erro ao rejeitar comissões', 'error');
    }
}

// ==================== INICIALIZAÇÃO ====================

document.addEventListener('DOMContentLoaded', function() {
    carregarComissoesPendentes();
    
    // Fechar modal ao clicar fora
    document.getElementById('modalRejeitar').addEventListener('click', function(e) {
        if (e.target === this) {
            fecharModalRejeitar();
        }
    });
    
    // Fechar modal com ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            fecharModalRejeitar();
        }
    });
});
