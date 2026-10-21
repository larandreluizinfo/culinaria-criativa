# AGENTS.md

Instruções para agentes de IA (e para qualquer pessoa) que alterarem este repositório.

## Regra principal: toda alteração deve ser commitada e enviada

Toda e qualquer alteração no projeto **deve** terminar com commit e push para o GitHub. Não deixe trabalho só no disco.

Fluxo obrigatório ao final de cada alteração:

1. `node --check script.js` e `node --check online.js` (validação de sintaxe).
2. `git status` para conferir exatamente o que vai entrar no commit.
3. `git add -A`
4. `git commit -m "mensagem descritiva em português"`
5. `git push origin master`

Regras:

- Um commit por mudança lógica (não junte correções sem relação).
- Mensagem de commit clara, no imperativo e em português (ex: `Corrige botoes do modo local apos jogar online`).
- Nunca commitar segredos, tokens ou arquivos temporários.
- Nunca usar `git push --force` em `master`.
- Se o push falhar, resolver a divergência com `git pull --rebase origin master` e tentar de novo.

## Deploy

- O GitHub Pages publica automaticamente a branch `master`, na raiz (`/`).
- Site: https://larandreluizinfo.github.io/culinaria-criativa/
- Depois do push, confirmar que o build terminou:
  `gh api repos/larandreluizinfo/culinaria-criativa/pages --jq .status`
  Deve retornar `built`.

## Estrutura do projeto

- `index.html` — todas as telas (home, online, lobby, setup, sorteio, cozinhar, votar, pódio).
- `styles.css` — estilos e responsividade.
- `script.js` — modo local (sorteio, turnos, votação, pódio).
- `online.js` — modo online via PeerJS (host/convidado). Depende dos globais de `script.js` e é carregado depois dele.

## Convenções

- JavaScript puro, sem framework, sem bundler, sem `package.json`. Mantenha assim.
- Funções globais chamadas via `onclick` no HTML seguem o padrão existente (`goToSetup`, `createRoom`, ...).
- Textos de interface em português (pt-BR), com emojis no estilo atual.
- PeerJS vem por CDN no `index.html`; não adicione dependências locais sem necessidade.
- Comentários e nomes de variáveis podem ser em português, como no código atual.
- Testar manualmente no navegador os dois modos (local e online) antes de commitar mudanças de lógica de jogo.

## Armadilhas conhecidas

- Os botões da tela de cozinhar são trocados pelo modo online. O HTML original é guardado em `_localCookRowHTML` no carregamento e restaurado por `startCooking()`; não remova essa proteção.
- O pódio usa `#podiumActions` e `renderPodiumActions()` para escolher as ações conforme o modo. Não volte a fixar botões no HTML: "Revanche" local não funciona em partida online.
- No modo local cada chef tem o tempo sorteado, controlado por `startLocalTurn()`. No online o tempo é único para todos, controlado pelo host.
- `online.js` depende dos globais de `script.js` (`toast`, `AVATARS`, `updateTimerUI`, `renderPodiumActions`, `fireConfetti`) e é carregado depois dele.
- A entrada de novos jogadores é bloqueada depois que a partida começa (`gamePhase !== 'lobby'`).
