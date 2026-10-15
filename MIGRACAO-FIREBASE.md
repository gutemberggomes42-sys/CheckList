# Migração para Firebase

## Preparar o Firebase

1. No projeto `checklist-e7644`, crie o banco Cloud Firestore em modo de produção.
2. Em Authentication, habilite o provedor **Email/senha**.
3. Publique `firestore.rules` na aba **Firestore > Regras**. Com o Firebase CLI instalado, este diretório já está associado ao projeto: execute `firebase deploy --only firestore:rules`.
4. Cadastre primeiro o administrador `gutemberggg10@gmail.com` pelo formulário do aplicativo.

## Copiar registros existentes

1. Abra `migrate-supabase-data.html` pelo mesmo host do aplicativo (HTTP/HTTPS; não abra como `file://`).
2. Informe uma conta que consiga ler as tabelas antigas do Supabase e a conta administradora do Firebase.
3. Execute a cópia e confira o total registrado para cada coleção.
4. Remova `migrate-supabase-data.html` quando a cópia estiver concluída.

A ferramenta copia `inspections`, `irrig_inspections`, `equipments`, `system_events`, `users`, `usuarios`, `calibragem`, `controle_3p` e `access_controls`, preservando os IDs sempre que existirem. Se as regras de leitura do Supabase bloquearem a conta informada, será necessário exportar as tabelas do Supabase e importá-las no Firestore.

## Contas

O Firebase não importa senhas de usuários do Supabase. Cada pessoa deve criar uma conta Firebase com o mesmo email; depois o administrador aprova a conta novamente no painel. O aplicativo mantém o login em Firebase Authentication e os dados em Firestore.
