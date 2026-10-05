# Supabase — sincronização na nuvem

Com Supabase configurado, **PC e celular** usam os mesmos dados (clientes, lotes, pagamentos).

## 1. Criar projeto

1. [supabase.com](https://supabase.com) → New project  
2. Anote **Project URL** e **anon public** key (Settings → API)

## 2. Criar tabela

**SQL Editor:** abra [`supabase/schema.sql`](supabase/schema.sql), cole no [SQL do projeto](https://supabase.com/dashboard/project/_/sql/new) e **Run**.

**Ou no Mac** (com `psql` e senha do banco em `DATABASE_URL` no `.env`):

```bash
npm run supabase:setup
```

(isso cria a tabela e envia `public/dados-loteamento.json` para a nuvem)

## 3. Realtime (recomendado)

Dashboard → **Database** → **Publications** → `supabase_realtime` → incluir tabela `loteamento_snapshot`.

(Se não habilitar, ainda funciona: cada aparelho carrega ao abrir e envia ao salvar.)

## 4. Variáveis no projeto

Copie `.env.example` para `.env`:

```bash
cp .env.example .env
```

Preencha:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Reinicie o dev server: `npm run dev`

Na **hospedagem** (Vercel, Netlify, etc.), configure as mesmas variáveis `VITE_*`.

## 5. Primeira carga

- Se a nuvem estiver vazia e o app tiver dados locais (ou `dados-loteamento.json`), sobe automaticamente na primeira abertura.
- Se a nuvem já tiver dados, o celular baixa ao abrir.

## Segurança

A política atual permite leitura/escrita com a chave **anon** (app privado). Para uso público na internet, restrinja com **Auth** ou Edge Functions.
