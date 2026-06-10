# Trade-offs e Evoluções

Este documento registra as principais decisões de design que têm um **custo consciente** e, quando aplicável, o **gatilho** que indicaria a hora de evoluí-las e o **caminho** dessa evolução.

A ideia não é listar tudo o que poderia ser diferente, mas deixar claro o que foi escolhido de propósito, o que se abriu mão em troca, e como a solução cresceria sem reescrita — coerente com a arquitetura de injeção de dependências por interfaces.

> Fontes da verdade do design continuam sendo [`ARCHITECTURE.md`](./ARCHITECTURE.md) e [`DEVELOPMENT_GUIDE.md`](./DEVELOPMENT_GUIDE.md). Aqui ficam apenas os trade-offs e os caminhos de evolução.

---

## 1. Um único dispatcher (ECS com 1 instância)

- **Decisão:** toda a saída para o SaaS passa por uma instância só, o que torna o limite de 100 req/s trivial de garantir — sem precisar coordenar a vazão entre vários servidores.
- **Abrimos mão de:** é um ponto único; se ele cai, a integração para até subir outro. E a vazão fica concentrada nele.
- **Quando reavaliar:** se surgir um segundo parceiro, se precisar de alta disponibilidade, ou se o volume exigir mais de 100 req/s no total.
- **Caminho:** um controle de vazão compartilhado (ex.: um contador no Redis) com várias instâncias em paralelo — deixando de usar uma instância só.

## 2. Lote processado em paralelo (até 10 por vez)

- **Decisão:** cada lote do SQS é processado em paralelo; isso já satura os 100 req/s quando o parceiro responde em até ~100 ms.
- **Abrimos mão de:** se o parceiro for mais lento, 10 chamadas em paralelo não bastam para chegar aos 100 req/s — o gargalo passa a ser o nosso paralelismo, não o parceiro.
- **Quando reavaliar:** se a latência do parceiro passar de ~100 ms.
- **Caminho:** manter mais de um lote em andamento ao mesmo tempo, controlando quantas mensagens puxar para não estourar o tempo de visibilidade do SQS.

## 3. SQS Standard em vez de FIFO

- **Decisão:** filas Standard (mais baratas e com mais vazão); a idempotência cuida das duplicatas.
- **Abrimos mão de:** pode haver mensagens duplicadas e não há garantia de ordem.
- **Quando reavaliar:** se o negócio exigir processar os eventos de um mesmo colaborador em ordem.
- **Caminho:** filas FIFO usando o ID do colaborador como grupo de mensagem (menos vazão, mais custo).

## 4. Uma sonda só na recuperação do circuito (single-trial)

> Decisão fechada — não há evolução prevista, apenas a mitigação do custo.

- **Decisão:** quando o circuit breaker tenta se recuperar, deixamos passar **uma** chamada de teste; as outras do lote esperam. Assim evitamos que várias chamadas batam de uma vez num parceiro que mal voltou.
- **Abrimos mão de:** as outras mensagens do lote chegam a marcar um registro de "em processamento" antes de serem barradas, e ficam presas por um curto tempo.
- **Como contornamos:** esse registro se libera sozinho pelo mesmo mecanismo que recupera travas abandonadas (`lockExpiresAt`) — o efeito é pequeno e temporário.

## 5. Demissões têm prioridade absoluta

- **Decisão:** o dispatcher esvazia a fila de demissões antes de tocar na de inclusões/alterações, porque demissão é urgente.
- **Abrimos mão de:** num volume muito grande e contínuo de demissões, as inclusões/alterações podem ficar esperando.
- **Quando reavaliar:** se houver picos prolongados de demissões.
- **Caminho:** reservar uma fatia para a outra fila (ex.: processar no máximo N lotes de demissão antes de liberar um de inclusão).

## 6. Integração ligada a um único SaaS

- **Decisão:** hoje há um cliente para um parceiro só — mais simples.
- **Abrimos mão de:** não há como rotear para mais de um parceiro.
- **Quando reavaliar:** quando entrar um segundo parceiro.
- **Caminho:** um mapa de clientes por parceiro, cada um com seu próprio controle de vazão e circuit breaker (vazão e instabilidade são por parceiro). A injeção de dependências atual já facilita — é só adicionar.

## 7. Leitura do XML em uma Lambda só (streaming)

- **Decisão:** a Lambda lê o XML em streaming (SAX), com memória constante — aguenta dezenas de milhares de registros.
- **Abrimos mão de:** o limite real não é a memória, é o tempo máximo de 15 min da Lambda.
- **Quando reavaliar:** quando o arquivo diário começar a se aproximar desse tempo.
- **Caminho:** quebrar o arquivo em pedaços antes (S3 → vários menores → várias Lambdas), ou mover a leitura para Fargate/Glue (sem limite de tempo).
