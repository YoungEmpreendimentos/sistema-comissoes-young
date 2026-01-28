"""
Gera o hash SHA256 da senha para usar na tabela 'usuarios' do Supabase.
O login do sistema compara a senha digitada com esse hash.

Como usar:
  1. Execute: python gerar_hash_senha.py
  2. Digite a senha quando pedir
  3. Copie o hash gerado
  4. No Supabase (Table Editor > usuarios), na linha do usuário "Antonioalves",
     cole o hash na coluna 'senha_hash' (ou 'senha', se for o nome da sua coluna)
"""

import hashlib
import getpass


def hash_senha(senha: str) -> str:
    return hashlib.sha256(senha.encode()).hexdigest()


if __name__ == '__main__':
    print('=' * 60)
    print('  Gerador de hash de senha - Sistema de Comissões Young')
    print('=' * 60)
    print()
    print('A senha não será exibida enquanto você digita.')
    senha = getpass.getpass('Digite a senha do usuário: ')
    if not senha:
        print('Nenhuma senha informada.')
        exit(1)
    h = hash_senha(senha)
    print()
    print('Hash SHA256 (copie e cole na coluna senha_hash no Supabase):')
    print()
    print(h)
    print()
    print('No Supabase: Table Editor > usuarios > edite a linha do usuário')
    print("e cole esse valor na coluna 'senha_hash' (ou 'senha').")
    print()
