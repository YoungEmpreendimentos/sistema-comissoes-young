"""
Gerenciador de Autenticação - Sistema de Comissões Young
Gerencia autenticação de usuários (gestores e corretores) com Flask-Login
"""

import os
import hashlib
import bcrypt
from datetime import datetime
from typing import Optional
from flask_login import UserMixin
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()


class Usuario(UserMixin):
    """Classe de usuário para Flask-Login"""
    def __init__(self, id: int, username: str, nome_completo: str, is_admin: bool, perfil: str = 'Gestor'):
        self.id = id
        self.username = username
        self.nome_completo = nome_completo
        self.is_admin = is_admin
        self.perfil = perfil  # Gestor ou Direção
    
    def get_id(self):
        return str(self.id)


class CorretorUser(UserMixin):
    """Classe de usuário corretor para Flask-Login"""
    def __init__(self, id: int, cpf: str, nome: str, email: str, sienge_id: int = None):
        self.id = id
        self.cpf = cpf
        self.nome = nome
        self.email = email
        self.sienge_id = sienge_id
        self.is_admin = False
        self.is_corretor = True
        self.perfil = 'Corretor'
    
    def get_id(self):
        return f"corretor_{self.id}"


class AuthManager:
    """Gerenciador de autenticação"""
    
    def __init__(self):
        self.supabase = create_client(
            os.getenv('SUPABASE_URL'),
            os.getenv('SUPABASE_KEY')
        )
    
    def _hash_senha(self, senha: str) -> str:
        """Gera hash bcrypt da senha"""
        return bcrypt.hashpw(senha.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    def _verificar_senha(self, senha: str, hash_armazenado: str) -> bool:
        """Verifica senha contra hash (bcrypt ou SHA256)"""
        if not hash_armazenado or not senha:
            return False
        
        # Bcrypt hash começa com $2b$ ou $2a$
        if hash_armazenado.startswith('$2b$') or hash_armazenado.startswith('$2a$'):
            try:
                return bcrypt.checkpw(senha.encode('utf-8'), hash_armazenado.encode('utf-8'))
            except Exception:
                return False
        
        # SHA256 hash (64 caracteres hex)
        if len(hash_armazenado) == 64:
            return hashlib.sha256(senha.encode()).hexdigest() == hash_armazenado
        
        # Texto plano (não recomendado)
        return hash_armazenado == senha
    
    def autenticar(self, username: str, senha: str) -> Optional[Usuario]:
        """Autentica um usuário gestor.
        Busca case-insensitive por username.
        Aceita senha em texto plano ou hash SHA256 na coluna 'senha_hash' ou 'senha'.
        """
        try:
            # Normalizar username
            username_normalizado = username.strip().lower()
            
            # Buscar todos os usuários e filtrar case-insensitive
            resultado = self.supabase.table('usuarios')\
                .select('*')\
                .execute()
            
            print(f"[DEBUG] Buscando usuario: '{username_normalizado}'")
            print(f"[DEBUG] Total usuarios encontrados: {len(resultado.data) if resultado.data else 0}")
            
            if not resultado.data:
                print("[DEBUG] Nenhum usuario na tabela")
                return None
            
            # Mostrar todos os usernames disponíveis
            for u in resultado.data:
                print(f"[DEBUG] Usuario na tabela: '{u.get('username')}' | colunas: {list(u.keys())}")
            
            # Encontrar usuário com username case-insensitive
            usuario_data = None
            for u in resultado.data:
                u_username = (u.get('username') or '').strip().lower()
                if u_username == username_normalizado:
                    usuario_data = u
                    break
            
            if not usuario_data:
                print(f"[DEBUG] Usuario '{username_normalizado}' nao encontrado")
                return None
            
            print(f"[DEBUG] Usuario encontrado: {usuario_data}")
            
            # Ignorar se tiver coluna ativo e estiver inativo
            if usuario_data.get('ativo') is False:
                print("[DEBUG] Usuario inativo")
                return None
            
            # Aceita 'password_hash', 'senha_hash' ou 'senha'
            hash_armazenado = usuario_data.get('password_hash') or usuario_data.get('senha_hash') or usuario_data.get('senha')
            print(f"[DEBUG] Hash armazenado: '{hash_armazenado}'")
            
            if not hash_armazenado:
                print("[DEBUG] Nenhuma senha encontrada no registro")
                return None
            
            # Verificar senha (bcrypt, SHA256 ou texto plano)
            senha_correta = self._verificar_senha(senha, hash_armazenado)
            print(f"[DEBUG] Senha correta: {senha_correta}")
            
            if not senha_correta:
                return None
            
            # Atualizar último login (opcional)
            try:
                self.supabase.table('usuarios')\
                    .update({'ultimo_login': datetime.now().isoformat()})\
                    .eq('id', usuario_data['id'])\
                    .execute()
            except Exception:
                pass
            
            # Criar objeto usuário
            return Usuario(
                id=usuario_data['id'],
                username=usuario_data.get('username', ''),
                nome_completo=usuario_data.get('nome_completo', usuario_data.get('username', '')),
                is_admin=usuario_data.get('is_admin', False),
                perfil=usuario_data.get('perfil', 'Gestor')
            )
        except Exception as e:
            print(f"Erro ao autenticar: {str(e)}")
            import traceback
            traceback.print_exc()
            return None
    
    def autenticar_corretor(self, cpf: str, senha: str) -> Optional[CorretorUser]:
        """Autentica um corretor usando a tabela sienge_corretores"""
        try:
            # Limpar documento (remover pontos, traços e barras)
            doc_limpo = cpf.replace('.', '').replace('-', '').replace('/', '').strip()
            
            print(f"[AUTH] Tentando autenticar corretor com documento: {doc_limpo}")
            
            # Buscar todos os corretores e filtrar em Python (mais confiável)
            resultado = self.supabase.table('sienge_corretores')\
                .select('*')\
                .execute()
            
            corretor_data = None
            if resultado.data:
                for c in resultado.data:
                    # Limpar CPF/CNPJ do banco para comparação
                    cpf_banco = (c.get('cpf') or '').replace('.', '').replace('-', '').replace('/', '').strip()
                    cnpj_banco = (c.get('cnpj') or '').replace('.', '').replace('-', '').replace('/', '').strip()
                    
                    if cpf_banco == doc_limpo or cnpj_banco == doc_limpo:
                        corretor_data = c
                        break
            
            if not corretor_data:
                print(f"[AUTH] Corretor não encontrado com documento: {doc_limpo}")
                return None
            
            print(f"[AUTH] Corretor encontrado: {corretor_data.get('nome')}")
            
            # Ignorar se inativo
            if corretor_data.get('ativo') is False:
                print(f"[AUTH] Corretor inativo")
                return None
            
            # Verificar se tem senha cadastrada
            hash_armazenado = corretor_data.get('senha_hash') or corretor_data.get('password_hash')
            if not hash_armazenado:
                print(f"[AUTH] Corretor não tem senha cadastrada")
                return None
            
            if not self._verificar_senha(senha, hash_armazenado):
                print(f"[AUTH] Senha incorreta")
                return None
            
            # Atualizar último login
            try:
                self.supabase.table('sienge_corretores')\
                    .update({'ultimo_login': datetime.now().isoformat()})\
                    .eq('sienge_id', corretor_data['sienge_id'])\
                    .execute()
            except Exception:
                pass
            
            return CorretorUser(
                id=corretor_data['sienge_id'],
                cpf=corretor_data.get('cpf') or corretor_data.get('cnpj') or '',
                nome=corretor_data.get('nome', ''),
                email=corretor_data.get('email', ''),
                sienge_id=corretor_data.get('sienge_id')
            )
        except Exception as e:
            print(f"Erro ao autenticar corretor: {str(e)}")
            import traceback
            traceback.print_exc()
            return None
    
    def buscar_usuario_por_id(self, user_id: str) -> Optional[Usuario]:
        """Busca usuário pelo ID (para Flask-Login)"""
        try:
            # Verificar se é corretor
            if str(user_id).startswith('corretor_'):
                corretor_id = int(user_id.replace('corretor_', ''))
                resultado = self.supabase.table('sienge_corretores')\
                    .select('*')\
                    .eq('sienge_id', corretor_id)\
                    .execute()
                
                if resultado.data:
                    corretor_data = resultado.data[0]
                    # Verificar se está ativo (pode não ter o campo, então default True)
                    if corretor_data.get('ativo') is False:
                        return None
                    return CorretorUser(
                        id=corretor_data['sienge_id'],
                        cpf=corretor_data.get('cpf') or corretor_data.get('cnpj') or '',
                        nome=corretor_data.get('nome', ''),
                        email=corretor_data.get('email', ''),
                        sienge_id=corretor_data.get('sienge_id')
                    )
                return None
            
            # Buscar usuário gestor
            resultado = self.supabase.table('usuarios')\
                .select('*')\
                .eq('id', int(user_id))\
                .eq('ativo', True)\
                .execute()
            
            if resultado.data:
                usuario_data = resultado.data[0]
                return Usuario(
                    id=usuario_data['id'],
                    username=usuario_data['username'],
                    nome_completo=usuario_data['nome_completo'],
                    is_admin=usuario_data.get('is_admin', False),
                    perfil=usuario_data.get('perfil', 'Gestor')
                )
            return None
        except Exception as e:
            print(f"Erro ao buscar usuário: {str(e)}")
            return None
    
    def criar_usuario(self, username: str, senha: str, nome_completo: str, is_admin: bool = False, perfil: str = 'Gestor') -> dict:
        """Cria um novo usuário gestor"""
        try:
            # Verificar se username já existe
            existente = self.supabase.table('usuarios')\
                .select('id')\
                .eq('username', username)\
                .execute()
            
            if existente.data:
                return {'sucesso': False, 'erro': 'Username já existe'}
            
            # Criar usuário
            resultado = self.supabase.table('usuarios').insert({
                'username': username.lower(),
                'password_hash': self._hash_senha(senha),
                'nome_completo': nome_completo,
                'is_admin': is_admin,
                'perfil': perfil,
                'ativo': True,
                'criado_em': datetime.now().isoformat()
            }).execute()
            
            if resultado.data:
                return {'sucesso': True, 'usuario_id': resultado.data[0]['id']}
            return {'sucesso': False, 'erro': 'Erro ao criar usuário'}
        except Exception as e:
            return {'sucesso': False, 'erro': str(e)}
    
    def criar_corretor(self, cpf: str, senha: str, nome: str, email: str = None, sienge_id: int = None) -> dict:
        """Cadastra senha para um corretor existente na tabela sienge_corretores"""
        try:
            doc_limpo = cpf.replace('.', '').replace('-', '').replace('/', '').strip()
            
            print(f"[AUTH] Criando acesso para corretor: {nome}, documento: {doc_limpo}, sienge_id: {sienge_id}")
            
            # Verificar se o corretor existe na tabela sienge_corretores
            corretor = None
            
            if sienge_id:
                existente = self.supabase.table('sienge_corretores')\
                    .select('*')\
                    .eq('sienge_id', sienge_id)\
                    .execute()
                if existente.data:
                    corretor = existente.data[0]
            
            # Se não encontrou por sienge_id, buscar por CPF/CNPJ
            if not corretor:
                existente = self.supabase.table('sienge_corretores')\
                    .select('*')\
                    .execute()
                
                if existente.data:
                    for c in existente.data:
                        cpf_banco = (c.get('cpf') or '').replace('.', '').replace('-', '').replace('/', '').strip()
                        cnpj_banco = (c.get('cnpj') or '').replace('.', '').replace('-', '').replace('/', '').strip()
                        
                        if cpf_banco == doc_limpo or cnpj_banco == doc_limpo:
                            corretor = c
                            break
            
            if not corretor:
                return {'sucesso': False, 'erro': 'Corretor não encontrado no sistema SIENGE. Verifique o CPF/CNPJ.'}
            
            # Verificar se já tem senha cadastrada
            if corretor.get('senha_hash') or corretor.get('password_hash'):
                return {'sucesso': False, 'erro': 'Este corretor já possui cadastro. Use a opção de login.'}
            
            # Atualizar o registro com a senha e email
            atualizacao = {
                'senha_hash': self._hash_senha(senha),
                'cadastro_login_em': datetime.now().isoformat()
            }
            
            # Atualizar email se fornecido e não existir
            if email and not corretor.get('email'):
                atualizacao['email'] = email
            
            resultado = self.supabase.table('sienge_corretores')\
                .update(atualizacao)\
                .eq('sienge_id', corretor['sienge_id'])\
                .execute()
            
            if resultado.data:
                print(f"[AUTH] Acesso criado com sucesso para corretor: {corretor['nome']}")
                return {'sucesso': True, 'corretor_id': corretor['sienge_id']}
            return {'sucesso': False, 'erro': 'Erro ao criar acesso do corretor'}
        except Exception as e:
            print(f"[AUTH] Erro ao criar corretor: {str(e)}")
            import traceback
            traceback.print_exc()
            return {'sucesso': False, 'erro': str(e)}
    
    def listar_usuarios(self) -> list:
        """Lista todos os usuários ativos"""
        try:
            resultado = self.supabase.table('usuarios')\
                .select('id, username, nome_completo, is_admin, perfil, criado_em, ultimo_login')\
                .eq('ativo', True)\
                .order('nome_completo')\
                .execute()
            return resultado.data if resultado.data else []
        except Exception as e:
            print(f"Erro ao listar usuários: {str(e)}")
            return []
    
    def listar_corretores_usuarios(self) -> list:
        """Lista todos os corretores que têm acesso ao sistema (com senha cadastrada)"""
        try:
            # Buscar corretores que têm senha_hash (ou seja, cadastraram acesso)
            resultado = self.supabase.table('sienge_corretores')\
                .select('sienge_id, cpf, cnpj, nome, email, telefone, ativo, ultimo_login, cadastro_login_em')\
                .not_.is_('senha_hash', 'null')\
                .order('nome')\
                .execute()
            
            corretores = resultado.data if resultado.data else []
            # Mapear campos para compatibilidade
            return [{
                'id': c.get('sienge_id'),
                'cpf': c.get('cpf') or c.get('cnpj') or '-',
                'nome': c.get('nome'),
                'email': c.get('email'),
                'sienge_id': c.get('sienge_id'),
                'ultimo_login': c.get('ultimo_login'),
                'cadastro_em': c.get('cadastro_login_em')
            } for c in corretores]
        except Exception as e:
            print(f"Erro ao listar corretores: {str(e)}")
            return []
    
    def atualizar_senha(self, user_id: int, nova_senha: str, is_corretor: bool = False) -> dict:
        """Atualiza a senha de um usuário"""
        try:
            if is_corretor:
                # Para corretor, usar sienge_corretores com sienge_id
                self.supabase.table('sienge_corretores')\
                    .update({'senha_hash': self._hash_senha(nova_senha)})\
                    .eq('sienge_id', user_id)\
                    .execute()
            else:
                # Para gestor, usar usuarios com id
                self.supabase.table('usuarios')\
                    .update({'password_hash': self._hash_senha(nova_senha)})\
                    .eq('id', user_id)\
                    .execute()
            
            return {'sucesso': True}
        except Exception as e:
            return {'sucesso': False, 'erro': str(e)}
    
    def desativar_usuario(self, user_id: int, is_corretor: bool = False) -> dict:
        """Desativa um usuário"""
        try:
            if is_corretor:
                # Para corretor, remover a senha (não desativa o corretor no SIENGE)
                self.supabase.table('sienge_corretores')\
                    .update({'senha_hash': None})\
                    .eq('sienge_id', user_id)\
                    .execute()
            else:
                self.supabase.table('usuarios')\
                    .update({'ativo': False})\
                    .eq('id', user_id)\
                    .execute()
            
            return {'sucesso': True}
        except Exception as e:
            return {'sucesso': False, 'erro': str(e)}


def traduzir_status(status: str) -> str:
    """Traduz status do Sienge para português"""
    if not status:
        return 'Não informado'
    
    status_lower = status.lower().strip()
    
    traducoes = {
        'paidout': 'Pago',
        'paid out': 'Pago',
        'paid': 'Pago',
        'pago': 'Pago',
        'pending': 'Pendente',
        'pendente': 'Pendente',
        'overdue': 'Vencido',
        'vencido': 'Vencido',
        'cancelled': 'Cancelado',
        'canceled': 'Cancelado',
        'cancelado': 'Cancelado',
        'active': 'Ativo',
        'ativo': 'Ativo',
        'inactive': 'Inativo',
        'inativo': 'Inativo',
        'approved': 'Aprovado',
        'aprovado': 'Aprovado',
        'rejected': 'Rejeitado',
        'rejeitado': 'Rejeitado',
        'waiting': 'Aguardando',
        'aguardando': 'Aguardando',
        'processing': 'Processando',
        'processando': 'Processando',
        'completed': 'Concluído',
        'concluido': 'Concluído',
        'partial': 'Parcial',
        'parcial': 'Parcial',
        'open': 'Aberto',
        'aberto': 'Aberto',
        'closed': 'Fechado',
        'fechado': 'Fechado',
    }
    
    # Busca exata
    if status_lower in traducoes:
        return traducoes[status_lower]
    
    # Busca parcial
    for key, value in traducoes.items():
        if key in status_lower:
            return value
    
    return status  # Retorna original se não encontrar tradução
