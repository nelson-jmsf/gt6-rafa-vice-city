# 🌴 GT6 RAFA: FUGA DE VICE CITY (EDTECH PT-13 EDITION) 🚔🚁

Jogo 3D estilo **GTA 6 Vice City + Infinite Runner** estrelado por **Rafa (PT-13 / EDTECH)** pilotando sua **Chopper Elétrica Fat-Tire Vermelha** pelas avenidas neon molhadas de Vice City sob perseguição policial de **6 Estrelas** com viaturas VCPD, bloqueios de estrada com rampas cinematográficas (*"Furando o Bloqueio!"*) e helicóptero policial com holofote ao vivo.

---

## 🎮 Destaques do Jogo

- **Chopper Elétrica EDTECH PT-13 3D (Three.js)**: Pneus largos (*fat-tire*), farol LED volumétrico, faíscas de drift no asfalto molhado e turbo nitro EDTECH até **300 km/h**.
- **HUD Oficial GTA 6 Vice City**:
  - Contador de recompensa estilo GTA iniciando em **`$1.956.791`** e subindo em tempo real (`$1.956.898+`).
  - Nível de procurado de **1 a 6 Estrelas** (`★ ★ ★ ★ ★ ★`) com sirenes policiais e helicóptero aéreo.
  - Radar / Minimapa circular 2D em tempo real com rota GPS roxa, viaturas piscando e bloqueios à frente.
  - Velocímetro analógico e digital (`0` a `300 km/h`) + barra de bateria **EDTECH Nitro** + munição **EMP `558-30`**.
  - **Heli-Cam Policial Ao Vivo (PiP)** e Cutscene Oficial sincronizada com `./assets/rafa-chase.mp4` e pôster `./assets/rafa-poster.jpg`.
  - **Rádio COPOM 190**: Transmissões policiais em português (*"Atenção todas as unidades, suspeito em fuga na avenida!"*, *"Cuidado, ele está furando o bloqueio!"*).
- **Arquitetura Cloud Híbrida (Supabase + Vercel Serverless + Cache Local)**:
  - Funciona instantaneamente sem configuração (**Zero-Config Fallback** pré-carregado com o recorde oficial do vídeo de Rafa PT-13: **`$1.956.898`**, 6 estrelas, `188 km/h`).
  - Sincroniza automaticamente com **Supabase PostgreSQL + Realtime** quando `SUPABASE_URL` e `SUPABASE_ANON_KEY` estão configurados.

---

## 🕹️ Controles

| Ação | Teclado | Mobile / Tela |
| :--- | :--- | :--- |
| **Mudar de Faixa (Esquerda / Direita)** | `A` / `D` ou `⬅️` / `➡️` | Swipe ou Botões `⬅️` / `➡️` |
| **Pular / Empinar / Rampa** | `W`, `Espaço` ou `⬆️` | Swipe Cima ou Botão `⏫ PULAR` |
| **Drift / Derrapagem com Faíscas** | `S` ou `⬇️` | Swipe Baixo |
| **Ativar Turbo Nitro EDTECH** | `Shift` ou `E` | Botão `🚀 NITRO` |
| **Disparo EMP / Rajada (`558-30`)** | `F` ou `Q` | Botão `⚡ EMP 558-30` |
| **Pausar / Menu** | `P` ou `Esc` | Botão de Pausa no HUD |

---

## 🚀 Como Rodar Localmente (Zero Dependências)

Basta ter o **Node.js (v18+)** instalado:

```bash
npm start
# ou diretamente:
node server.js
```

Abra no navegador:
- **Jogo**: [http://localhost:3000](http://localhost:3000)
- **API Leaderboard**: [http://localhost:3000/api/leaderboard](http://localhost:3000/api/leaderboard)
- **API Telemetria**: [http://localhost:3000/api/telemetry](http://localhost:3000/api/telemetry)

---

## 🗄️ Configuração do Banco de Dados no Supabase

1. Crie um projeto no [Supabase](https://supabase.com).
2. Abra o **SQL Editor** do seu projeto Supabase e execute o conteúdo completo de [`supabase/schema.sql`](supabase/schema.sql).
   - Cria as tabelas `public.gt6_leaderboard` e `public.gt6_telemetry`.
   - Ativa **Row Level Security (RLS)** com políticas públicas de leitura (`SELECT`) e inserção validada (`INSERT`).
   - Insere os recordes iniciais de **Rafa PT-13 (`$1.956.898`, 6 Estrelas, `188 km/h`)** e desafiantes de Vice City.
   - Ativa o **Supabase Realtime** na tabela `public.gt6_leaderboard`.
3. Conecte ao jogo de duas formas:
   - **Via Variáveis de Ambiente** (`.env` local ou painel da Vercel):
     ```env
     SUPABASE_URL=https://seu-projeto.supabase.co
     SUPABASE_ANON_KEY=sua-chave-anon-publica
     ```
   - **Ou direto na interface do jogo**: clique no botão **Configurar Supabase Cloud** no menu/placares e informe a URL e a Anon Key.

---

## ▲ Deploy na Vercel

O projeto já inclui [`vercel.json`](vercel.json) e Serverless Functions em [`api/leaderboard.js`](api/leaderboard.js) e [`api/telemetry.js`](api/telemetry.js):

```bash
npx vercel --prod
```

Configure opcionalmente as variáveis `SUPABASE_URL` e `SUPABASE_ANON_KEY` (ou `SUPABASE_SERVICE_ROLE_KEY`) nas configurações do projeto na Vercel para persistência global em nuvem.
