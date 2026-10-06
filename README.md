# LiteratIA v2

Duas pastas: `backend/` (Node, Express, MongoDB, Gemini) e `frontend/` (Vite, React, Tailwind, Zustand).
O README do backend (`backend/README.md`) tem a lista de endpoints, as regras de pontuação e os fallbacks da IA.

## Como rodar

```bash
# 1. Backend
cd backend
cp .env.example .env          # preencha MONGODB_URI e GEMINI_API_KEY
npm install
npm run seed                  # data/books.json já está com as correções (Prudêncio fora, coordenadas novas)
npm run dev                   # http://localhost:3001

# 2. Frontend (outro terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173 (o Vite faz proxy de /api para o backend)
```

Seu progresso fica no servidor, ligado ao UUID salvo no navegador (`localStorage`, chave `sessionUuid`).
Para recomeçar um livro, use "Jogar de novo" no Hub depois de concluí-lo.

## O que mudou do v1 para o v2

**Fase 1**
- O progresso é salvo: ao voltar, você continua da primeira citação sem resposta e as já respondidas aparecem certas/erradas.
- A alternativa arrastada fica no espaço da citação; você confirma ou troca antes de enviar (a resposta é definitiva).
  No celular, tocar numa alternativa também a coloca no espaço.
- O botão é "Próxima citação"; "Avançar para a Fase 2" só aparece na última, com todas respondidas.
- Mesa de madeira como fundo e o pergaminho do `card.png` (o `torn-paper.jpeg` tinha fundo sólido, não transparente).

**Fase 2**
- A primeira resposta de cada elemento é definitiva: errar mostra a alternativa certa e a explicação, e o elemento fica marcado em vermelho.
  Reabrir um elemento respondido mostra o resultado, sem refazer.
- As coordenadas agora vêm de `backend/data/coords.json`, e a cena tem a mesma proporção da imagem (1376×768) em qualquer tela.
  O motivo do desalinhamento era o `books.json` ainda estar com as coordenadas provisórias.
- O botão para a Fase 3 usava um caminho relativo (`game/...`), que caía na rota coringa e voltava ao Hub. Corrigido.
- Modo de calibração: `/game/<slug>/map?calibrate=1` (arraste para medir um retângulo e copie o `[x, y, w, h]`).

**Fase 3** (o `DebateView` tinha `useParams` importado de `react`, o que derrubava a tela): ligada ao backend,
com o limite de caracteres, argumento recusado sem gastar o turno, veredito com a rubrica e "Tentar de novo" se reprovar.

**Hub e conclusão:** o Hub lê o progresso do servidor e leva cada livro para a fase certa. As lombadas usam as coordenadas medidas na imagem.
A tela de vitória usa a nota e a recompensa reais. O `api.js` não finge mais respostas quando o servidor cai (o modo "offline" escondia erros).

## Pendências conhecidas

- O visualizador 3D do action figure (`.glb`) ainda não existe; a tela de vitória mostra a miniatura, se houver.
- Sem `GEMINI_API_KEY`, o debate usa uma avaliação automática simples, limitada a 7,0 e quase sempre abaixo da nota de corte.
  Para testar a aprovação, configure a chave.
- Falta conferir as citações literais dos três livros em edições confiáveis (lista no README do backend).
