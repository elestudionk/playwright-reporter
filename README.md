# @nkstudio/playwright-reporter

Reporter de Playwright que registra las corridas automáticas en nk.proof:

- **Casos:** cada test pasa a ser un caso del proyecto, dentro de la suite "Automatizados / archivo / describe".
- **Ejecución:** cada corrida pasa a ser una ejecución con el resultado de cada test, sus `test.step`, el error, la duración y la captura del fallo.

Los tests corren en GitHub Actions, en el repositorio del cliente.

## Puesta en marcha en un proyecto

1. **Tests:** escribí los tests con Playwright en `e2e/`. Usá `test.step("…")` para que cada paso aparezca en nk.proof.
2. **Reporter:** instalalo.

   ```bash
   npm i -D @playwright/test @nkstudio/playwright-reporter
   ```

3. **Config:** copiá `template/playwright.config.example.ts`, o agregá el reporter a tu config:

   ```ts
   reporter: [["list"], ["@nkstudio/playwright-reporter"]],
   use: { screenshot: "only-on-failure" },
   ```

4. **Token:** en nk.proof, entrá a Proyecto → Configuración → Automatización → **Generar token**.
5. **Secrets y variables:** en GitHub, en Settings → Secrets and variables → Actions:
   - secret `NKPROOF_TOKEN` (el token del paso 4)
   - variable `NKPROOF_URL`
   - los secrets que necesiten los tests
6. **Workflow:** copiá `template/nkproof.yml` a `.github/workflows/nkproof.yml`.
7. **Gate:** en GitHub, en Settings → Branches, protegé la rama de producción y marcá **e2e** como *required status check*. Si un test falla en el preview del PR, no se puede mergear.

## Claves de los casos

Cada test se identifica por `archivo › describe › título`. Si cambiás el título o lo movés, se crea un caso nuevo. Para mantener el mismo caso aunque cambie, fijale una clave:

```ts
test("Pedir licencia", { annotation: { type: "nkproof", description: "licencias-pedir" } }, async ({ page }) => {
  // …
});
```

Los tags (`{ tag: "@smoke" }`) se copian al caso.

## Variables

| Variable | Para qué |
| --- | --- |
| `NKPROOF_URL`, `NKPROOF_TOKEN` | Adónde reportar. Sin ellas el reporter no hace nada. |
| `NKPROOF_SOURCE` | `pr`, `deploy`, `schedule`, `dispatch` o `local`. |
| `NKPROOF_RUN_ID` | Una ejecución que nk.proof dejó en cola (botón Correr, programadas). |
| `NKPROOF_ENVIRONMENT`, `NKPROOF_PR`, `NKPROOF_BRANCH`, `NKPROOF_COMMIT`, `NKPROOF_BASE_URL` | Contexto de la corrida. Por defecto se toma de GitHub Actions. |

Si nk.proof no responde, el reporter solo avisa por consola: el resultado del job depende únicamente de los tests.
