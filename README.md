# build-conditions

Разделение кода по произвольным условиям на этапе сборки: вместо жёстко
зашитых платформ — расширяемые группы условий (`platform`, `runtime`,
A/B-эксперименты сборок и т.д.).

## Группы условий

Группы объявляются через declaration merging. Значения условий должны быть
уникальны между всеми группами — разрешение значения в группу идёт по самому
значению:

```typescript
declare module 'build-conditions' {
    interface BuildConditionGroups {
        platform: 'desktop' | 'mobile';
        runtime: 'server' | 'client';
    }
}
```

## Хелперы

```typescript
import { switchBuildCondition, isBuildConditions } from 'build-conditions';
import DesktopComponent from './Component@desktop';
import MobileComponent from './Component@mobile';

// Выбор значения (функции или объекты; default — ветка по умолчанию)
export const Component = switchBuildCondition({
    desktop: DesktopComponent,
    mobile: MobileComponent,
});

// Проверка условий (массив — все должны быть активны)
if (isBuildConditions(['desktop', 'client'])) {
    // код только для десктопного клиентского бандла
}
```

Хелперы работают в runtime без сборки: `switchBuildCondition` возвращает
обёртку (HOC для функций, Proxy для объектов), выбирающую ветку при каждом
обращении. SWC-плагин — оптимизация: при сборке с зафиксированными условиями
инлайнит совпавшую ветку и удаляет мёртвые ветки вместе с их импортами.

## Хранилище условий

Текущие условия для runtime-режима читаются из подменяемого хранилища
(`getBuildConditions` бросает ошибку, если условия не установлены):

- **Браузер, тесты, Storybook** — дефолтное хранилище на
  `globalThis.__BUILD_CONDITIONS__`, условия устанавливаются через
  `setBuildConditions({ platform: 'desktop' })`.
- **Сервер (SSR)** — пакет не тянет `node:async_hooks`: сервис сам регистрирует
  хранилище поверх своего `AsyncLocalStorage` и задаёт условия per-request:

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';
import { setBuildConditionsStorage, type PartialBuildConditions } from 'build-conditions';

const als = new AsyncLocalStorage<PartialBuildConditions>();

// один раз при старте сервера; set не задан — setBuildConditions на сервере
// бросит ошибку, условия задаются только через als.run
setBuildConditionsStorage({ get: () => als.getStore() });

// в обработчике запроса
als.run({ platform: detectPlatform(req), runtime: 'server' }, () => {
    const html = renderToString(<App />);
    res.send(html);
});
```

## SWC-плагин

Entrypoint `build-conditions/swc-plugin` — WASM-плагин
(`swc-plugin/`, Rust, версия `swc_core` должна быть совместима с plugin
runner'ом swc целевого бандлера). Конфигурация — полный состав групп плюс выбранное значение
каждой группы либо `null` (группа переключается в runtime и не трансформируется):

```json
{
    "groups": {
        "platform": ["desktop", "mobile"],
        "runtime": ["server", "client"]
    },
    "conditions": {
        "platform": "desktop",
        "runtime": "client"
    }
}
```

Плагин разрешает значение условия в группу по `groups`, поэтому:

- аргументы хелперов обязаны быть литералами (строка или массив строк,
  карта веток — объектный литерал); динамическая передача — ошибка сборки,
  для runtime-логики используйте `getBuildConditions`;
- значение, не найденное ни в одной группе, — ошибка сборки (ловит опечатки);
- мёртвые ветки `if (isBuildConditions(...))` (включая `!`-отрицание и
  else-if цепочки) вырезаются вместе со ставшими ненужными импортами;
  исключение — ветки с `var`-декларациями (hoisting), они остаются
  как `if (false)` и удаляются минификатором.

Пересборка wasm: `pnpm run build:swc-plugin` (нужен Rust с таргетом
`wasm32-wasip1`), тесты: `pnpm run unit:swc-plugin`.

## Storybook

Декоратор для story:

```typescript
import { withBuildConditions } from 'build-conditions/testing';

export default {
    decorators: [withBuildConditions({ platform: 'desktop', runtime: 'client' })],
};
```

Переключение условий в toolbar — аддон `build-conditions/storybook-addon`:

```typescript
// .config/storybook/preview.ts
import {
    createBuildConditionsGlobalTypes,
    createBuildConditionsDecorator,
} from 'build-conditions/storybook-addon';

const conditionsConfig = {
    platform: { values: ['desktop', 'mobile'], defaultValue: 'desktop' },
} as const;

export const globalTypes = createBuildConditionsGlobalTypes(conditionsConfig);
export const decorators = [createBuildConditionsDecorator(conditionsConfig)];
```
