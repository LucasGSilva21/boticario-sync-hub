# versions.tf
# Restrições de versão do Terraform e dos providers.
# A infra é declarativa (ARCHITECTURE.md §2): validada apenas com `fmt`/`validate`,
# sem `terraform apply` real. Por isso não há bloco `backend` — o estado nunca é
# persistido remotamente (init roda com -backend=false).

terraform {
  # Travado na linha 1.5+ (ambiente local usa 1.9.x). Evita drift de sintaxe HCL.
  required_version = ">= 1.5.0"

  required_providers {
    # AWS Provider 5.x: cobre todos os recursos da topologia (SQS, DynamoDB, S3,
    # Secrets Manager, ECS Fargate, CloudWatch, IAM, SSM). DEVELOPMENT_GUIDE define
    # Terraform como IaC dos recursos long-lived.
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
