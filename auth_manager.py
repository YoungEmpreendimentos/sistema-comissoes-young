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
        """Autentica um corretor"""
        try:
            # Limpar CPF (remover pontos e traços)
            cpf_limpo = cpf.replace('.', '').replace('-', '').strip()
            
            resultado = self.supabase.table('corretores_usuarios')\
                .select('*')\
                .eq('cpf', cpf_limpo)\
                .execute()
            
            if not resultado.data:
                return None
            
            corretor_data = resultado.data[0]
            
            # Ignorar se inativo
            if corretor_data.get('ativo') is False:
                return None
            
            # Verificar senha (bcrypt, SHA256 ou texto plano)
            hash_armazenado = corretor_data.get('password_hash') or corretor_data.get('senha_hash') or corretor_data.get('senha')
            if not hash_armazenado:
                return None
            
            if not self._verificar_senha(senha, hash_armazenado):
                return None
            
            # Atualizar último login
            try:
                self.supabase.table('corretores_usuarios')\
                    .update({'ultimo_login': datetime.now().isoformat()})\
                    .eq('id', corretor_data['id'])\
                    .execute()
            except Exception:
                pass
            
            return CorretorUser(
                id=corretor_data['id'],
                cpf=corretor_data['cpf'],
                nome=corretor_data.get('nome', ''),
                email=corretor_data.get('email', ''),
                sienge_id=corretor_data.get('sienge_id')
            )
        except Exception as e:
            print(f"Erro ao autenticar corretor: {str(e)}")
            return None
    
    def buscar_usuario_por_id(self, user_id: str) -> Optional[Usuario]:
        """Busca usuário pelo ID (para Flask-Login)"""
        try:
            # Verificar se é corretor
            if str(user_id).startswith('corretor_'):
                corretor_id = int(user_id.replace('corretor_', ''))
                resultado = self.supabase.table('corretores_usuarios')\
                    .select('*')\
                    .eq('id', corretor_id)\
                    .eq('ativo', True)\
                    .execute()
                
                if resultado.data:
                    corretor_data = resultado.data[0]
                    return CorretorUser(
                        id=corretor_data['id'],
                        cpf=corretor_data['cpf'],
                        nome=corretor_data['nome'],
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
        """Cria um novo usuário corretor"""
        try:
            cpf_limpo = cpf.replace('.', '').replace('-', '').strip()
            
            # Verificar se CPF já existe
            existente = self.supabase.table('corretores_usuarios')\
                .select('id')\
                .eq('cpf', cpf_limpo)\
                .execute()
            
            if existente.data:
                return {'sucesso': False, 'erro': 'CPF já cadastrado'}
            
            # Criar corretor
            resultado = self.supabase.table('corretores_usuarios').insert({
                'cpf': cpf_limpo,
                'senha_hash': self._hash_senha(senha),
                'nome': nome,
                'email': email,
                'sienge_id': sienge_id,
                'ativo': True,
                'criado_em': datetime.now().isoformat()
            }).execute()
            
            if resultado.data:
                return {'sucesso': True, 'corretor_id': resultado.data[0]['id']}
            return {'sucesso': False, 'erro': 'Erro ao criar corretor'}
        except Exception as e:
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
        """Lista todos os corretores cadastrados no sistema"""
        try:
            # Usar tabela sienge_corretores que vem da sincronizacao
            resultado = self.supabase.table('sienge_corretores')\
                .select('sienge_id, cpf, nome, email, telefone, ativo, atualizado_em')\
                .eq('ativo', True)\
                .order('nome')\
                .execute()
            
            corretores = resultado.data if resultado.data else []
            # Mapear campos para compatibilidade
            return [{
                'id': c.get('sienge_id'),
                'cpf': c.get('cpf') or '-',
                'nome': c.get('nome'),
                'email': c.get('email'),
                'sienge_id': c.get('sienge_id'),
                'ultimo_login': None
            } for c in corretores]
        except Exception as e:
            print(f"Erro ao listar corretores: {str(e)}")
            return []
    
    def atualizar_senha(self, user_id: int, nova_senha: str, is_corretor: bool = False) -> dict:
        """Atualiza a senha de um usuário"""
        try:
            tabela = 'corretores_usuarios' if is_corretor else 'usuarios'
            coluna_senha = 'senha_hash' if is_corretor else 'password_hash'
            
            self.supabase.table(tabela)\
                .update({coluna_senha: self._hash_senha(nova_senha)})\
                .eq('id', user_id)\
                .execute()
            
            return {'sucesso': True}
        except Exception as e:
            return {'sucesso': False, 'erro': str(e)}
    
    def desativar_usuario(self, user_id: int, is_corretor: bool = False) -> dict:
        """Desativa um usuário"""
        try:
            tabela = 'corretores_usuarios' if is_corretor else 'usuarios'
            
            self.supabase.table(tabela)\
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
