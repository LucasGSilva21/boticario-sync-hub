# s3.tf
# Bucket de ingestão do fluxo batch (ARCH §5): o ERP faz upload diário de um XML
# que dispara a Lambda de ingestão.
#
# FRONTEIRA Serverless <-> Terraform (decisão registrada):
#   - O BUCKET é long-lived -> mora aqui (Terraform).
#   - A NOTIFICAÇÃO `s3:ObjectCreated` -> NÃO é declarada aqui. Ela pertence ao
#     backend/serverless.yml (`existing: true`), colada à Lambda que dispara.
#   Declarar `aws_s3_bucket_notification` aqui brigaria com o Serverless (drift).
#   Portanto, intencionalmente, este arquivo NÃO contém notification.

resource "aws_s3_bucket" "batch_files" {
  bucket = local.bucket_name

  tags = merge(local.common_tags, {
    Component = "ingestion-batch"
  })
}

# Hardening: bloqueia qualquer exposição pública (defense-in-depth, §22).
resource "aws_s3_bucket_public_access_block" "batch_files" {
  bucket = aws_s3_bucket.batch_files.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Desabilita ACLs e força propriedade do bucket ao dono (best practice atual da AWS).
resource "aws_s3_bucket_ownership_controls" "batch_files" {
  bucket = aws_s3_bucket.batch_files.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Criptografia em repouso (SSE-S3/AES256): sem custo de KMS, suficiente para a PoC.
resource "aws_s3_bucket_server_side_encryption_configuration" "batch_files" {
  bucket = aws_s3_bucket.batch_files.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Ciclo de vida (controle de custo, §23): arquivos de lote são transitórios.
# Expira objetos após 30 dias e aborta uploads multipart incompletos após 7 dias.
resource "aws_s3_bucket_lifecycle_configuration" "batch_files" {
  bucket = aws_s3_bucket.batch_files.id

  rule {
    id     = "expire-processed-batches"
    status = "Enabled"

    filter {} # aplica a todos os objetos do bucket

    expiration {
      days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}
