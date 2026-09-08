# Gestor de Notas Fiscais

Aplicacao web local para importar notas fiscais em PDF, extrair informacoes relevantes e organizar os dados para consultas e apuracoes anuais.

O projeto foi criado para facilitar o trabalho com notas fiscais relacionadas a uma atividade de costura, evitando a abertura manual de cada PDF para localizar valores, destinatarios, produtos e CFOP.

## Funcionalidades

- Cadastro e login de usuarios.
- Autenticacao no backend com sessoes em cookie `HttpOnly`.
- Upload de varios PDFs de uma vez.
- Extracao de numero da nota, data, cliente ou destinatario, descricao, valor e CFOP.
- Identificacao de notas de cobranca pelo CFOP `5102`.
- Soma automatica somente das notas com CFOP `5102`.
- Listagem das notas em tabela.
- Visualizacao protegida dos PDFs.
- Exclusao individual ou em massa.
- Banco de dados SQLite local.

## Tecnologias

- Node.js
- Express
- SQLite com `better-sqlite3`
- `pdf-parse`
- `multer`
- `bcryptjs`
- HTML, CSS e JavaScript puro no frontend

## Requisitos

- Node.js 22 ou superior.
- npm.

A versao atual do `better-sqlite3` exige Node.js 22 ou superior.

## Instalacao

Clone o repositorio e entre na pasta do projeto:

```bash
git clone URL_DO_REPOSITORIO
cd SISTEMA-MAE
```

Instale as dependencias:

```bash
npm install
```

Inicie o servidor:

```bash
node server.js
```

Abra no navegador:

```text
http://localhost:3000
```

## Uso

1. Crie um usuario na tela de cadastro.
2. Entre no sistema.
3. Selecione uma pasta com arquivos PDF de notas fiscais.
4. Aguarde o processamento.
5. Consulte os dados extraidos na tabela.
6. O total acumulado considera somente notas com CFOP `5102`.

Os PDFs sao gravados localmente na pasta `uploads/` e os dados extraidos no arquivo `database.db`.

## Testar um PDF individualmente

Coloque um PDF de teste em `uploads/` e execute:

```bash
node testar-pdf.js "uploads/exemplo.pdf"
```

O script imprime o texto extraido pelo `pdf-parse` e alguns indicadores para diagnostico.

## Como o parser funciona

O texto extraido de um DANFE pode vir com colunas concatenadas ou em ordem diferente da visualizacao do PDF. Por isso, o parser procura os dados em blocos especificos:

- CFOP: bloco dos produtos e servicos.
- Numero: cabecalho da NF-e ou numero do documento.
- Destinatario: trecho `RECEBEMOS DE`.
- Descricao: bloco `DADOS DO PRODUTO/SERVICO`.
- Valor: bloco `VALOR TOTAL DA NOTA`.

Novos modelos de PDF podem exigir novas regras de parsing. PDFs escaneados como imagem precisam de OCR, que ainda nao faz parte deste projeto.

## Privacidade e seguranca

Este projeto foi pensado inicialmente para uso local. Antes de publicar ou hospedar uma instancia com dados reais:

- Nunca adicione PDFs reais ao repositorio.
- Nunca adicione `database.db` ao repositorio.
- Nao compartilhe arquivos da pasta `uploads/`.
- Nao publique senhas, tokens ou arquivos `.env`.
- Use HTTPS em qualquer ambiente acessivel pela internet.
- Troque as credenciais de teste antes de usar em producao.
- Faca backup protegido do banco se os dados forem importantes.

As pastas e arquivos sensiveis estao no `.gitignore`. Ainda assim, confira o estado do Git antes de cada publicacao:

```bash
git status --short --ignored
git ls-files
```

As rotas de notas e de PDFs exigem uma sessao valida e verificam o usuario dono da informacao. Isso protege os dados entre usuarios, mas nao substitui uma configuracao completa de producao, como HTTPS, rate limiting, monitoramento e backups seguros.

## Limites atuais

- Limite de 10 MB por PDF.
- O upload aceita ate 100 arquivos por requisicao.
- A extracao depende da qualidade do texto fornecido pelo `pdf-parse`.
- O sistema nao substitui conferencia contabil ou fiscal.
- Nao ha sincronizacao em nuvem.

## Estrutura principal

```text
SISTEMA MAE/
|-- public/
|   |-- index.html
|   |-- login.html
|   |-- script.js
|   |-- style.css
|   `-- login.css
|-- parser.js
|-- server.js
|-- testar-pdf.js
|-- package.json
|-- package-lock.json
|-- uploads/       # ignorada pelo Git
`-- database.db    # ignorado pelo Git
```

## Origem do projeto

O projeto nasceu de uma necessidade pratica: organizar notas fiscais de uma atividade de costura e facilitar a consulta anual de valores, fornecedores e produtos, mantendo inicialmente todo o processamento em ambiente local.
