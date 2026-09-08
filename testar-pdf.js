// testar-pdf.js
const fs = require('fs');
const pdfParse = require('pdf-parse');
const path = require('path');

const nomeArquivo = process.argv[2];
const arquivoParaTestar = nomeArquivo
  ? path.resolve(__dirname, nomeArquivo)
  : null;

if (!arquivoParaTestar || !fs.existsSync(arquivoParaTestar)) {
  console.log('Uso: node testar-pdf.js uploads/exemplo.pdf');
  process.exit(1);
}

const dataBuffer = fs.readFileSync(arquivoParaTestar);

pdfParse(dataBuffer).then(function(data) {
  console.log('--- TEXTO COMPLETO EXTRAÍDO ---');
  console.log(data.text);
  console.log('-------------------------------');
  
  // Testes manuais de verificação
  const textoMinusculo = data.text.toLowerCase();
  console.log('\n🔎 RESULTADOS DOS TESTES:');
  console.log('Tem "venda de mercadoria"?', textoMinusculo.includes('venda de mercadoria'));
  console.log('Tem "serviço" ou "servico"?', textoMinusculo.includes('serviço') || textoMinusculo.includes('servico'));
  console.log('Tem "costura"?', textoMinusculo.includes('costura'));
  console.log('Tem "5102"?', textoMinusculo.includes('5102'));
});