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

   En cada PR, el workflow espera hasta 15 minutos el deploy preview y corre los tests contra esa URL:
   - **Vercel:** lo toma del deployment que Vercel crea en GitHub.
   - **Netlify:** lo toma del estado `netlify/<sitio>/deploy-preview` del commit (`https://deploy-preview-<PR>--<sitio>.netlify.app`).

   Si el preview falla o no llega a tiempo, el check queda en rojo.

## Escribir los tests

Importá `test` y `expect` de `@nkstudio/playwright-reporter/test`, no de `@playwright/test`. Es el mismo `test` de Playwright, con dos agregados:

- **Sin las barras de los deploy previews.** Los tests no cargan el Netlify Drawer ni la Vercel Toolbar: no son parte de la app y mantienen la red ocupada.
- **`openPage(url)` y `reloadPage()`.** Abren o recargan la página y esperan a que esté lista para usar. Usalos en lugar de `page.goto` y `page.reload`.

```ts
import { expect, test } from "@nkstudio/playwright-reporter/test";

test("Pedir licencia", async ({ page, openPage }) => {
  await test.step("Abrir «Licencias»", async () => {
    await openPage("/licencias");
    await expect(page.getByRole("heading", { name: "Licencias" })).toBeVisible();
  });
});
```

**No uses `waitForLoadState("networkidle")`.** Playwright lo desaconseja: espera a que la red quede quieta, y cualquier pedido que siga (analytics, un chat de soporte, un pedido periódico) lo cuelga. Para saber que algo cargó, verificá lo que se ve en pantalla con `expect`.

**Página lista (opcional).** Si la app marca cuándo responde a los clicks, poné ese selector en `readySelector` de la config y `openPage` lo espera. En una app de Next.js alcanza con un componente cliente en el layout raíz que, en un `useEffect`, haga `document.documentElement.dataset.hydrated = "true"`, y `readySelector: "html[data-hydrated]"`. Sin `readySelector`, `openPage` espera a que la página cargue. El código de los tests es el mismo en los dos casos.

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

Los botones **Correr** del caso, de la suite y de Ejecuciones corren solo los tests vinculados. La ejecución aparece "En cola", pasa a "Corriendo" y se actualiza sola.

- **En producción** nk.proof dispara este workflow en GitHub Actions con la GitHub App de nk.studio. En Configuración → Repositorio de GitHub cargá el owner, el repo, el workflow, la rama y la URL base, e instalá la App en el repo (permiso *Actions: lectura y escritura*). El workflow recibe `base_url`, `nkproof_run_id`, `source` y `grep` (los tests elegidos), y el reporter toma la ejecución en cola con el `NKPROOF_TOKEN` del repo: ningún token viaja por los inputs, que quedan en los logs.
- **En desarrollo**, si configurás la carpeta local en Configuración → Tests automatizados, nk.proof hace el build de producción y lanza Playwright en tu compu con `archivo:línea`. Las dependencias (como un proyecto `setup` que inicia sesión) se corren igual.

Las **programaciones** (Configuración → Programaciones) disparan el mismo workflow todos los días, semanas o meses, con un plan, un filtro `grep` o todo el proyecto. Las ejecuciones que quedan en cola o corriendo sin novedades por más de 60 minutos se cierran con error.

## Variables

| Variable | Para qué |
| --- | --- |
| `NKPROOF_URL`, `NKPROOF_TOKEN` | Adónde reportar. Sin ellas el reporter no hace nada. |
| `NKPROOF_SOURCE` | `pr`, `deploy`, `schedule`, `dispatch` o `local`. |
| `NKPROOF_RUN_ID` | Una ejecución que nk.proof dejó en cola (botón Correr, programadas). |
| `NKPROOF_ENVIRONMENT`, `NKPROOF_PR`, `NKPROOF_BRANCH`, `NKPROOF_COMMIT`, `NKPROOF_BASE_URL` | Contexto de la corrida. Por defecto se toma de GitHub Actions. |

Si nk.proof no responde, el reporter solo avisa por consola: el resultado del job depende únicamente de los tests.
