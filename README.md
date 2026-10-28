# @nkstudio/playwright-reporter

Reporter de Playwright que registra las corridas automáticas en nk.proof:

- **Tests:** cada corrida le avisa a nk.proof qué tests existen y cómo les fue. Aparecen en Proyecto → Configuración → Tests automatizados.
- **Casos:** son manuales por defecto. Un test se puede **vincular** a un caso (ver abajo); el caso muestra el tag "Automatizado" y se puede correr desde nk.proof.
- **Ejecución:** cada corrida pasa a ser una ejecución con el resultado de cada test vinculado, sus `test.step`, el error, la duración y la captura del fallo.

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

## Pasos del test = pasos del caso

Escribí cada caso con la guía de [docs/qa-guia-casos.md](../../docs/qa-guia-casos.md). En el test vinculado:

- **Cada paso del caso es un `test.step`** con exactamente el mismo texto que la acción del paso.
- **Cada resultado esperado del paso es un `expect`** dentro de ese `test.step`.
- **Nada de más ni de menos:** ninguna verificación que no esté en el caso, y ningún paso del caso sin su `test.step`.

Cuando coinciden, la ejecución en nk.proof muestra los pasos del caso con su resultado esperado, marcados por la automatización. Si no coinciden, muestra los pasos del test.

## Vincular tests a casos

Cada test se identifica por `archivo › describe › título`. Hay dos formas de vincularlo a un caso:

- **Desde nk.proof:** en el panel "Automatización" del caso, elegí el test y tocá **Vincular**. Para un test sin caso, también podés usar **Crear caso** en Configuración.
- **Desde el código:** poné el código del caso en la anotación `nkproof`, y en la próxima corrida queda vinculado. También sirve una clave propia y fija (ej. `"ingreso.iniciar-sesion"`), que después vinculás desde nk.proof: así el vínculo sobrevive aunque cambies el título del test.

```ts
test("Pedir licencia", { annotation: { type: "nkproof", description: "HR-TC-012" } }, async ({ page }) => {
  // …
});
```

Si renombrás o movés un test vinculado desde nk.proof, su clave cambia y hay que volver a vincularlo. Con la anotación, el vínculo no se pierde.

## Correr desde nk.proof

En desarrollo, los botones **Correr** del caso, de la suite y de Ejecuciones hacen el build de producción y lanzan Playwright en tu compu, solo con los tests vinculados. La carpeta se configura en Configuración → Tests automatizados. La ejecución aparece "En cola", pasa a "Corriendo" y se actualiza sola. En producción el mismo botón va a disparar este workflow en GitHub Actions.

Playwright corre los tests elegidos con `archivo:línea`, y las dependencias (como un proyecto `setup` que inicia sesión) se corren igual.

## Variables

| Variable | Para qué |
| --- | --- |
| `NKPROOF_URL`, `NKPROOF_TOKEN` | Adónde reportar. Sin ellas el reporter no hace nada. |
| `NKPROOF_SOURCE` | `pr`, `deploy`, `schedule`, `dispatch` o `local`. |
| `NKPROOF_RUN_ID` | Una ejecución que nk.proof dejó en cola (botón Correr, programadas). |
| `NKPROOF_ENVIRONMENT`, `NKPROOF_PR`, `NKPROOF_BRANCH`, `NKPROOF_COMMIT`, `NKPROOF_BASE_URL` | Contexto de la corrida. Por defecto se toma de GitHub Actions. |

Si nk.proof no responde, el reporter solo avisa por consola: el resultado del job depende únicamente de los tests.
