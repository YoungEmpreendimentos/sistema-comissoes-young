"""
Sistema de Comissões - Young Empreendimentos
Aplicação Flask principal com todas as rotas e funcionalidades
"""

import os
import re
from datetime import datetime
from flask import Flask, render_template, jsonify, request, redirect, url_for, flash, session
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from flask_cors import CORS
from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler

# Importar módulos do sistema
from auth_manager import AuthManager, traduzir_status, Usuario, CorretorUser
from sienge_client import sienge_client
from sync_sienge_supabase import SiengeSupabaseSync
from aprovacao_comissoes import AprovacaoComissoes

load_dotenv()

# Inicializar Flask
app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'young-empreendimentos-comissoes-2024')
CORS(app)

# Configurar Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'
login_manager.login_message = 'Por favor, faça login para acessar esta página.'

# Inicializar AuthManager
auth_manager = AuthManager()


# Função para calcular o valor do gatilho
def calcular_valor_gatilho(valor_a_vista: float, valor_itbi: float, regra: str) -> float:
    """
    Calcula o valor do gatilho baseado na regra de comissão.
    
    Regras suportadas:
    - '10% + ITBI': 10% do valor à vista + ITBI
    - '10%': 10% do valor à vista
    - '5%': 5% do valor à vista
    - '6%': 6% do valor à vista
    """
    if not regra:
        regra = '10% + ITBI'
    
    regra_lower = regra.lower().strip()
    
    if '10%' in regra_lower and 'itbi' in regra_lower:
        return (valor_a_vista * 0.10) + valor_itbi
    elif '10%' in regra_lower:
        return valor_a_vista * 0.10
    elif '5%' in regra_lower:
        return valor_a_vista * 0.05
    elif '6%' in regra_lower:
        return valor_a_vista * 0.06
    else:
        # Tentar extrair percentual da string
        match = re.search(r'(\d+[,.]?\d*)\s*%', regra)
        if match:
            percentual = float(match.group(1).replace(',', '.')) / 100
            if 'itbi' in regra_lower:
                return (valor_a_vista * percentual) + valor_itbi
            return valor_a_vista * percentual
        
        # Padrão: 10% + ITBI
        return (valor_a_vista * 0.10) + valor_itbi


# ==================== FLASK-LOGIN CALLBACKS ====================

@login_manager.user_loader
def load_user(user_id):
    return auth_manager.buscar_usuario_por_id(user_id)


# ==================== ROTAS DE AUTENTICAÇÃO ====================

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        if hasattr(current_user, 'is_corretor') and current_user.is_corretor:
            return redirect(url_for('dashboard_corretor'))
        return redirect(url_for('dashboard'))
    
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        senha = request.form.get('senha', '')
        tipo_login = request.form.get('tipo_login', 'gestor')
        
        if tipo_login == 'corretor':
            # Login de corretor (CPF)
            usuario = auth_manager.autenticar_corretor(username, senha)
            if usuario:
                login_user(usuario)
                return redirect(url_for('dashboard_corretor'))
        else:
            # Login de gestor
            usuario = auth_manager.autenticar(username, senha)
            if usuario:
                login_user(usuario)
                # Redirecionar direção para página específica
                if usuario.perfil == 'Direção':
                    return redirect(url_for('dashboard_direcao'))
                return redirect(url_for('dashboard'))
        
        flash('Credenciais inválidas', 'error')
    
    return render_template('login_unificado.html')


@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))


# ==================== ROTAS PRINCIPAIS ====================

@app.route('/')
def index():
    if current_user.is_authenticated:
        if hasattr(current_user, 'is_corretor') and current_user.is_corretor:
            return redirect(url_for('dashboard_corretor'))
        if hasattr(current_user, 'perfil') and current_user.perfil == 'Direção':
            return redirect(url_for('dashboard_direcao'))
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))


@app.route('/dashboard')
@login_required
def dashboard():
    if hasattr(current_user, 'is_corretor') and current_user.is_corretor:
        return redirect(url_for('dashboard_corretor'))
    if hasattr(current_user, 'perfil') and current_user.perfil == 'Direção':
        return redirect(url_for('dashboard_direcao'))
    return render_template('dashboard.html', user=current_user)


@app.route('/dashboard/corretor')
@login_required
def dashboard_corretor():
    if not hasattr(current_user, 'is_corretor') or not current_user.is_corretor:
        return redirect(url_for('dashboard'))
    return render_template('dashboard_corretor.html', user=current_user)


@app.route('/dashboard/direcao')
@login_required
def dashboard_direcao():
    if not hasattr(current_user, 'perfil') or current_user.perfil != 'Direção':
        return redirect(url_for('dashboard'))
    return render_template('dashboard_direcao.html', user=current_user)


# ==================== API - EMPREENDIMENTOS ====================

@app.route('/api/empreendimentos', methods=['GET'])
@login_required
def listar_empreendimentos():
    try:
        sync = SiengeSupabaseSync()
        empreendimentos = sync.get_empreendimentos()
        if empreendimentos is None:
            empreendimentos = []
        print(f"[API] Empreendimentos encontrados: {len(empreendimentos)}")
        return jsonify(empreendimentos), 200
    except Exception as e:
        print(f"[API] Erro ao listar empreendimentos: {str(e)}")
        return jsonify({'erro': str(e)}), 500


# ==================== API - CONTRATOS ====================

@app.route('/api/contratos', methods=['GET'])
@login_required
def listar_contratos():
    try:
        building_id = request.args.get('building_id', type=int)
        sync = SiengeSupabaseSync()
        
        if building_id:
            contratos = sync.get_contratos_por_empreendimento(building_id)
        else:
            result = sync.supabase.table('sienge_contratos').select('*').execute()
            contratos = result.data if result.data else []
        
        if contratos is None:
            contratos = []
        
        print(f"[API] Contratos encontrados para building_id={building_id}: {len(contratos)}")
        return jsonify(contratos), 200
    except Exception as e:
        print(f"[API] Erro ao listar contratos: {str(e)}")
        return jsonify({'erro': str(e)}), 500


@app.route('/api/contrato-info', methods=['GET'])
@login_required
def get_contrato_info():
    try:
        numero_contrato = request.args.get('numero_contrato')
        building_id = request.args.get('building_id')
        
        if not numero_contrato or not building_id:
            return jsonify({'erro': 'Parâmetros obrigatórios: numero_contrato, building_id'}), 400
        
        # Manter building_id como string (assim está no banco)
        print(f"[API] get_contrato_info: numero_contrato={numero_contrato}, building_id={building_id}")
        
        sync = SiengeSupabaseSync()
        
        # 1. Buscar contrato
        contrato = sync.get_contrato_por_numero(numero_contrato, building_id)
        if not contrato:
            return jsonify({'erro': 'Contrato não encontrado'}), 404
        
        # 2. Buscar corretor do contrato (campo pode estar no proprio contrato)
        corretor_principal = contrato.get('corretor') or contrato.get('broker_nome') or contrato.get('broker_name')
        valor_comissao = None
        status_parcela = None
        
        # 3. Buscar comissao da tabela sienge_comissoes
        try:
            comissao_result = sync.supabase.table('sienge_comissoes')\
                .select('*')\
                .eq('numero_contrato', numero_contrato)\
                .eq('building_id', building_id)\
                .limit(1)\
                .execute()
            
            if comissao_result.data:
                comissao = comissao_result.data[0]
                # Tentar diferentes nomes de colunas para corretor (se nao veio do contrato)
                if not corretor_principal:
                    corretor_principal = comissao.get('broker_nome') or comissao.get('broker_name') or comissao.get('corretor')
                # Valor da comissao
                valor_comissao = comissao.get('commission_value') or comissao.get('valor_comissao') or comissao.get('value')
                status_parcela = comissao.get('installment_status') or comissao.get('status') or comissao.get('status_parcela')
                print(f"[API] Comissao encontrada: corretor={corretor_principal}, valor={valor_comissao}")
        except Exception as e:
            print(f"[API] Erro ao buscar comissao (ignorando): {str(e)}")
        
        # 4. Se ainda nao tem corretor, tentar buscar pelo brokers do contrato
        if not corretor_principal:
            brokers = contrato.get('brokers') or contrato.get('corretores')
            if brokers and isinstance(brokers, list) and len(brokers) > 0:
                # Pegar o primeiro corretor principal
                for b in brokers:
                    if isinstance(b, dict):
                        if b.get('main') or b.get('principal'):
                            corretor_principal = b.get('name') or b.get('nome')
                            break
                # Se nao achou principal, pegar o primeiro
                if not corretor_principal and isinstance(brokers[0], dict):
                    corretor_principal = brokers[0].get('name') or brokers[0].get('nome')
            elif brokers and isinstance(brokers, str):
                try:
                    import json
                    parsed = json.loads(brokers)
                    if isinstance(parsed, list) and len(parsed) > 0:
                        for b in parsed:
                            if b.get('main') or b.get('principal'):
                                corretor_principal = b.get('name') or b.get('nome')
                                break
                        if not corretor_principal:
                            corretor_principal = parsed[0].get('name') or parsed[0].get('nome')
                except:
                    pass
        
        print(f"[API] Dados finais: corretor={corretor_principal}, comissao={valor_comissao}")
        
        # 5. Buscar ITBI
        valor_itbi = sync.get_itbi_por_contrato(numero_contrato, building_id) or 0
        
        # 6. Buscar valor pago
        valor_pago = sync.get_valor_pago_por_contrato(numero_contrato, building_id) or 0
        
        # Traduzir status
        status_parcela_traduzido = traduzir_status(status_parcela) if status_parcela else None
        
        # 7. Calcular gatilho
        regra_gatilho = '10% + ITBI'
        valor_a_vista_calc = float(contrato.get('valor_a_vista') or contrato.get('valor_total') or 0)
        valor_itbi_calc = float(valor_itbi or 0)
        valor_pago_calc = float(valor_pago or 0)
        
        # Buscar regra específica (usando a mesma consulta anterior se possível)
        try:
            gatilho_result = sync.supabase.table('sienge_comissoes')\
                .select('*')\
                .eq('numero_contrato', numero_contrato)\
                .eq('building_id', building_id)\
                .limit(1)\
                .execute()
            
            if gatilho_result.data:
                regra = gatilho_result.data[0].get('regra_gatilho')
                if regra:
                    regra_gatilho = regra
        except Exception as e:
            print(f"[API] Erro ao buscar regra gatilho (ignorando): {str(e)}")
        
        valor_gatilho = calcular_valor_gatilho(valor_a_vista_calc, valor_itbi_calc, regra_gatilho)
        atingiu_gatilho = valor_pago_calc >= valor_gatilho if valor_gatilho > 0 else False
        
        # Mapeamento de building_id para nome do empreendimento
        EMPREENDIMENTOS = {
            '2003': 'Montecarlo',
            '2004': 'Ilha dos Açores',
            '2005': 'Aurora',
            '2007': 'Parque Lorena I',
            '2009': 'Parque Lorena II',
            '2010': 'Erico Verissimo',
            '2011': 'Algarve',
            '2014': 'Morada da Coxilha',
            2003: 'Montecarlo',
            2004: 'Ilha dos Açores',
            2005: 'Aurora',
            2007: 'Parque Lorena I',
            2009: 'Parque Lorena II',
            2010: 'Erico Verissimo',
            2011: 'Algarve',
            2014: 'Morada da Coxilha'
        }
        empreendimento_nome = EMPREENDIMENTOS.get(building_id, f'Empreendimento {building_id}')
        
        # Montar resposta
        info = {
            'numero_contrato': contrato.get('numero_contrato'),
            'nome_cliente': contrato.get('nome_cliente'),
            'data_contrato': contrato.get('data_contrato'),
            'valor_total': contrato.get('valor_total'),
            'valor_a_vista': contrato.get('valor_a_vista'),
            'corretor_principal': corretor_principal,
            'valor_comissao': valor_comissao,
            'status_parcela': status_parcela_traduzido,
            'valor_itbi': valor_itbi,
            'valor_pago': valor_pago,
            'building_id': building_id,
            'empreendimento_nome': empreendimento_nome,
            'company_id': contrato.get('company_id'),
            'regra_gatilho': regra_gatilho,
            'valor_gatilho': valor_gatilho,
            'atingiu_gatilho': atingiu_gatilho
        }
        
        return jsonify(info), 200
    except Exception as e:
        return jsonify({'erro': str(e)}), 500


@app.route('/api/buscar-por-lote', methods=['GET'])
@login_required
def buscar_por_lote():
    try:
        numero_lote = request.args.get('lote', '')
        if len(numero_lote) < 2:
            return jsonify([]), 200
        
        sync = SiengeSupabaseSync()
        contratos = sync.buscar_contratos_por_lote(numero_lote)
        
        if contratos is None:
            contratos = []
        
        print(f"[API] Busca por lote '{numero_lote}': {len(contratos)} resultados")
        return jsonify(contratos), 200
    except Exception as e:
        print(f"[API] Erro na busca por lote: {str(e)}")
        return jsonify({'erro': str(e)}), 500


# ==================== API - CORRETORES ====================

@app.route('/api/corretores', methods=['GET'])
@login_required
def listar_corretores():
    try:
        sync = SiengeSupabaseSync()
        corretores = sync.get_corretores()
        return jsonify(corretores), 200
    except Exception as e:
        return jsonify({'erro': str(e)}), 500


@app.route('/api/corretores-usuarios', methods=['GET'])
@login_required
def listar_corretores_usuarios():
    try:
        corretores = auth_manager.listar_corretores_usuarios()
        return jsonify({'sucesso': True, 'corretores': corretores}), 200
    except Exception as e:
        return jsonify({'sucesso': False, 'erro': str(e)}), 500


@app.route('/api/contratos-por-corretor', methods=['GET'])
@login_required
def contratos_por_corretor():
    try:
        corretor_id = request.args.get('corretor_id', type=int)
        corretor_nome = request.args.get('corretor_nome')
        
        sync = SiengeSupabaseSync()
        comissoes = sync.get_comissoes_por_corretor(corretor_id=corretor_id, corretor_nome=corretor_nome)
        
        return jsonify(comissoes), 200
    except Exception as e:
        return jsonify({'erro': str(e)}), 500


# ==================== API - SINCRONIZAÇÃO ====================

@app.route('/api/sincronizar', methods=['POST'])
@login_required
def sincronizar():
    if not current_user.is_admin:
        return jsonify({'erro': 'Apenas administradores podem sincronizar'}), 403
    
    try:
        building_id = request.json.get('building_id') if request.is_json else None
        sync = SiengeSupabaseSync()
        resultado = sync.sync_all(building_id=building_id)
        return jsonify({'sucesso': True, 'resultado': resultado}), 200
    except Exception as e:
        return jsonify({'erro': str(e)}), 500


@app.route('/api/ultima-sincronizacao', methods=['GET'])
@login_required
def ultima_sincronizacao():
    try:
        sync = SiengeSupabaseSync()
        ultima = sync.get_ultima_sincronizacao()
        return jsonify(ultima), 200
    except Exception as e:
        return jsonify({'erro': str(e)}), 500


# ==================== API - USUÁRIOS ====================

@app.route('/api/usuarios', methods=['GET'])
@login_required
def listar_usuarios():
    if not current_user.is_admin:
        return jsonify({'erro': 'Acesso negado'}), 403
    
    try:
        usuarios = auth_manager.listar_usuarios()
        return jsonify(usuarios), 200
    except Exception as e:
        return jsonify({'erro': str(e)}), 500


@app.route('/api/usuarios', methods=['POST'])
@app.route('/api/usuarios/criar', methods=['POST'])
@login_required
def criar_usuario():
    if not current_user.is_admin:
        return jsonify({'erro': 'Acesso negado'}), 403
    
    try:
        data = request.get_json()
        resultado = auth_manager.criar_usuario(
            username=data.get('username'),
            senha=data.get('senha'),
            nome_completo=data.get('nome_completo'),
            is_admin=data.get('is_admin', False),
            perfil=data.get('perfil', 'Gestor')
        )
        
        if resultado['sucesso']:
            return jsonify(resultado), 201
        return jsonify(resultado), 400
    except Exception as e:
        return jsonify({'erro': str(e)}), 500


@app.route('/api/usuarios/<int:user_id>/perfil', methods=['PUT'])
@login_required
def atualizar_perfil_usuario(user_id):
    if not current_user.is_admin:
        return jsonify({'erro': 'Acesso negado'}), 403
    
    try:
        data = request.get_json()
        novo_perfil = data.get('perfil')
        
        sync = SiengeSupabaseSync()
        sync.supabase.table('usuarios')\
            .update({'perfil': novo_perfil})\
            .eq('id', user_id)\
            .execute()
        
        return jsonify({'sucesso': True}), 200
    except Exception as e:
        return jsonify({'erro': str(e)}), 500


# ==================== API - REGRAS DE GATILHO ====================

@app.route('/api/regras-gatilho', methods=['GET'])
@login_required
def listar_regras_gatilho():
    try:
        sync = SiengeSupabaseSync()
        result = sync.supabase.table('regras_gatilho')\
            .select('*')\
            .eq('ativo', True)\
            .order('nome')\
            .execute()
        return jsonify(result.data if result.data else []), 200
    except Exception as e:
        return jsonify({'status': 'erro', 'mensagem': str(e)}), 500


@app.route('/api/regras-gatilho', methods=['POST'])
@login_required
def criar_regra_gatilho():
    try:
        data = request.get_json()
        sync = SiengeSupabaseSync()
        
        nova_regra = {
            'nome': data.get('nome'),
            'descricao': data.get('descricao'),
            'percentual': data.get('percentual'),
            'inclui_itbi': data.get('inclui_itbi', False),
            'ativo': True,
            'criado_em': datetime.now().isoformat()
        }
        
        result = sync.supabase.table('regras_gatilho').insert(nova_regra).execute()
        
        if result.data:
            return jsonify({'status': 'sucesso', 'regra': result.data[0]}), 201
        return jsonify({'status': 'erro', 'mensagem': 'Erro ao criar regra'}), 400
    except Exception as e:
        return jsonify({'status': 'erro', 'mensagem': str(e)}), 500


@app.route('/api/regras-gatilho/<int:regra_id>', methods=['PUT'])
@login_required
def atualizar_regra_gatilho(regra_id):
    try:
        data = request.get_json()
        sync = SiengeSupabaseSync()
        
        atualizacao = {
            'nome': data.get('nome'),
            'descricao': data.get('descricao'),
            'percentual': data.get('percentual'),
            'inclui_itbi': data.get('inclui_itbi'),
            'atualizado_em': datetime.now().isoformat()
        }
        
        result = sync.supabase.table('regras_gatilho')\
            .update(atualizacao)\
            .eq('id', regra_id)\
            .execute()
        
        if result.data:
            return jsonify({'status': 'sucesso', 'regra': result.data[0]}), 200
        return jsonify({'status': 'erro', 'mensagem': 'Regra não encontrada'}), 404
    except Exception as e:
        return jsonify({'status': 'erro', 'mensagem': str(e)}), 500


@app.route('/api/regras-gatilho/<int:regra_id>', methods=['DELETE'])
@login_required
def excluir_regra_gatilho(regra_id):
    try:
        sync = SiengeSupabaseSync()
        sync.supabase.table('regras_gatilho')\
            .update({'ativo': False})\
            .eq('id', regra_id)\
            .execute()
        return jsonify({'status': 'sucesso', 'mensagem': 'Regra excluída'}), 200
    except Exception as e:
        return jsonify({'status': 'erro', 'mensagem': str(e)}), 500


# ==================== API - COMISSÕES E APROVAÇÃO ====================

@app.route('/api/comissoes/status-parcela', methods=['GET'])
@login_required
def listar_status_parcela():
    """Lista todos os status de parcela únicos no banco"""
    try:
        sync = SiengeSupabaseSync()
        result = sync.supabase.table('sienge_comissoes').select('installment_status').execute()
        
        status_unicos = set()
        for c in (result.data or []):
            st = c.get('installment_status')
            if st:
                status_unicos.add(st)
        
        return jsonify({
            'sucesso': True,
            'status': sorted(list(status_unicos))
        }), 200
    except Exception as e:
        return jsonify({'sucesso': False, 'erro': str(e)}), 500


@app.route('/api/comissoes/listar', methods=['GET'])
@login_required
def listar_todas_comissoes():
    try:
        sync = SiengeSupabaseSync()
        
        # Obter parâmetros de filtro
        status_parcela = request.args.get('status_parcela')
        status_aprovacao = request.args.get('status_aprovacao')
        gatilho_atingido = request.args.get('gatilho_atingido')
        
        # Buscar todas as comissões
        query = sync.supabase.table('sienge_comissoes').select('*')
        
        if status_aprovacao:
            query = query.eq('status_aprovacao', status_aprovacao)
        
        result = query.execute()
        comissoes = result.data if result.data else []
        
        # Log dos status unicos para debug
        status_unicos = set()
        for c in comissoes:
            st = c.get('installment_status')
            if st:
                status_unicos.add(st)
        print(f"[API] Status de parcela encontrados: {sorted(status_unicos)}")
        
        # Aplicar filtros em Python (mais flexível)
        # Mapeamento de status PT-BR para valores em inglês
        mapa_status_parcela = {
            'pago': ['paidout', 'paid out', 'paid', 'pago'],
            'pendente': ['pending', 'pendente'],
            'vencido': ['overdue', 'vencido'],
            'aberto': ['open', 'aberto'],
            'parcial': ['partial', 'parcial'],
            'cancelado': ['cancelled', 'canceled', 'cancelado']
        }
        
        if status_parcela:
            status_lower = status_parcela.lower()
            # Verificar se é um status em PT-BR e mapear para inglês
            valores_busca = mapa_status_parcela.get(status_lower, [status_lower])
            comissoes = [c for c in comissoes if any(
                v in (c.get('installment_status') or '').lower() for v in valores_busca
            )]
        
        if gatilho_atingido is not None:
            gatilho_bool = gatilho_atingido.lower() == 'true'
            comissoes = [c for c in comissoes if c.get('atingiu_gatilho') == gatilho_bool]
        
        # Ordenar por data
        comissoes.sort(key=lambda x: x.get('commission_date') or '', reverse=True)
        
        return jsonify({
            'sucesso': True,
            'comissoes': comissoes,
            'total': len(comissoes)
        }), 200
        
    except Exception as e:
        return jsonify({'sucesso': False, 'erro': str(e)}), 500


@app.route('/api/comissoes/enviar-aprovacao', methods=['POST'])
@login_required
def enviar_comissoes_aprovacao():
    try:
        if not current_user.is_admin:
            return jsonify({'erro': 'Apenas gestores podem enviar para aprovação'}), 403
        
        data = request.get_json()
        comissoes_ids = data.get('comissoes_ids', [])
        
        if not comissoes_ids:
            return jsonify({'erro': 'Nenhuma comissão selecionada'}), 400
        
        sync = SiengeSupabaseSync()
        aprovacao = AprovacaoComissoes(sync.supabase)
        
        resultado = aprovacao.enviar_para_aprovacao(comissoes_ids, current_user.id)
        
        if resultado['sucesso']:
            return jsonify(resultado), 200
        return jsonify(resultado), 400
        
    except Exception as e:
        return jsonify({'sucesso': False, 'erro': str(e)}), 500


@app.route('/api/comissoes/aprovar', methods=['POST'])
@login_required
def aprovar_comissoes():
    try:
        if not hasattr(current_user, 'perfil') or current_user.perfil != 'Direção':
            return jsonify({'erro': 'Apenas a direção pode aprovar comissões'}), 403
        
        data = request.get_json()
        comissoes_ids = data.get('comissoes_ids', [])
        observacoes = data.get('observacoes')
        
        if not comissoes_ids:
            return jsonify({'erro': 'Nenhuma comissão selecionada'}), 400
        
        sync = SiengeSupabaseSync()
        aprovacao = AprovacaoComissoes(sync.supabase)
        
        resultado = aprovacao.aprovar_comissoes(comissoes_ids, current_user.id, observacoes)
        
        if resultado['sucesso']:
            return jsonify(resultado), 200
        return jsonify(resultado), 400
        
    except Exception as e:
        return jsonify({'sucesso': False, 'erro': str(e)}), 500


@app.route('/api/comissoes/rejeitar', methods=['POST'])
@login_required
def rejeitar_comissoes():
    try:
        if not hasattr(current_user, 'perfil') or current_user.perfil != 'Direção':
            return jsonify({'erro': 'Apenas a direção pode rejeitar comissões'}), 403
        
        data = request.get_json()
        comissoes_ids = data.get('comissoes_ids', [])
        motivo = data.get('motivo', '')
        
        if not comissoes_ids:
            return jsonify({'erro': 'Nenhuma comissão selecionada'}), 400
        
        if not motivo:
            return jsonify({'erro': 'Motivo é obrigatório para rejeição'}), 400
        
        sync = SiengeSupabaseSync()
        aprovacao = AprovacaoComissoes(sync.supabase)
        
        resultado = aprovacao.rejeitar_comissoes(comissoes_ids, current_user.id, motivo)
        
        if resultado['sucesso']:
            return jsonify(resultado), 200
        return jsonify(resultado), 400
        
    except Exception as e:
        return jsonify({'sucesso': False, 'erro': str(e)}), 500


@app.route('/api/comissoes/pendentes-aprovacao', methods=['GET'])
@login_required
def listar_comissoes_pendentes_aprovacao():
    try:
        sync = SiengeSupabaseSync()
        aprovacao = AprovacaoComissoes(sync.supabase)
        
        comissoes = aprovacao.listar_comissoes_por_status('Pendente de Aprovação')
        
        return jsonify({
            'sucesso': True,
            'comissoes': comissoes,
            'total': len(comissoes)
        }), 200
        
    except Exception as e:
        return jsonify({'sucesso': False, 'erro': str(e)}), 500


# ==================== API - CONFIGURAÇÕES DE E-MAILS ====================

@app.route('/api/configuracoes-emails', methods=['GET'])
@login_required
def listar_configuracoes_emails():
    try:
        sync = SiengeSupabaseSync()
        result = sync.supabase.table('configuracoes_emails')\
            .select('*')\
            .order('tipo')\
            .execute()
        
        return jsonify({
            'sucesso': True,
            'configuracoes': result.data if result.data else []
        }), 200
    except Exception as e:
        return jsonify({'sucesso': False, 'erro': str(e)}), 500


@app.route('/api/configuracoes-emails/<string:tipo>', methods=['PUT'])
@login_required
def atualizar_configuracoes_emails(tipo):
    if not current_user.is_admin:
        return jsonify({'erro': 'Acesso negado'}), 403
    
    try:
        data = request.get_json()
        emails = data.get('emails', [])
        
        sync = SiengeSupabaseSync()
        sync.supabase.table('configuracoes_emails')\
            .update({
                'emails': emails,
                'atualizado_por': current_user.id,
                'atualizado_em': datetime.now().isoformat()
            })\
            .eq('tipo', tipo)\
            .execute()
        
        return jsonify({'sucesso': True}), 200
    except Exception as e:
        return jsonify({'sucesso': False, 'erro': str(e)}), 500


# ==================== ROTAS DE CADASTRO ====================

@app.route('/cadastro/corretor', methods=['GET', 'POST'])
def cadastro_corretor():
    if request.method == 'POST':
        data = request.form
        resultado = auth_manager.criar_corretor(
            cpf=data.get('cpf'),
            senha=data.get('senha'),
            nome=data.get('nome'),
            email=data.get('email')
        )
        
        if resultado['sucesso']:
            flash('Cadastro realizado com sucesso! Faça login.', 'success')
            return redirect(url_for('login'))
        else:
            flash(resultado.get('erro', 'Erro no cadastro'), 'error')
    
    return render_template('cadastro_corretor.html')


# ==================== SINCRONIZAÇÃO AUTOMÁTICA ====================

def sincronizacao_diaria():
    """Executa sincronização diária automática"""
    try:
        print(f"[{datetime.now()}] Iniciando sincronização automática...")
        sync = SiengeSupabaseSync()
        resultado = sync.sync_all()
        print(f"[{datetime.now()}] Sincronização concluída: {resultado}")
    except Exception as e:
        print(f"[{datetime.now()}] Erro na sincronização: {str(e)}")


# Agendar sincronização diária (às 6h da manhã)
scheduler = BackgroundScheduler()
scheduler.add_job(sincronizacao_diaria, 'cron', hour=6, minute=0)


# ==================== INICIALIZAÇÃO ====================

if __name__ == '__main__':
    import sys
    import traceback
    try:
        # Iniciar agendador
        scheduler.start()
        
        # Configurações do servidor
        port = int(os.getenv('FLASK_PORT', 5000))
        debug = os.getenv('FLASK_DEBUG', 'True').lower() == 'true'
        
        print(f"Sistema de Comissoes Young iniciando na porta {port}...")
        print(f"Sincronizacao automatica agendada para 06:00")
        
        app.run(debug=debug, port=port, host='0.0.0.0')
    except Exception as e:
        print("ERRO ao iniciar o servidor:", file=sys.stderr)
        print(str(e), file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
