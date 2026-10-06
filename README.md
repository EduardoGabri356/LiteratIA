<h1 align="center"> LiteratIA</h1>
<h3 align="center">O Desafio do Vestibular</h3>

<p align="center">
  Um jogo de investigação literária para estudar as obras do vestibular.<br>
  Explore cenas ilustradas, associe citações aos seus significados e defenda sua leitura diante de um crítico movido a IA.
</p>

<p align="center">
  <img alt="React" src="https://img.shields.io/badge/React-19-20232a?logo=react&logoColor=61dafb">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-646cff?logo=vite&logoColor=white">
  <img alt="Tailwind" src="https://img.shields.io/badge/Tailwind-4-0f172a?logo=tailwindcss&logoColor=38bdf8">
  <img alt="Node" src="https://img.shields.io/badge/Node.js-Express-3c873a?logo=node.js&logoColor=white">
  <img alt="MongoDB" src="https://img.shields.io/badge/MongoDB-47a248?logo=mongodb&logoColor=white">
  <img alt="Gemini" src="https://img.shields.io/badge/Google-Gemini-4285f4?logo=googlegemini&logoColor=white">
</p>

---

## Sobre o projeto

Estudar literatura para o vestibular costuma significar decorar listas de características e resumos. O **LiteratIA** propõe outro caminho: transformar cada obra em um pequeno jogo de investigação, com clima de mistério e de livro antigo, em que o aluno aprende **descobrindo**, errando e entendendo o porquê.

Ele nasceu como **proposta para a disciplina de User Experience**, e as decisões de design (veja mais abaixo) vieram de perguntas simples: *como fazer o estudo parecer menos uma obrigação e mais uma descoberta?*

### Obras disponíveis

| Obra | Autor | Movimento |
|---|---|---|
| Memórias Póstumas de Brás Cubas | Machado de Assis | Realismo |
| O Cortiço | Aluísio Azevedo | Naturalismo |
| Vidas Secas | Graciliano Ramos | Modernismo (2ª fase) |

## Como se joga

Cada livro é uma lombada brilhando na estante e tem quatro etapas:

1. **Citações** — associe trechos marcantes da obra ao que eles revelam (tema, voz narrativa, recurso literário). Arraste a alternativa até a citação, confirme e descubra se acertou. Há dicas socráticas, que pedem pistas em vez de entregar a resposta.
2. **Cena interativa (point & click)** — uma cena ilustrada esconde personagens, objetos e momentos da história. Passe o mouse para ver o que destaca, clique e responda a uma questão no estilo dos grandes vestibulares.
3. **O Julgamento** — um crítico literário de IA apresenta uma tese polêmica sobre a obra. Você argumenta, ele contra-argumenta, você faz a tréplica, e ele avalia o debate inteiro por uma rubrica (coerência, domínio da obra e capacidade argumentativa).
4. **Recompensa** — quem é aprovado ganha nota final, um selo dourado na estante e um action figure do livro.

## Decisões de UX

- **Descoberta antes de lista:** os elementos da cena começam escondidos e só se destacam quando você chega perto, o que incentiva a exploração (há um botão de pistas para quem prefere ver tudo).
- **Errar também ensina:** a primeira resposta é definitiva. Se errar, o jogo mostra a alternativa certa e explica o porquê, sem aquele ciclo de tentativa e erro até acertar.
- **Retomar de onde parou:** o progresso fica salvo, e voltar ao jogo leva você exatamente à próxima citação ou ao próximo elemento.
- **Feedback imediato e proporcional:** animação ao errar, confete ao concluir, cores consistentes para certo e errado, sem depender só de cor (ícones de check e X).
- **Textos livres com cuidado:** o debate exige argumentos de verdade (limite mínimo e máximo de caracteres, e texto sem sentido não gasta o turno).
- **Acessibilidade básica:** navegação por teclado, rótulos para leitores de tela e respeito à preferência de movimento reduzido.

## Tecnologias

**Frontend:** React, Vite, Tailwind CSS, React Router, Zustand, canvas-confetti, lucide-react
**Backend:** Node.js, Express, MongoDB (Mongoose), Zod
**IA:** Google Gemini (dica socrática, questões opcionais por IA e crítico literário), com respostas de reserva quando a API está fora do ar

## Como rodar

Você vai precisar de **Node.js 20+** e de um **MongoDB** (local ou Atlas). A chave do Gemini é opcional, mas sem ela o crítico usa uma avaliação automática simples.

```bash
# 1. Backend
cd backend
cp .env.example .env        # preencha MONGODB_URI e GEMINI_API_KEY
npm install
npm run seed                # carrega os livros no banco
npm run dev                 # http://localhost:3001

# 2. Frontend (em outro terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

Testes do backend: `npm test` dentro de `backend/`.

## 🗂️ Estrutura

```
backend/
  data/            conteúdo dos livros (books.json) e coordenadas dos hotspots
  scripts/         seed, validação do conteúdo e correções (patch:data)
  src/             rotas por fase, serviços (Gemini, pontuação) e modelos
frontend/
  public/assets/   cenas, estante, tribunal e pergaminhos
  src/views/       Hub, Citações, Cena interativa, Julgamento e Vitória
```

## 🧩 Próximos passos

- Visualizador 3D dos action figures (os modelos `.glb` ainda não foram feitos)
- Conferência das citações literais em edições confiáveis
- Mais obras da lista do vestibular
- Testes de usabilidade com estudantes

## 💛 Créditos

Projeto criado por **Eduardo Petarnella Gabri**  em conjunto com muita ajuda e carinho da minha namorada, **Anelize Nardelli**.  para a disciplina de User Experience.

Ilustrações geradas com IA e usadas como parte da proposta visual. Os textos e questões são material de estudo e merecem conferência com as edições das obras.
