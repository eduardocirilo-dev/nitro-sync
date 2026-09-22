# nitro-sync

Guarda o progresso do treino pré-flop (Spin & Go Nitro) para o poderes continuar
em qualquer aparelho — iPhone, iPad e Mac passam a ver o mesmo treino.

Serviço pequeno (Node + Express + MongoDB). Não guarda nada além do teu progresso
de treino: sessões feitas, respostas certas, datas dos fechos e revisões.

## Endereços

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/saude` | diz se está vivo e se o MongoDB respondeu |
| GET | `/estado/<codigo>` | devolve o progresso de todos os aparelhos desse código |
| PUT | `/estado/<codigo>/<aparelho>` | grava o progresso de um aparelho |

O `<codigo>` é o código de sincronização que se escreve uma vez em cada aparelho.
Quem não sabe o código não vê nada.

## Pôr isto a funcionar no Render

1. **New → Web Service** → liga o repositório `nitro-sync`.
2. Nome: `nitro-sync` · Runtime: **Node** · Plano: **Free**.
3. Build Command: `npm install` · Start Command: `node server.js`.
4. Em **Environment**, adiciona:
   - `MONGODB_URI` = o endereço de ligação do teu MongoDB (Atlas → Connect → Drivers).
   - `ORIGENS` = `https://eduardocirilo-dev.github.io`
5. **Create Web Service**. Quando ficar verde, abrir `<endereço>/saude` deve responder
   `{"ok":true,"guarda":"mongo","mongo":true}`.

Sem `MONGODB_URI` o serviço também arranca, mas guarda tudo em memória — o progresso
perde-se quando o serviço reinicia. Só serve para testar.
