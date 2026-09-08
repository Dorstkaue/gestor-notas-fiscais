// public/script.js - Com Exclusão Corrigida, Visualização de PDF e Leitura Tolerante a Falhas

// 1. Validação de Usuário Logado
const usuarioSalvo = localStorage.getItem('usuarioLogado');
if (!usuarioSalvo) {
  window.location.href = 'login.html';
}

const usuarioLogado = JSON.parse(usuarioSalvo);

// 2. Exibe o Nome do Usuário Logado e o Botão de Sair no Topo
document.addEventListener('DOMContentLoaded', () => {
  const container = document.querySelector('.container');
  if (container) {
    const topoUser = document.createElement('div');
    topoUser.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; background: #eef2f5; padding: 10px 15px; border-radius: 6px;';
    topoUser.innerHTML = `
      <div>👤 Usuário: <strong>${usuarioLogado.nome}</strong></div>
      <button onclick="sair()" style="background: #e74c3c; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold;">🚪 Sair</button>
    `;
    container.insertBefore(topoUser, container.firstChild);
  }
});

function sair() {
  fetch('/api/auth/logout', { method: 'POST' })
    .finally(() => {
      localStorage.removeItem('usuarioLogado');
      window.location.href = 'login.html';
    });
}

// 3. Renderização e Leitura de Notas
async function carregarNotas() {
  try {
    const resposta = await fetch('/api/notas');
    if (resposta.status === 401) {
      sair();
      return;
    }
    const notas = await resposta.json();

    const tabelaBody = document.getElementById('tabelaNotas');
    tabelaBody.innerHTML = '';

    let somaTotal = 0;
    let quantidadeValidas = 0;

    if (!Array.isArray(notas) || notas.length === 0) {
      tabelaBody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Nenhuma nota cadastrada ainda.</td></tr>';
    } else {
      notas.forEach(nota => {
        const tipo = (nota.tipo_nota || '').toLowerCase();
        const cfop = String(nota.cfop || '').trim();

        // O total financeiro considera somente notas com CFOP 5102.
        const ehValida = cfop === '5102';

        const valor = parseFloat(nota.valor_total) || 0;

        if (ehValida) {
          somaTotal += valor;
          quantidadeValidas++;
        }

        const badgeClass = ehValida ? 'badge-cobranca' : 'badge-outros';
        const nomePdf = nota.caminho_pdf
          ? nota.caminho_pdf.replace(/\\/g, '/').split('/').pop()
          : null;
        const linkPdf = nomePdf ? `/uploads/${encodeURIComponent(nomePdf)}` : null;

        const tr = document.createElement('tr');
        if (!ehValida) {
          tr.style.backgroundColor = '#f8f9fa';
        }

        tr.innerHTML = `
          <td style="text-align: center;">
            <input type="checkbox" class="check-nota" value="${nota.id}" onchange="atualizarBotaoMassa()">
          </td>
          <td>${nota.id}</td>
          <td>${nota.numero_nota || 'S/N'}</td>
          <td><span class="badge ${badgeClass}">${cfop || 'N/A'} (${nota.tipo_nota || 'Outros'})</span></td>
          <td>${nota.data_emissao || '-'}</td>
          <td>${nota.cliente_fornecedor || 'Não informado'}</td>
          <td>${nota.descricao_servico || '-'}</td>
          <td><strong>R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
          <td class="acoes-nota">
            ${linkPdf 
              ? `<a href="${linkPdf}" target="_blank" class="btn-visualizar" title="Abrir PDF">👁️ Ver PDF</a>` 
              : '<span style="color: #999;">Sem PDF</span>'
            }
            <button class="btn-excluir" onclick="excluirNota(${nota.id})">🗑️ Excluir</button>
          </td>
        `;
        tabelaBody.appendChild(tr);
      });
    }

    // Atualiza contadores do topo
    document.getElementById('totalNotas').innerText = `Notas Somadas: ${quantidadeValidas} de ${Array.isArray(notas) ? notas.length : 0}`;
    document.getElementById('valorAcumulado').innerText = `Total Acumulado: R$ ${somaTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const checkTodos = document.getElementById('checkTodos');
    if (checkTodos) checkTodos.checked = false;
    atualizarBotaoMassa();

  } catch (err) {
    console.error('Erro ao carregar notas:', err);
  }
}

// 4. Controle de Seleção e Exclusão
function alternarTodos(master) {
  const checkboxes = document.querySelectorAll('.check-nota');
  checkboxes.forEach(cb => cb.checked = master.checked);
  atualizarBotaoMassa();
}

function atualizarBotaoMassa() {
  const selecionados = document.querySelectorAll('.check-nota:checked');
  const btnMassa = document.getElementById('btnExcluirSelecionados');
  const qtdSpan = document.getElementById('qtdSelecionados');

  if (btnMassa && qtdSpan) {
    if (selecionados.length > 0) {
      btnMassa.style.display = 'inline-block';
      qtdSpan.innerText = selecionados.length;
    } else {
      btnMassa.style.display = 'none';
    }
  }
}

async function excluirEmMassa() {
  const selecionados = document.querySelectorAll('.check-nota:checked');
  const ids = Array.from(selecionados).map(cb => cb.value);

  if (ids.length === 0) return;

  if (!confirm(`Tem certeza que deseja excluir as ${ids.length} notas selecionadas?`)) return;

  try {
    for (const id of ids) {
      await fetch(`/api/notas/${id}`, { method: 'DELETE' });
    }
    alert(`${ids.length} nota(s) excluída(s) com sucesso!`);
    carregarNotas();
  } catch (err) {
    console.error('Erro na exclusão em massa:', err);
    alert('Erro ao excluir algumas notas.');
  }
}

async function excluirNota(id) {
  if (!confirm(`Tem certeza que deseja excluir a nota ID ${id}?`)) return;

  try {
    const resposta = await fetch(`/api/notas/${id}`, { method: 'DELETE' });
    if (resposta.ok) {
      carregarNotas();
    } else {
      alert('Erro ao excluir a nota.');
    }
  } catch (err) {
    console.error(err);
  }
}

// 5. Envio de PDFs
const formUpload = document.getElementById('formUpload');
if (formUpload) {
  formUpload.addEventListener('submit', async (e) => {
    e.preventDefault();

    const status = document.getElementById('mensagemStatus');
    const input = document.getElementById('arquivoPdf');

    if (!input.files || input.files.length === 0) return;

    const formData = new FormData();
    for (const file of input.files) {
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        formData.append('pdf', file);
      }
    }

    status.className = 'status';
    status.innerText = 'Processando lote de PDFs...';

    try {
      const resposta = await fetch('/api/notas/upload', {
        method: 'POST',
        body: formData
      });

      const resultado = await resposta.json();

      if (resposta.ok) {
        status.className = 'status sucesso';
        status.innerText = '✅ ' + resultado.mensagem;
        input.value = '';
        carregarNotas();
      } else {
        status.className = 'status erro';
        status.innerText = '❌ Erro: ' + (resultado.erro || 'Erro ao importar.');
      }
    } catch (err) {
      console.error(err);
      status.className = 'status erro';
      status.innerText = '❌ Falha de comunicação com o servidor.';
    }
  });
}

carregarNotas();