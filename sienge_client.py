"""
Cliente da API Sienge - Sistema de Comissões Young
Gerencia comunicação com a API do Sienge para buscar dados de contratos, comissões, etc.
"""

import os
import requests
from requests.auth import HTTPBasicAuth
from typing import Optional, List, Dict
from dotenv import load_dotenv

load_dotenv()


class SiengeClient:
    """Cliente para API do Sienge"""
    
    def __init__(self):
        self.base_url = os.getenv('SIENGE_BASE_URL', 'https://api.sienge.com.br/youngemp/public/api')
        self.username = os.getenv('SIENGE_USERNAME')
        self.password = os.getenv('SIENGE_PASSWORD')
        self.company_id = os.getenv('SIENGE_COMPANY_ID', '5')
        self.auth = HTTPBasicAuth(self.username, self.password)
        self.timeout = 30
    
    def _make_request(self, endpoint: str, params: dict = None) -> Optional[dict]:
        """Faz requisição à API do Sienge"""
        try:
            url = f"{self.base_url}/{endpoint}"
            response = requests.get(
                url,
                auth=self.auth,
                params=params,
                timeout=self.timeout
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Erro na requisição Sienge: {str(e)}")
            return None
    
    def get_buildings(self) -> List[Dict]:
        """Busca todos os empreendimentos"""
        try:
            result = self._make_request('buildings', {'companyId': self.company_id})
            if result and 'resultSetMetadata' in result:
                return result.get('results', [])
            return result if isinstance(result, list) else []
        except Exception as e:
            print(f"Erro ao buscar empreendimentos: {str(e)}")
            return []
    
    def get_building_units(self, building_id: int) -> List[Dict]:
        """Busca unidades de um empreendimento"""
        try:
            result = self._make_request(f'buildings/{building_id}/units', {
                'companyId': self.company_id
            })
            if result and 'resultSetMetadata' in result:
                return result.get('results', [])
            return result if isinstance(result, list) else []
        except Exception as e:
            print(f"Erro ao buscar unidades: {str(e)}")
            return []
    
    def get_contracts(self, building_id: int = None, offset: int = 0, limit: int = 100) -> List[Dict]:
        """Busca contratos"""
        try:
            params = {
                'companyId': self.company_id,
                'offset': offset,
                'limit': limit
            }
            if building_id:
                params['buildingId'] = building_id
            
            result = self._make_request('sales-contracts', params)
            if result and 'resultSetMetadata' in result:
                return result.get('results', [])
            return result if isinstance(result, list) else []
        except Exception as e:
            print(f"Erro ao buscar contratos: {str(e)}")
            return []
    
    def get_contract_details(self, contract_id: int) -> Optional[Dict]:
        """Busca detalhes de um contrato específico"""
        try:
            return self._make_request(f'sales-contracts/{contract_id}')
        except Exception as e:
            print(f"Erro ao buscar detalhes do contrato: {str(e)}")
            return None
    
    def get_contract_by_number(self, contract_number: str, building_id: int) -> Optional[Dict]:
        """Busca contrato pelo número"""
        try:
            contracts = self.get_contracts(building_id=building_id, limit=500)
            for contract in contracts:
                if str(contract.get('contractNumber')) == str(contract_number):
                    return contract
            return None
        except Exception as e:
            print(f"Erro ao buscar contrato por número: {str(e)}")
            return None
    
    def get_brokers(self, building_id: int = None) -> List[Dict]:
        """Busca corretores"""
        try:
            params = {'companyId': self.company_id}
            if building_id:
                params['buildingId'] = building_id
            
            result = self._make_request('brokers', params)
            if result and 'resultSetMetadata' in result:
                return result.get('results', [])
            return result if isinstance(result, list) else []
        except Exception as e:
            print(f"Erro ao buscar corretores: {str(e)}")
            return []
    
    def get_broker_commissions(self, broker_id: int, building_id: int = None) -> List[Dict]:
        """Busca comissões de um corretor"""
        try:
            params = {
                'companyId': self.company_id,
                'brokerId': broker_id
            }
            if building_id:
                params['buildingId'] = building_id
            
            result = self._make_request('broker-commissions', params)
            if result and 'resultSetMetadata' in result:
                return result.get('results', [])
            return result if isinstance(result, list) else []
        except Exception as e:
            print(f"Erro ao buscar comissões do corretor: {str(e)}")
            return []
    
    def get_commissions(self, building_id: int = None, offset: int = 0, limit: int = 100) -> List[Dict]:
        """Busca todas as comissões"""
        try:
            params = {
                'companyId': self.company_id,
                'offset': offset,
                'limit': limit
            }
            if building_id:
                params['buildingId'] = building_id
            
            result = self._make_request('broker-commissions', params)
            if result and 'resultSetMetadata' in result:
                return result.get('results', [])
            return result if isinstance(result, list) else []
        except Exception as e:
            print(f"Erro ao buscar comissões: {str(e)}")
            return []
    
    def get_customers(self, building_id: int = None) -> List[Dict]:
        """Busca clientes"""
        try:
            params = {'companyId': self.company_id}
            if building_id:
                params['buildingId'] = building_id
            
            result = self._make_request('customers', params)
            if result and 'resultSetMetadata' in result:
                return result.get('results', [])
            return result if isinstance(result, list) else []
        except Exception as e:
            print(f"Erro ao buscar clientes: {str(e)}")
            return []
    
    def get_receivables(self, contract_id: int) -> List[Dict]:
        """Busca parcelas/recebíveis de um contrato"""
        try:
            result = self._make_request(f'sales-contracts/{contract_id}/receivables')
            if result and 'resultSetMetadata' in result:
                return result.get('results', [])
            return result if isinstance(result, list) else []
        except Exception as e:
            print(f"Erro ao buscar recebíveis: {str(e)}")
            return []
    
    def get_all_contracts_paginated(self, building_id: int = None) -> List[Dict]:
        """Busca todos os contratos com paginação automática"""
        all_contracts = []
        offset = 0
        limit = 100
        
        while True:
            contracts = self.get_contracts(building_id=building_id, offset=offset, limit=limit)
            if not contracts:
                break
            all_contracts.extend(contracts)
            if len(contracts) < limit:
                break
            offset += limit
        
        return all_contracts
    
    def get_all_commissions_paginated(self, building_id: int = None) -> List[Dict]:
        """Busca todas as comissões com paginação automática"""
        all_commissions = []
        offset = 0
        limit = 100
        
        while True:
            commissions = self.get_commissions(building_id=building_id, offset=offset, limit=limit)
            if not commissions:
                break
            all_commissions.extend(commissions)
            if len(commissions) < limit:
                break
            offset += limit
        
        return all_commissions


# Instância global
sienge_client = SiengeClient()
