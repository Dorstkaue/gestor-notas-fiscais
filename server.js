// server.js - Login por Nome e Senha
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pdfParse = require('pdf-parse');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { extrairDadosNota } = require('./parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração de Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Configuração da pasta de uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: { 
    fileSize: 10 * 1024 * 1024 // Limita cada arquivo a no máximo 10MB
  },
  fileFilter: (req, file, cb) => {
    // Garante que só aceitará arquivos com tipo MIME 'application/pdf'
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos no formato PDF são permitidos!'), false);
    }
  }
});

// Conexão com o Banco de Dados SQLite
const db = new Database('database.db');

// Inicialização das Tabelas (Nome único)
db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS notas_fiscais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER,
    numero_nota TEXT,
    data_emissao TEXT,
    cliente_fornecedor TEXT,
    descricao_servico TEXT,
    valor_total REAL,
    cfop TEXT,
    tipo_nota TEXT,
    caminho_pdf TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessoes (
    token_hash TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    expira_em INTEGER NOT NULL,
    FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
  );
`);

// Migrações preventivas
try { db.exec("ALTER TABLE notas_fiscais ADD COLUMN cfop TEXT;"); } catch (e) {}
try { db.exec("ALTER TABLE notas_fiscais ADD COLUMN tipo_nota TEXT;"); } catch (e) {}
try { db.exec("ALTER TABLE notas_fiscais ADD COLUMN usuario_id INTEGER;"); } catch (e) {}

const usuariosTemEmailObrigatorio = db.prepare('PRAGMA table_info(usuarios)').all()
  .some(coluna => coluna.name === 'email' && coluna.notnull === 1);

const DURACAO_SESSAO_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function criarSessao(usuarioId, res) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiraEm = Date.now() + DURACAO_SESSAO_MS;

  db.prepare('DELETE FROM sessoes WHERE expira_em <= ?').run(Date.now());
  db.prepare('INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES (?, ?, ?)')
    .run(hashToken(token), usuarioId, expiraEm);

  const cookieSeguro = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sessao=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${DURACAO_SESSAO_MS / 1000}${cookieSeguro}`);
}

function lerCookie(req, nome) {
  const cookies = req.headers.cookie ? req.headers.cookie.split(';') : [];
  const cookie = cookies.find(item => item.trim().startsWith(`${nome}=`));
  return cookie ? decodeURIComponent(cookie.trim().slice(nome.length + 1)) : null;
}

function autenticar(req, res, next) {
  const token = lerCookie(req, 'sessao');
  if (!token) {
    return res.status(401).json({ erro: 'Sessão não autenticada.' });
  }

  const sessao = db.prepare(`
    SELECT sessoes.usuario_id, usuarios.nome
    FROM sessoes
    JOIN usuarios ON usuarios.id = sessoes.usuario_id
    WHERE sessoes.token_hash = ? AND sessoes.expira_em > ?
  `).get(hashToken(token), Date.now());

  if (!sessao) {
    return res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
  }

  req.usuario = { id: sessao.usuario_id, nome: sessao.nome };
  next();
}


// ==========================================
// ROTAS DE AUTENTICAÇÃO (Apenas Nome e Senha)
// ==========================================

// Cadastro por Nome
app.post('/api/auth/cadastrar', async (req, res) => {
  try {
    const { nome, senha } = req.body;

    if (!nome || !senha) {
      return res.status(400).json({ erro: 'Informe o nome e a senha.' });
    }

    const nomeFormatado = nome.trim();
    const senhaHash = await bcrypt.hash(senha, 10);
    const insertUser = usuariosTemEmailObrigatorio
      ? db.prepare('INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)')
      : db.prepare('INSERT INTO usuarios (nome, senha) VALUES (?, ?)');
    const resultado = usuariosTemEmailObrigatorio
      ? insertUser.run(nomeFormatado, `${nomeFormatado.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@local.invalid`, senhaHash)
      : insertUser.run(nomeFormatado, senhaHash);
    criarSessao(resultado.lastInsertRowid, res);

    res.status(201).json({
      mensagem: 'Usuário cadastrado com sucesso!',
      usuario: { id: resultado.lastInsertRowid, nome: nomeFormatado }
    });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ erro: 'Este nome já está cadastrado. Escolha outro ou faça login.' });
    }
    console.error('Erro no cadastro:', err);
    res.status(500).json({ erro: 'Erro ao cadastrar usuário.' });
  }
});

// Login por Nome
app.post('/api/auth/login', async (req, res) => {
  try {
    const { nome, senha } = req.body;

    if (!nome || !senha) {
      return res.status(400).json({ erro: 'Informe o nome e a senha.' });
    }

    const userQuery = db.prepare('SELECT * FROM usuarios WHERE LOWER(nome) = LOWER(?)');
    const usuario = userQuery.get(nome.trim());

    if (!usuario) {
      return res.status(401).json({ erro: 'Nome ou senha incorretos.' });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    if (!senhaValida) {
      return res.status(401).json({ erro: 'Nome ou senha incorretos.' });
    }

    criarSessao(usuario.id, res);

    res.json({
      mensagem: 'Login realizado com sucesso!',
      usuario: { id: usuario.id, nome: usuario.nome }
    });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ erro: 'Erro ao realizar login.' });
  }
});

app.post('/api/auth/logout', autenticar, (req, res) => {
  const token = lerCookie(req, 'sessao');
  if (token) {
    db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(hashToken(token));
  }
  res.setHeader('Set-Cookie', 'sessao=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ mensagem: 'Logout realizado com sucesso.' });
});


// ==========================================
// ROTAS DE NOTAS FISCAIS
// ==========================================

// Listar notas do usuário
app.get('/api/notas', autenticar, (req, res) => {
  try {
    const selectQuery = db.prepare('SELECT * FROM notas_fiscais WHERE usuario_id = ? ORDER BY id DESC');
    const notas = selectQuery.all(req.usuario.id);
    res.json(notas);
  } catch (err) {
    console.error('Erro ao buscar notas:', err);
    res.status(500).json({ erro: 'Erro ao carregar notas do banco de dados.' });
  }
});

// Enviar notas do usuário
app.post('/api/notas/upload', autenticar, (req, res, next) => {
  upload.array('pdf', 100)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ erro: 'Arquivo muito grande! O limite é de 10MB por PDF.' });
      }
      return res.status(400).json({ erro: `Erro no upload: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ erro: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ erro: 'Nenhum arquivo PDF foi enviado.' });
    }

    let importadasComSucesso = 0;
    let erros = 0;

    const insertQuery = db.prepare(`
      INSERT INTO notas_fiscais (
        usuario_id,
        numero_nota,
        data_emissao,
        cliente_fornecedor,
        descricao_servico,
        valor_total,
        cfop,
        tipo_nota,
        caminho_pdf
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

// server.js - Na rota app.post('/api/notas/upload', ...)
for (const file of req.files) {
  try {
    const caminhoArquivo = file.path;
    const dataBuffer = fs.readFileSync(caminhoArquivo);
    const data = await pdfParse(dataBuffer);
    
    // Extrai os dados pelo parser
    const dadosNota = extrairDadosNota(data.text);

    // Grava SEMPRE a nota no banco de dados com a classificação que o parser descobriu
    insertQuery.run(
      req.usuario.id,
      dadosNota.numero_nota || 'S/N',
      dadosNota.data_emissao || '-',
      dadosNota.cliente_fornecedor || 'Não informado',
      dadosNota.descricao_servico || '-',
      dadosNota.valor_total || 0,
      dadosNota.cfop || 'N/A',
      dadosNota.tipo_nota, // Salva se é 'Venda/Cobrança', 'Remessa/Retorno' ou 'Outros'
      caminhoArquivo
    );

    importadasComSucesso++;
  } catch (fileErr) {
    console.error(`Erro ao processar ${file.originalname}:`, fileErr);
    erros++;
  }
}

    res.json({
      mensagem: `${importadasComSucesso} nota(s) importada(s) com sucesso! ${erros > 0 ? `(${erros} falha(s))` : ''}`,
      sucesso: importadasComSucesso,
      erros: erros
    });
  } catch (err) {
    console.error('Erro no upload em lote:', err);
    res.status(500).json({ erro: 'Erro ao processar o lote de notas fiscais.' });
  }
});

// PDFs só podem ser abertos pelo usuário dono da nota.
app.get('/uploads/:filename', autenticar, (req, res) => {
  const filename = path.basename(req.params.filename);
  const caminhoArquivo = path.join(uploadsDir, filename);
  const nota = db.prepare('SELECT id FROM notas_fiscais WHERE usuario_id = ? AND caminho_pdf = ?')
    .get(req.usuario.id, caminhoArquivo);

  if (!nota || !fs.existsSync(caminhoArquivo)) {
    return res.status(404).json({ erro: 'PDF não encontrado.' });
  }

  res.sendFile(caminhoArquivo);
});

// Rota de Exclusão
app.delete('/api/notas/:id', autenticar, (req, res) => {
  try {
    const { id } = req.params;

    const selectQuery = db.prepare('SELECT caminho_pdf FROM notas_fiscais WHERE id = ? AND usuario_id = ?');
    const nota = selectQuery.get(id, req.usuario.id);

    if (!nota) {
      return res.status(404).json({ erro: 'Nota não encontrada ou não pertence a este usuário.' });
    }

    if (nota.caminho_pdf && fs.existsSync(nota.caminho_pdf)) {
      try {
        fs.unlinkSync(nota.caminho_pdf);
      } catch (e) {
        console.error('Não foi possível excluir o arquivo físico:', e);
      }
    }

    const deleteQuery = db.prepare('DELETE FROM notas_fiscais WHERE id = ? AND usuario_id = ?');
    deleteQuery.run(id, req.usuario.id);

    res.json({ mensagem: 'Nota excluída com sucesso!' });
  } catch (err) {
    console.error('Erro ao excluir nota:', err);
    res.status(500).json({ erro: 'Erro ao excluir nota.' });
  }
});

// Iniciar o Servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em: http://localhost:${PORT}`);
});