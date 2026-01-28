"""
Sincronização Sienge → Supabase - Sistema de Comissões Young
Sincroniza dados do Sienge para o banco Supabase
"""

import os
from datetime import datetime
from typing import List, Dict, Optional
from supabase import create_client
from dotenv import load_dotenv
from sienge_client import sienge_client

load_dotenv()


class SiengeSupabaseSync:
    """Sincroniza dados do Sienge para Supabase"""
    
    def __init__(self):
        self.supabase = create_client(
            os.getenv('SUPABASE_URL'),
            os.getenv('SUPABASE_KEY')
        )
        self.sienge = sienge_client
    
    def sync_empreendimentos(self) -> dict:
        """Sincroniza empreendimentos do Sienge"""
        try:
            buildings = self.sienge.get_buildings()
            count = 0
            
            for building in buildings:
                data = {
                    'sienge_id': building.get('id'),
                    'nome': building.get('name'),
                    'codigo': building.get('code'),
                    'company_id': building.get('companyId'),
                    'atualizado_em': datetime.now().isoformat()
                }
                
                # Upsert (insert ou update)
                self.supabase.table('sienge_empreendimentos').upsert(
                    data, 
                    on_conflict='sienge_id'
                ).execute()
                count += 1
            
            return {'sucesso': True, 'total': count}
        except Exception as e:
            print(f"Erro ao sincronizar empreendimentos: {str(e)}")
            return {'sucesso': False, 'erro': str(e)}
    
    def sync_contratos(self, building_id: int = None) -> dict:
        """Sincroniza contratos do Sienge"""
        try:
            contracts = self.sienge.get_all_contracts_paginated(building_id=building_id)
            count = 0
            
            for contract in contracts:
                data = {
                    'sienge_id': contract.get('id'),
                    'numero_contrato': contract.get('contractNumber'),
                    'building_id': contract.get('buildingId'),
                    'company_id': contract.get('companyId'),
                    'nome_cliente': contract.get('customerName'),
                    'data_contrato': contract.get('contractDate'),
                    'valor_total': contract.get('totalValue'),
                    'valor_a_vista': contract.get('cashValue') or contract.get('totalValue'),
                    'status': contract.get('status'),
                    'unidade': contract.get('unitName'),
                    'atualizado_em': datetime.now().isoformat()
                }
                
                self.supabase.table('sienge_contratos').upsert(
                    data,
                    on_conflict='sienge_id'
                ).execute()
                count += 1
            
            return {'sucesso': True, 'total': count}
        except Exception as e:
            print(f"Erro ao sincronizar contratos: {str(e)}")
            return {'sucesso': False, 'erro': str(e)}
    
    def sync_corretores(self, building_id: int = None) -> dict:
        """Sincroniza corretores do Sienge"""
        try:
            brokers = self.sienge.get_brokers(building_id=building_id)
            count = 0
            
            for broker in brokers:
                data = {
                    'sienge_id': broker.get('id'),
                    'nome': broker.get('name'),
                    'cpf': broker.get('cpf'),
                    'email': broker.get('email'),
                    'telefone': broker.get('phone'),
                    'ativo': broker.get('active', True),
                    'atualizado_em': datetime.now().isoformat()
                }
                
                self.supabase.table('sienge_corretores').upsert(
                    data,
                    on_conflict='sienge_id'
                ).execute()
                count += 1
            
            return {'sucesso': True, 'total': count}
        except Exception as e:
            print(f"Erro ao sincronizar corretores: {str(e)}")
            return {'sucesso': False, 'erro': str(e)}
    
    def sync_comissoes(self, building_id: int = None) -> dict:
        """Sincroniza comissões do Sienge"""
        try:
            commissions = self.sienge.get_all_commissions_paginated(building_id=building_id)
            count = 0
            
            for commission in commissions:
                data = {
                    'sienge_id': commission.get('id'),
                    'numero_contrato': commission.get('contractNumber'),
                    'building_id': commission.get('buildingId'),
                    'company_id': commission.get('companyId'),
                    'broker_id': commission.get('brokerId'),
                    'broker_nome': commission.get('brokerName'),
                    'customer_name': commission.get('customerName'),
                    'enterprise_name': commission.get('enterpriseName') or commission.get('buildingName'),
                    'unit_name': commission.get('unitName'),
                    'commission_value': commission.get('commissionValue') or commission.get('value'),
                    'installment_status': commission.get('installmentStatus') or commission.get('status'),
                    'commission_date': commission.get('commissionDate') or commission.get('date'),
                    'status_aprovacao': 'Pendente',
                    'atualizado_em': datetime.now().isoformat()
                }
                
                self.supabase.table('sienge_comissoes').upsert(
                    data,
                    on_conflict='sienge_id'
                ).execute()
                count += 1
            
            return {'sucesso': True, 'total': count}
        except Exception as e:
            print(f"Erro ao sincronizar comissões: {str(e)}")
            return {'sucesso': False, 'erro': str(e)}
    
    def sync_itbi(self, building_id: int = None) -> dict:
        """Sincroniza valores de ITBI"""
        try:
            # ITBI geralmente vem junto com os dados do contrato
            contracts = self.sienge.get_all_contracts_paginated(building_id=building_id)
            count = 0
            
            for contract in contracts:
                itbi_value = contract.get('itbiValue') or contract.get('taxValue')
                if itbi_value:
                    data = {
                        'numero_contrato': contract.get('contractNumber'),
                        'building_id': contract.get('buildingId'),
                        'valor_itbi': itbi_value,
                        'atualizado_em': datetime.now().isoformat()
                    }
                    
                    self.supabase.table('sienge_itbi').upsert(
                        data,
                        on_conflict='numero_contrato,building_id'
                    ).execute()
                    count += 1
            
            return {'sucesso': True, 'total': count}
        except Exception as e:
            print(f"Erro ao sincronizar ITBI: {str(e)}")
            return {'sucesso': False, 'erro': str(e)}
    
    def sync_valores_pagos(self, building_id: int = None) -> dict:
        """Sincroniza valores pagos dos contratos"""
        try:
            contracts = self.sienge.get_all_contracts_paginated(building_id=building_id)
            count = 0
            
            for contract in contracts:
                contract_id = contract.get('id')
                if contract_id:
                    # Buscar recebíveis do contrato
                    receivables = self.sienge.get_receivables(contract_id)
                    valor_pago = sum(
                        float(r.get('paidValue', 0) or 0) 
                        for r in receivables 
                        if r.get('status', '').lower() in ['paidout', 'paid']
                    )
                    
                    if valor_pago > 0:
                        data = {
                            'numero_contrato': contract.get('contractNumber'),
                            'building_id': contract.get('buildingId'),
                            'valor_pago': valor_pago,
                            'atualizado_em': datetime.now().isoformat()
                        }
                        
                        self.supabase.table('sienge_valor_pago').upsert(
                            data,
                            on_conflict='numero_contrato,building_id'
                        ).execute()
                        count += 1
            
            return {'sucesso': True, 'total': count}
        except Exception as e:
            print(f"Erro ao sincronizar valores pagos: {str(e)}")
            return {'sucesso': False, 'erro': str(e)}
    
    def sync_all(self, building_id: int = None) -> dict:
        """Executa sincronização completa"""
        resultados = {}
        
        print("Sincronizando empreendimentos...")
        resultados['empreendimentos'] = self.sync_empreendimentos()
        
        print("Sincronizando contratos...")
        resultados['contratos'] = self.sync_contratos(building_id)
        
        print("Sincronizando corretores...")
        resultados['corretores'] = self.sync_corretores(building_id)
        
        print("Sincronizando comissões...")
        resultados['comissoes'] = self.sync_comissoes(building_id)
        
        print("Sincronizando ITBI...")
        resultados['itbi'] = self.sync_itbi(building_id)
        
        print("Sincronizando valores pagos...")
        resultados['valores_pagos'] = self.sync_valores_pagos(building_id)
        
        # Registrar última sincronização
        self.registrar_sincronizacao(resultados)
        
        return resultados
    
    def registrar_sincronizacao(self, resultados: dict):
        """Registra log de sincronização"""
        try:
            self.supabase.table('log_sincronizacoes').insert({
                'data_sincronizacao': datetime.now().isoformat(),
                'resultados': resultados,
                'sucesso': all(r.get('sucesso', False) for r in resultados.values())
            }).execute()
        except Exception as e:
            print(f"Erro ao registrar sincronização: {str(e)}")
    
    def get_ultima_sincronizacao(self) -> Optional[dict]:
        """Retorna data da última sincronização"""
        try:
            result = self.supabase.table('log_sincronizacoes')\
                .select('*')\
                .order('data_sincronizacao', desc=True)\
                .limit(1)\
                .execute()
            
            if result.data:
                return result.data[0]
            return None
        except Exception as e:
            print(f"Erro ao buscar última sincronização: {str(e)}")
            return None
    
    # ==================== MÉTODOS DE CONSULTA ====================
    
    def get_empreendimentos(self) -> List[Dict]:
        """Retorna todos os empreendimentos"""
        # Mapeamento de building_id para nome do empreendimento (strings e inteiros)
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
        
        try:
            # Buscar building_ids unicos de sienge_contratos
            result = self.supabase.table('sienge_contratos')\
                .select('building_id')\
                .execute()
            
            if result.data:
                # Extrair building_ids unicos
                building_ids = set()
                for c in result.data:
                    bid = c.get('building_id')
                    if bid:
                        building_ids.add(bid)
                
                print(f"[Sync] building_ids encontrados: {sorted(building_ids, key=str)}")
                
                # Criar lista de empreendimentos
                empreendimentos = []
                for bid in building_ids:
                    nome = EMPREENDIMENTOS.get(bid, f'Empreendimento {bid}')
                    empreendimentos.append({
                        'sienge_id': bid,
                        'id': bid,
                        'nome': nome
                    })
                
                # Ordenar por nome
                empreendimentos.sort(key=lambda x: x['nome'])
                print(f"[Sync] get_empreendimentos: {len(empreendimentos)} registros")
                return empreendimentos
            return []
        except Exception as e:
            print(f"[Sync] Erro ao buscar empreendimentos: {str(e)}")
            return []
    
    def get_contratos_por_empreendimento(self, building_id: int) -> List[Dict]:
        """Retorna contratos de um empreendimento da tabela sienge_contratos"""
        try:
            result = self.supabase.table('sienge_contratos')\
                .select('*')\
                .eq('building_id', building_id)\
                .order('numero_contrato')\
                .execute()
            data = result.data if result.data else []
            
            # Mapear campos para o formato esperado pelo frontend
            for c in data:
                # Mapear unidades -> unidade
                if 'unidades' in c and 'unidade' not in c:
                    c['unidade'] = c.get('unidades')
            
            print(f"[Sync] get_contratos_por_empreendimento({building_id}): {len(data)} registros")
            return data
        except Exception as e:
            print(f"[Sync] Erro ao buscar contratos: {str(e)}")
            return []
    
    def get_contrato_por_numero(self, numero_contrato: str, building_id) -> Optional[Dict]:
        """Retorna um contrato pelo numero da tabela sienge_contratos"""
        try:
            print(f"[Sync] get_contrato_por_numero: numero_contrato={numero_contrato}, building_id={building_id}")
            result = self.supabase.table('sienge_contratos')\
                .select('*')\
                .eq('numero_contrato', numero_contrato)\
                .eq('building_id', building_id)\
                .limit(1)\
                .execute()
            contrato = result.data[0] if result.data else None
            if contrato:
                print(f"[Sync] Contrato encontrado: {contrato.get('numero_contrato')}")
            else:
                print(f"[Sync] Contrato NAO encontrado")
            return contrato
        except Exception as e:
            print(f"[Sync] Erro ao buscar contrato: {str(e)}")
            return None
    
    def get_corretores(self) -> List[Dict]:
        """Retorna todos os corretores extraidos de sienge_contratos"""
        try:
            # Tentar tabela sienge_corretores primeiro
            result = self.supabase.table('sienge_corretores')\
                .select('*')\
                .eq('ativo', True)\
                .order('nome')\
                .execute()
            data = result.data if result.data else []
            if data:
                print(f"[Sync] get_corretores: {len(data)} registros")
                return data
        except Exception as e:
            print(f"[Sync] Tabela sienge_corretores nao encontrada...")
        
        # Fallback: extrair corretores unicos de sienge_contratos
        try:
            result = self.supabase.table('sienge_contratos')\
                .select('corretor_id, corretor')\
                .execute()
            
            if result.data:
                corretores_map = {}
                for c in result.data:
                    cid = c.get('corretor_id')
                    nome = c.get('corretor')
                    if cid and nome and cid not in corretores_map:
                        corretores_map[cid] = {
                            'sienge_id': cid,
                            'id': cid,
                            'nome': nome,
                            'ativo': True
                        }
                
                data = sorted(corretores_map.values(), key=lambda x: x['nome'] or '')
                print(f"[Sync] get_corretores (de sienge_contratos): {len(data)} registros")
                return data
            return []
        except Exception as e2:
            print(f"[Sync] Erro ao buscar corretores: {str(e2)}")
            return []
    
    def get_comissoes_por_corretor(self, corretor_id: int = None, corretor_nome: str = None) -> List[Dict]:
        """Retorna comissões de um corretor"""
        try:
            query = self.supabase.table('sienge_comissoes').select('*')
            
            if corretor_id:
                query = query.eq('broker_id', corretor_id)
            elif corretor_nome:
                query = query.ilike('broker_nome', f'%{corretor_nome}%')
            
            result = query.execute()
            return result.data if result.data else []
        except Exception as e:
            print(f"Erro ao buscar comissões do corretor: {str(e)}")
            return []
    
    def get_itbi_por_contrato(self, numero_contrato: str, building_id: int) -> Optional[float]:
        """Retorna valor ITBI de um contrato"""
        try:
            result = self.supabase.table('sienge_itbi')\
                .select('valor_itbi')\
                .eq('numero_contrato', numero_contrato)\
                .eq('building_id', building_id)\
                .limit(1)\
                .execute()
            
            if result.data:
                return result.data[0].get('valor_itbi')
            return None
        except Exception as e:
            print(f"Erro ao buscar ITBI: {str(e)}")
            return None
    
    def get_valor_pago_por_contrato(self, numero_contrato: str, building_id: int) -> Optional[float]:
        """Retorna valor pago de um contrato"""
        try:
            result = self.supabase.table('sienge_valor_pago')\
                .select('valor_pago')\
                .eq('numero_contrato', numero_contrato)\
                .eq('building_id', building_id)\
                .limit(1)\
                .execute()
            
            if result.data:
                return result.data[0].get('valor_pago')
            return None
        except Exception as e:
            print(f"Erro ao buscar valor pago: {str(e)}")
            return None
    
    def buscar_contratos_por_lote(self, numero_lote: str) -> List[Dict]:
        """Busca contratos que contenham o numero do lote na tabela sienge_contratos"""
        import json
        
        # Mapeamento de building_id para nome do empreendimento (strings e inteiros)
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
        
        def extrair_numero_lote(unidades_data):
            """Extrai numeros de lote do campo unidades (pode ser jsonb)"""
            if not unidades_data:
                return []
            
            if isinstance(unidades_data, list):
                # Ja e uma lista de objetos
                return [str(u.get('name', '')) for u in unidades_data if isinstance(u, dict)]
            elif isinstance(unidades_data, str):
                try:
                    parsed = json.loads(unidades_data)
                    if isinstance(parsed, list):
                        return [str(u.get('name', '')) for u in parsed if isinstance(u, dict)]
                except:
                    return [unidades_data]
            return [str(unidades_data)]
        
        try:
            # Buscar por numero_contrato ou nome_cliente (campos texto)
            result = self.supabase.table('sienge_contratos')\
                .select('*')\
                .or_(f'numero_contrato.ilike.%{numero_lote}%,nome_cliente.ilike.%{numero_lote}%')\
                .limit(100)\
                .execute()
            
            contratos_texto = result.data if result.data else []
            
            # Tambem buscar todos e filtrar pelo campo unidades em Python
            result_all = self.supabase.table('sienge_contratos')\
                .select('*')\
                .limit(2000)\
                .execute()
            
            contratos_por_unidade = []
            if result_all.data:
                for c in result_all.data:
                    lotes = extrair_numero_lote(c.get('unidades'))
                    # Verificar se algum lote contem o termo buscado
                    if any(numero_lote.lower() in lote.lower() for lote in lotes):
                        contratos_por_unidade.append(c)
            
            # Combinar resultados sem duplicatas
            contratos_ids = set()
            contratos = []
            
            for c in contratos_texto + contratos_por_unidade:
                cid = c.get('sienge_id') or c.get('id') or c.get('numero_contrato')
                if cid not in contratos_ids:
                    contratos_ids.add(cid)
                    contratos.append(c)
            
            # Limitar a 50 resultados
            contratos = contratos[:50]
            
            # Mapear campos para o formato esperado pelo frontend
            for c in contratos:
                # Mapear unidades -> unidade
                if 'unidades' in c and 'unidade' not in c:
                    c['unidade'] = c.get('unidades')
                # Adicionar nome do empreendimento
                bid = c.get('building_id')
                c['sienge_empreendimentos'] = {'nome': EMPREENDIMENTOS.get(bid, f'Empreendimento {bid}')}
            
            print(f"[Sync] buscar_contratos_por_lote('{numero_lote}'): {len(contratos)} registros")
            return contratos
        except Exception as e:
            print(f"[Sync] Erro ao buscar contratos por lote: {str(e)}")
            return []
