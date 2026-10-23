# lox-nexus

Automatisch in einem Coder-Workspace erzeugt (Node LTS + TypeScript, ausgefuehrt via tsx).

## Loslegen

    npm install
    npm run dev

## Scripts

- npm run dev       Startet src/index.ts im Watch-Modus (tsx)
- npm run start     Fuehrt src/index.ts einmalig aus
- npm run lint      ESLint (Flat Config, ohne Semikolons)
- npm run lint:fix  ESLint mit Autofix
- npm run typecheck Typcheck ohne Emit (tsc --noEmit)
- npm test          Tests via node --test (tsx-Loader)
- npm run build     Kompiliert nach dist/ (tsc)
