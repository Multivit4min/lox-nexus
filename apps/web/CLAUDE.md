# apps/web

Vue 3 (`<script setup lang="ts">`) + Vite + Tailwind v4 + shadcn-vue (components are copied in and
owned). Talks to the server only through `@lox-nexus/api` types. The Bus Inspector must stay
virtualized and responsive at 500 msg/s. Keep components small; the 200-line rule applies here too.
