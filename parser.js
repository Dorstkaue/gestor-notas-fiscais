// parser.js - Extração Tolerante a Falhas
function extrairDadosNota(texto) {
  const textoLimpo = (texto || '').replace(/\r/g, '');
  const textoMin = textoLimpo.toLowerCase();
  const linhas = textoLimpo.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // 1. EXTRAÇÃO DO CFOP. Alguns DANFEs juntam as colunas, por exemplo: 4005102UN.
  let cfop = 'N/A';
  const cfopsConhecidos = ['5102', '6102', '5901', '5902', '5904', '5909', '6901', '5101', '6101'];
  const regexCfops = new RegExp(`(${cfopsConhecidos.join('|')})`);
  const indiceCfop = textoMin.indexOf('cfop');
  const trechoCfop = indiceCfop >= 0 ? textoLimpo.slice(indiceCfop, indiceCfop + 1200) : textoLimpo;
  const matchCfop = trechoCfop.match(regexCfops) || textoLimpo.match(regexCfops);
  if (matchCfop) {
    cfop = matchCfop[1];
  }

  // Classificação
  const ehRemessa = ['5901', '5902', '5909', '6901'].includes(cfop) || 
                    textoMin.includes('remessa') || 
                    textoMin.includes('retorno');

  const ehVenda = ['5102', '6102', '5101', '6101'].includes(cfop) || 
                  textoMin.includes('venda') || 
                  textoMin.includes('prestação') || 
                  textoMin.includes('prestacao');

  const ehValida = !ehRemessa && (ehVenda || cfop === 'N/A');
  const tipoNota = ehRemessa ? 'Remessa/Retorno' : (ehVenda ? 'Venda/Cobrança' : 'Outros');

  // 2. EXTRAÇÃO DO NÚMERO DA NOTA
  let numeroNota = 'S/N';
  const matchNumeroDocumento = textoLimpo.match(/NÚMERO DO DOCUMENTO\s*([\d.-]+)/i);
  const matchNumDanfe = textoLimpo.match(/Nº:\s*SÉRIE:\s*FOLHA:\s*\d+\/\d+\s+(\d+)\s+(\d+)\s+\d+/i);
  const matchNum = textoLimpo.match(/N[º°]\s*:?\s*(\d{3,})/i) ||
                   textoLimpo.match(/\b(\d{3}\.\d{3}\.\d{3})\b/);
  if (matchNumeroDocumento) numeroNota = matchNumeroDocumento[1];
  else if (matchNumDanfe) numeroNota = matchNumDanfe[2];
  else if (matchNum) numeroNota = matchNum[1];

  // 3. EXTRAÇÃO DA DATA DE EMISSÃO
  let dataEmissao = '-';
  const matchData = textoLimpo.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
  if (matchData) dataEmissao = matchData[1];

  // 4. EXTRAÇÃO DO CLIENTE / DESTINATÁRIO
  let clienteFornecedor = 'Não informado';

  const matchRecebemosDe = textoLimpo.match(/RECEBEMOS DE\s+(.+?)\s+OS PRODUTOS\/SERVIÇOS/i);
  if (matchRecebemosDe) {
    clienteFornecedor = matchRecebemosDe[1].trim().replace(/\s+\d{11}$/, '');
  }

  // Varre as linhas procurando rótulos de destinatário
  for (let i = 0; clienteFornecedor === 'Não informado' && i < linhas.length; i++) {
    const linha = linhas[i];
    if (/DESTINATÁRIO|DESTINATARIO|REMETENTE|RECEBEMOS DE/i.test(linha)) {
      // Pega a próxima linha que não seja rótulo técnico
      for (let j = i + 1; j < Math.min(i + 4, linhas.length); j++) {
        const prox = linhas[j];
        if (prox && !/CNPJ|CPF|ENDEREÇO|BAIRRO|DATA|NOME\s*\/\s*RAZÃO/i.test(prox) && prox.length > 3) {
          clienteFornecedor = prox;
          break;
        }
      }
      if (clienteFornecedor !== 'Não informado') break;
    }
  }

  // Fallback: Busca via Regex por 'Razão Social'
  if (clienteFornecedor === 'Não informado' && textoMin.includes('documento de arrecadação')) {
    const matchRazaoArrecadacao = textoLimpo.match(/31\.571\.377\/0001-24\s*([A-ZÀ-Ú][A-ZÀ-Ú\s]+?\d{11})/i);
    if (matchRazaoArrecadacao) clienteFornecedor = matchRazaoArrecadacao[1].trim();
  }

  if (clienteFornecedor === 'Não informado') {
    const matchRazao = textoLimpo.match(/(?:RAZÃO SOCIAL|CLIENTE|NOME)[^\n:]*[:\s]+([A-Z0-9\s.-]{5,50})/i);
    if (matchRazao) clienteFornecedor = matchRazao[1].trim();
  }

  // 5. EXTRAÇÃO DA DESCRIÇÃO. A descrição fica no bloco dos produtos, não no texto inteiro.
  let descricaoServico = '-';
  const indiceProdutos = textoMin.indexOf('dados do produto/serviço') >= 0
    ? textoMin.indexOf('dados do produto/serviço')
    : textoMin.indexOf('códigodescrição');
  const fimProdutos = textoMin.indexOf('cálculo do issqn', indiceProdutos);
  const blocoProdutos = indiceProdutos >= 0
    ? textoLimpo.slice(indiceProdutos, fimProdutos > indiceProdutos ? fimProdutos : indiceProdutos + 2500)
    : '';
  const descricoesPorCodigo = [...blocoProdutos.matchAll(/[A-Z]{3}\d{5}([\s\S]+?)(?=0-UNICO)/gi)]
    .map(match => match[1]);
  const descricoesPorQuantidade = [...blocoProdutos.matchAll(/(?:^|\s)\d{1,3},\d{4}([A-ZÀ-Ú][\s\S]+?)(?=0-UNICO)/gi)]
    .map(match => match[1]);
  const descricoes = [...descricoesPorCodigo, ...descricoesPorQuantidade]
    .map(descricao => descricao.replace(/\s+/g, ' ').replace(/\s*-\s*$/, '').trim())
    .filter(descricao => !/\d{3,}|PC\d/i.test(descricao))
    .filter(descricao => descricao.length > 3);
  if (descricoes.length > 0) {
    descricaoServico = [...new Set(descricoes)].join(' / ');
  } else if (textoMin.includes('documento de arrecadação')) {
    descricaoServico = 'Documento de Arrecadação do Simples Nacional';
  }

  // 6. EXTRAÇÃO DO VALOR TOTAL DA NOTA
  let valorTotal = 0;

  // O texto pode trazer os números antes ou depois do rótulo por causa das colunas do DANFE.
  const indiceValorNota = textoMin.indexOf('valor total da nota');
  const blocoValorNota = indiceValorNota >= 0
    ? textoLimpo.slice(Math.max(0, indiceValorNota - 250), indiceValorNota + 250)
    : '';
  const matchesValor = blocoValorNota.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) || [];

  if (matchesValor.length > 0) {
    const ultimoValorStr = matchesValor[matchesValor.length - 1];
    valorTotal = parseFloat(ultimoValorStr.replace(/\./g, '').replace(',', '.')) || 0;
  } else {
    // Fallback: Pega o maior valor monetário (formato R$ 0,00) presente no documento
    const todosValores = textoLimpo.match(/\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g);
    if (todosValores) {
      const valoresNumericos = todosValores.map(v => parseFloat(v.replace(/\./g, '').replace(',', '.')));
      valorTotal = Math.max(...valoresNumericos);
    }
  }

  return {
    ehValida,
    cfop,
    tipo_nota: tipoNota,
    numero_nota: numeroNota,
    data_emissao: dataEmissao,
    cliente_fornecedor: clienteFornecedor,
    descricao_servico: descricaoServico,
    valor_total: valorTotal
  };
}

module.exports = { extrairDadosNota };