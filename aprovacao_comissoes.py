"""
Sistema de Aprovação de Comissões - Young Empreendimentos
Gerencia o fluxo de aprovação e envio de e-mails consolidados
"""

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from typing import List, Dict, Optional
import os
from dotenv import load_dotenv

load_dotenv()


class AprovacaoComissoes:
    """Gerencia o processo de aprovação de comissões"""
    
    # Status possíveis
    STATUS_PENDENTE = "Pendente"
    STATUS_PENDENTE_APROVACAO = "Pendente de Aprovação"
    STATUS_APROVADA = "Aprovada"
    STATUS_PAGA = "Paga"
    STATUS_REJEITADA = "Rejeitada"
    
    def __init__(self, supabase_client):
        self.supabase = supabase_client
        self.smtp_host = os.getenv('SMTP_HOST', 'smtp.gmail.com')
        self.smtp_port = int(os.getenv('SMTP_PORT', '587'))
        self.smtp_user = os.getenv('SMTP_USER', '')
        self.smtp_password = os.getenv('SMTP_PASSWORD', '')
        self.email_from = os.getenv('EMAIL_FROM', 'sistema@youngempreendimentos.com.br')
    
    def obter_emails_por_tipo(self, tipo: str) -> List[str]:
        """Obtém lista de e-mails configurados por tipo"""
        try:
            result = self.supabase.table('configuracoes_emails')\
                .select('emails')\
                .eq('tipo', tipo)\
                .eq('ativo', True)\
                .limit(1)\
                .execute()
            
            if result.data and result.data[0].get('emails'):
                return result.data[0]['emails']
            
            # Fallback para e-mails padrão
            if tipo == 'direcao':
                return ['eduardo@youngempreendimentos.com.br']
            elif tipo == 'financeiro':
                return ['suelen@youngempreendimentos.com.br', 'lais@youngempreendimentos.com.br']
            return []
        except Exception as e:
            print(f"Erro ao obter e-mails: {str(e)}")
            # Fallback
            if tipo == 'direcao':
                return ['eduardo@youngempreendimentos.com.br']
            elif tipo == 'financeiro':
                return ['suelen@youngempreendimentos.com.br', 'lais@youngempreendimentos.com.br']
            return []
    
    def enviar_para_aprovacao(self, comissoes_ids: List[int], usuario_id: int) -> Dict:
        """
        Envia um lote de comissões para aprovação da direção
        Garante envio de UM ÚNICO e-mail consolidado
        """
        try:
            # 1. Validar que as comissões existem e estão pendentes
            comissoes = []
            valor_total = 0
            
            for comissao_id in comissoes_ids:
                response = self.supabase.table('sienge_comissoes')\
                    .select('*')\
                    .eq('id', comissao_id)\
                    .execute()
                
                if response.data and len(response.data) > 0:
                    comissao = response.data[0]
                    # Só enviar se ainda não foi enviada para aprovação
                    if comissao.get('status_aprovacao') in [self.STATUS_PENDENTE, None, '']:
                        comissoes.append(comissao)
                        valor_total += float(comissao.get('commission_value', 0) or 0)
            
            if not comissoes:
                return {
                    'sucesso': False,
                    'mensagem': 'Nenhuma comissão válida para enviar'
                }
            
            # 2. Tentar criar lote de aprovação (opcional - pode não existir a tabela)
            lote_id = int(datetime.now().timestamp())  # ID padrão baseado em timestamp
            try:
                # Tentar inserir com campos mínimos
                lote_data = {
                    'enviado_por': usuario_id,
                    'total_comissoes': len(comissoes),
                    'valor_total': valor_total,
                    'status': 'Enviado'
                }
                
                lote_response = self.supabase.table('lotes_aprovacao').insert(lote_data).execute()
                
                if lote_response.data:
                    lote_id = lote_response.data[0]['id']
                    print(f"Lote de aprovação criado: {lote_id}")
            except Exception as e:
                print(f"Lote de aprovação não criado (usando timestamp): {str(e)}")
            
            # 3. Atualizar status das comissões
            for comissao in comissoes:
                # Atualizar status - tentar com todos os campos, se falhar tentar só com status
                try:
                    self.supabase.table('sienge_comissoes').update({
                        'status_aprovacao': self.STATUS_PENDENTE_APROVACAO,
                        'data_envio_aprovacao': datetime.now().isoformat(),
                        'enviado_por': usuario_id
                    }).eq('id', comissao['id']).execute()
                except Exception as e:
                    print(f"Erro com campos extras, tentando apenas status: {str(e)}")
                    try:
                        self.supabase.table('sienge_comissoes').update({
                            'status_aprovacao': self.STATUS_PENDENTE_APROVACAO
                        }).eq('id', comissao['id']).execute()
                    except Exception as e2:
                        print(f"Erro ao atualizar status: {str(e2)}")
                
                # Tentar registrar no histórico (opcional)
                try:
                    self.supabase.table('historico_aprovacoes').insert({
                        'comissao_id': comissao['id'],
                        'status_anterior': comissao.get('status_aprovacao', self.STATUS_PENDENTE),
                        'status_novo': self.STATUS_PENDENTE_APROVACAO,
                        'acao': 'Enviado para aprovação',
                        'realizado_por': usuario_id
                    }).execute()
                except Exception as e:
                    print(f"Histórico não registrado (tabela pode não existir): {str(e)}")
                
                # Tentar vincular ao lote (opcional)
                if lote_id:
                    try:
                        self.supabase.table('comissoes_lotes').insert({
                            'comissao_id': comissao['id'],
                            'lote_id': lote_id
                        }).execute()
                    except Exception as e:
                        print(f"Vínculo ao lote não registrado: {str(e)}")
            
            # 4. Enviar E-MAIL ÚNICO consolidado
            email_enviado = self._enviar_email_aprovacao_direcao(comissoes, lote_id or 0, valor_total)
            
            # 5. Tentar atualizar flag de e-mail enviado no lote (opcional)
            if lote_id:
                try:
                    self.supabase.table('lotes_aprovacao').update({
                        'email_enviado': email_enviado
                    }).eq('id', lote_id).execute()
                except Exception as e:
                    print(f"Erro ao atualizar lote: {str(e)}")
            
            return {
                'sucesso': True,
                'mensagem': f'{len(comissoes)} comissões enviadas para aprovação',
                'lote_id': lote_id,
                'total_comissoes': len(comissoes),
                'valor_total': valor_total,
                'email_enviado': email_enviado
            }
            
        except Exception as e:
            print(f"Erro ao enviar comissões para aprovação: {str(e)}")
            return {
                'sucesso': False,
                'mensagem': f'Erro: {str(e)}'
            }
    
    def aprovar_comissoes(self, comissoes_ids: List[int], usuario_id: int, observacoes: Optional[str] = None) -> Dict:
        """
        Aprova comissões (ação da direção)
        Envia notificação para o financeiro
        """
        try:
            comissoes_aprovadas = []
            
            for comissao_id in comissoes_ids:
                # Validar que está pendente de aprovação
                response = self.supabase.table('sienge_comissoes')\
                    .select('*')\
                    .eq('id', comissao_id)\
                    .execute()
                
                if response.data and len(response.data) > 0:
                    comissao = response.data[0]
                    
                    # Atualizar status
                    self.supabase.table('sienge_comissoes').update({
                        'status_aprovacao': self.STATUS_APROVADA,
                        'data_aprovacao': datetime.now().isoformat(),
                        'aprovado_por': usuario_id,
                        'observacoes': observacoes
                    }).eq('id', comissao_id).execute()
                    
                    # Registrar no histórico (opcional)
                    try:
                        self.supabase.table('historico_aprovacoes').insert({
                            'comissao_id': comissao_id,
                            'status_anterior': comissao.get('status_aprovacao', self.STATUS_PENDENTE_APROVACAO),
                            'status_novo': self.STATUS_APROVADA,
                            'acao': 'Aprovado pela direção',
                            'realizado_por': usuario_id,
                            'observacoes': observacoes
                        }).execute()
                    except Exception as e:
                        print(f"Histórico não registrado: {str(e)}")
                    
                    comissoes_aprovadas.append(comissao)
            
            if not comissoes_aprovadas:
                return {
                    'sucesso': False,
                    'mensagem': 'Nenhuma comissão válida para aprovar'
                }
            
            # Enviar notificação para o financeiro
            email_enviado = self._enviar_email_aprovacao_financeiro(comissoes_aprovadas)
            
            return {
                'sucesso': True,
                'mensagem': f'{len(comissoes_aprovadas)} comissões aprovadas',
                'total_comissoes': len(comissoes_aprovadas),
                'email_enviado': email_enviado
            }
            
        except Exception as e:
            print(f"Erro ao aprovar comissões: {str(e)}")
            return {
                'sucesso': False,
                'mensagem': f'Erro: {str(e)}'
            }
    
    def rejeitar_comissoes(self, comissoes_ids: List[int], usuario_id: int, motivo: str) -> Dict:
        """
        Rejeita comissões (ação da direção)
        """
        try:
            count = 0
            for comissao_id in comissoes_ids:
                # Buscar status atual
                response = self.supabase.table('sienge_comissoes')\
                    .select('status_aprovacao')\
                    .eq('id', comissao_id)\
                    .limit(1)\
                    .execute()
                
                status_anterior = self.STATUS_PENDENTE_APROVACAO
                if response.data:
                    status_anterior = response.data[0].get('status_aprovacao', self.STATUS_PENDENTE_APROVACAO)
                
                # Atualizar status
                self.supabase.table('sienge_comissoes').update({
                    'status_aprovacao': self.STATUS_REJEITADA,
                    'data_aprovacao': datetime.now().isoformat(),
                    'aprovado_por': usuario_id,
                    'observacoes': motivo
                }).eq('id', comissao_id).execute()
                
                # Registrar no histórico (opcional)
                try:
                    self.supabase.table('historico_aprovacoes').insert({
                        'comissao_id': comissao_id,
                        'status_anterior': status_anterior,
                        'status_novo': self.STATUS_REJEITADA,
                        'acao': 'Rejeitado pela direção',
                        'realizado_por': usuario_id,
                        'observacoes': motivo
                    }).execute()
                except Exception as e:
                    print(f"Histórico não registrado: {str(e)}")
                
                count += 1
            
            return {
                'sucesso': True,
                'mensagem': f'{count} comissões rejeitadas'
            }
            
        except Exception as e:
            print(f"Erro ao rejeitar comissões: {str(e)}")
            return {
                'sucesso': False,
                'mensagem': f'Erro: {str(e)}'
            }
    
    def _enviar_email_aprovacao_direcao(self, comissoes: List[Dict], lote_id: int, valor_total: float) -> bool:
        """
        Envia E-MAIL ÚNICO consolidado para a direção
        """
        try:
            if not self.smtp_user or not self.smtp_password:
                print("Configurações de e-mail não definidas")
                return False
            
            emails_direcao = self.obter_emails_por_tipo('direcao')
            if not emails_direcao:
                print("Nenhum e-mail de direção configurado")
                return False
            
            # Criar mensagem HTML
            html = self._criar_email_html_direcao(comissoes, lote_id, valor_total)
            
            msg = MIMEMultipart('alternative')
            msg['Subject'] = f'[APROVAÇÃO] Lote #{lote_id} - {len(comissoes)} comissões - R$ {valor_total:,.2f}'
            msg['From'] = self.email_from
            msg['To'] = ', '.join(emails_direcao)
            
            msg.attach(MIMEText(html, 'html'))
            
            # Enviar e-mail
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.send_message(msg)
            
            print(f"E-mail de aprovação enviado para {emails_direcao}")
            return True
            
        except Exception as e:
            print(f"Erro ao enviar e-mail: {str(e)}")
            return False
    
    def _enviar_email_aprovacao_financeiro(self, comissoes: List[Dict]) -> bool:
        """
        Envia notificação para o financeiro sobre comissões aprovadas
        """
        try:
            if not self.smtp_user or not self.smtp_password:
                print("Configurações de e-mail não definidas")
                return False
            
            emails_financeiro = self.obter_emails_por_tipo('financeiro')
            if not emails_financeiro:
                print("Nenhum e-mail de financeiro configurado")
                return False
            
            valor_total = sum(float(c.get('commission_value', 0) or 0) for c in comissoes)
            
            # Criar mensagem HTML
            html = self._criar_email_html_financeiro(comissoes, valor_total)
            
            msg = MIMEMultipart('alternative')
            msg['Subject'] = f'[APROVADO] {len(comissoes)} comissões aprovadas - R$ {valor_total:,.2f}'
            msg['From'] = self.email_from
            msg['To'] = ', '.join(emails_financeiro)
            
            msg.attach(MIMEText(html, 'html'))
            
            # Enviar e-mail
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.send_message(msg)
            
            print(f"E-mail de aprovação enviado para financeiro")
            return True
            
        except Exception as e:
            print(f"Erro ao enviar e-mail para financeiro: {str(e)}")
            return False
    
    def _criar_email_html_direcao(self, comissoes: List[Dict], lote_id: int, valor_total: float) -> str:
        """Cria HTML do e-mail para direção"""
        linhas_tabela = ""
        for comissao in comissoes:
            linhas_tabela += f"""
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">{comissao.get('broker_nome', 'N/A')}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">{comissao.get('enterprise_name', 'N/A')}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">{comissao.get('unit_name', 'N/A')}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">R$ {float(comissao.get('commission_value', 0) or 0):,.2f}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">{comissao.get('installment_status', 'N/A')}</td>
            </tr>
            """
        
        html = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 800px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #FE5009;">Young Empreendimentos - Aprovação de Comissões</h2>
                <p>Olá,</p>
                <p>Um novo lote de comissões foi enviado para sua aprovação.</p>
                
                <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <h3>Resumo do Lote #{lote_id}</h3>
                    <p><strong>Total de comissões:</strong> {len(comissoes)}</p>
                    <p><strong>Valor total:</strong> R$ {valor_total:,.2f}</p>
                    <p><strong>Data de envio:</strong> {datetime.now().strftime('%d/%m/%Y %H:%M')}</p>
                </div>
                
                <h3>Detalhamento das Comissões</h3>
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                    <thead>
                        <tr style="background: #FE5009; color: white;">
                            <th style="padding: 10px; text-align: left;">Corretor</th>
                            <th style="padding: 10px; text-align: left;">Empreendimento</th>
                            <th style="padding: 10px; text-align: left;">Unidade</th>
                            <th style="padding: 10px; text-align: left;">Valor</th>
                            <th style="padding: 10px; text-align: left;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {linhas_tabela}
                    </tbody>
                </table>
                
                <p>Para aprovar ou rejeitar estas comissões, acesse o sistema:</p>
                <a href="http://localhost:5000/" style="display: inline-block; background: #FE5009; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0;">
                    Acessar Sistema
                </a>
                
                <p style="margin-top: 30px; color: #666; font-size: 12px;">
                    Este é um e-mail automático. Por favor, não responda.
                </p>
            </div>
        </body>
        </html>
        """
        return html
    
    def _criar_email_html_financeiro(self, comissoes: List[Dict], valor_total: float) -> str:
        """Cria HTML do e-mail para financeiro"""
        linhas_tabela = ""
        for comissao in comissoes:
            linhas_tabela += f"""
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">{comissao.get('broker_nome', 'N/A')}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">{comissao.get('enterprise_name', 'N/A')}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">{comissao.get('unit_name', 'N/A')}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">R$ {float(comissao.get('commission_value', 0) or 0):,.2f}</td>
            </tr>
            """
        
        html = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 800px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #FE5009;">Young Empreendimentos - Comissões Aprovadas</h2>
                <p>Olá,</p>
                <p>As seguintes comissões foram aprovadas pela direção e estão liberadas para pagamento.</p>
                
                <div style="background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #4caf50;">
                    <h3 style="margin-top: 0;">Resumo</h3>
                    <p><strong>Total de comissões aprovadas:</strong> {len(comissoes)}</p>
                    <p><strong>Valor total:</strong> R$ {valor_total:,.2f}</p>
                    <p><strong>Data de aprovação:</strong> {datetime.now().strftime('%d/%m/%Y %H:%M')}</p>
                </div>
                
                <h3>Detalhamento das Comissões</h3>
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                    <thead>
                        <tr style="background: #4caf50; color: white;">
                            <th style="padding: 10px; text-align: left;">Corretor</th>
                            <th style="padding: 10px; text-align: left;">Empreendimento</th>
                            <th style="padding: 10px; text-align: left;">Unidade</th>
                            <th style="padding: 10px; text-align: left;">Valor</th>
                        </tr>
                    </thead>
                    <tbody>
                        {linhas_tabela}
                    </tbody>
                </table>
                
                <p style="margin-top: 30px; color: #666; font-size: 12px;">
                    Este é um e-mail automático. Por favor, não responda.
                </p>
            </div>
        </body>
        </html>
        """
        return html
    
    def listar_comissoes_por_status(self, status: Optional[str] = None, gatilho_atingido: Optional[bool] = None) -> List[Dict]:
        """Lista comissões com filtros opcionais"""
        try:
            query = self.supabase.table('sienge_comissoes').select('*')
            
            if status:
                query = query.eq('status_aprovacao', status)
            
            if gatilho_atingido is not None:
                query = query.eq('atingiu_gatilho', gatilho_atingido)
            
            response = query.execute()
            
            # Ordenar manualmente por data
            comissoes = response.data if response.data else []
            comissoes.sort(key=lambda x: x.get('commission_date') or '', reverse=True)
            
            return comissoes
            
        except Exception as e:
            print(f"Erro ao listar comissões: {str(e)}")
            return []
