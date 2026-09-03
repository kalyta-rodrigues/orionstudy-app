# OrionStudy

Aplicativo pessoal de acompanhamento de estudos, composto por três páginas HTML estáticas (HTML, CSS e JavaScript puro), sem build, framework ou backend. O progresso é salvo no `localStorage` do navegador.

## Páginas

- `plano-estudos.html` — trilhas de estudo, tarefas, projetos, progresso e rotina semanal.
- `cronograma.html` — calendário de aulas, acompanhamento de conclusão e importação manual de arquivos de aulas.
- `biblioteca.html` — biblioteca de fontes, matérias, cursos e ordem de estudo.

As páginas se conectam entre si pelo menu. O app também funciona abrindo os arquivos HTML diretamente no navegador para os recursos locais.

## Como usar

Publique estes arquivos em uma origem HTTP/HTTPS, como GitHub Pages, ou sirva-os localmente com um servidor estático. O `localStorage` é isolado por origem: arquivos abertos com `file://`, um `localhost` e um site publicado não compartilham o mesmo progresso.

## Backup e restauração local

A barra no canto inferior esquerdo está disponível nas três páginas:

- **Backup** baixa um arquivo JSON com todo o progresso desta origem.
- **Restaurar** lê um arquivo JSON, confirma a substituição dos dados atuais e recarrega a página.

O formato do arquivo é:

```json
{
  "_app": "OrionStudy",
  "_version": 1,
  "_exportedAt": "...",
  "data": {}
}
```

## Tema

Use o botão de tema na barra inferior para alternar entre claro e escuro. A preferência fica salva em `localStorage` e vale para as três páginas.

## Backup no Google Drive

O botão **Conectar Google Drive** usa o Google Identity Services com o escopo restrito `https://www.googleapis.com/auth/drive.file`. O app cria e atualiza um único arquivo em `OrionStudy/orionstudy-backup.json` e tenta fazer backup automaticamente a cada 12 horas enquanto uma página estiver aberta.

Para configurar:

1. Crie no Google Cloud Console um cliente OAuth do tipo Web.
2. Cadastre a origem HTTP/HTTPS do app em origens JavaScript autorizadas.
3. Preencha `GOOGLE_CLIENT_ID` no topo de `shared.js` com o Client ID gerado.
4. Abra o app pela mesma origem cadastrada e clique em **Conectar Google Drive**.

O fluxo client-side não usa client secret. O script do Google só é carregado quando o recurso do Drive é usado. Se o token expirar, o backup automático tenta renová-lo silenciosamente e registra a falha sem interromper o app.

`file://` não é uma origem OAuth válida para essa integração; nesse modo, o backup local continua funcionando, mas o Google Drive não.

## Estrutura

```text
plano-estudos.html
cronograma.html
biblioteca.html
shared.js
README.md
```
