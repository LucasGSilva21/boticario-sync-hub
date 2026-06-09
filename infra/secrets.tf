# secrets.tf
# Credenciais do SaaS no Secrets Manager (ARCH §16). O dispatcher lê este secret
# (com cache em memória + TTL, §16) — nenhuma Lambda acessa o SaaS direto.
#
# IMPORTANTE (segurança): este arquivo cria APENAS o "cofre" (o container do secret).
# O VALOR ({ baseUrl, apiKey }) é populado FORA do Terraform (console/CLI/pipeline),
# de propósito: gravar o secret_string aqui o jogaria para o tfstate e para o VCS.
# Best practice = segredo nunca entra no código/estado da infra.
#
# Estrutura esperada do valor (preenchida out-of-band):
#   {
#     "baseUrl": "https://api.partner.com",
#     "apiKey": "xxxxx"
#   }

resource "aws_secretsmanager_secret" "saas_credentials" {
  name        = local.secret_name
  description = "Credenciais de integração com o SaaS parceiro (baseUrl + apiKey)."

  # Janela curta de recuperação para a PoC (mín. 7 dias). Em produção, avaliar
  # manter o default de 30 dias.
  recovery_window_in_days = 7

  tags = merge(local.common_tags, {
    Component = "dispatcher"
  })
}
