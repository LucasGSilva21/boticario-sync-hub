# providers.tf
# Configuração do provider AWS. A região vem de variável (espelha o backend) e as
# tags comuns são aplicadas a TODOS os recursos via default_tags — assim cada .tf
# de recurso só precisa declarar tags específicas do componente (ex.: Component),
# que são mescladas às default_tags pelo provider.
#
# Sem `profile`/credenciais fixas: a infra é declarativa (ARCH §2), validada com
# fmt/validate sem apply. Credenciais reais só seriam necessárias num deploy real.

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}
