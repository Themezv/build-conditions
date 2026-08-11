import type { BuildConditionsStorage, PartialBuildConditions } from './types';

declare global {
    var __BUILD_CONDITIONS__: PartialBuildConditions | undefined;
}

/**
 * Дефолтное хранилище — глобальная переменная. Подходит для браузера, тестов
 * и Storybook: в одном контексте одновременно существует один набор условий.
 */
const defaultStorage: BuildConditionsStorage = {
    get: () => globalThis.__BUILD_CONDITIONS__,
    set: conditions => {
        globalThis.__BUILD_CONDITIONS__ = { ...globalThis.__BUILD_CONDITIONS__, ...conditions };
    },
};

let storage: BuildConditionsStorage = defaultStorage;

/** Подменяет хранилище условий. Вызывается один раз при инициализации окружения */
export function setBuildConditionsStorage(customStorage: BuildConditionsStorage): void {
    storage = customStorage;
}

/**
 * Тестовый хелпер: возвращает дефолтное хранилище и очищает установленные
 * условия, чтобы тесты не зависели от порядка выполнения. Экспортируется
 * только из entrypoint'а `testing`.
 */
export function resetBuildConditionsStorage(): void {
    storage = defaultStorage;
    delete globalThis.__BUILD_CONDITIONS__;
}

/** Устанавливает условия в текущее хранилище (дефолтное — глобальная переменная) */
export function setBuildConditions(conditions: PartialBuildConditions): void {
    if (!storage.set) {
        throw new Error(
            'build-conditions: текущее хранилище не поддерживает setBuildConditions. ' +
                'Устанавливайте условия средствами самого хранилища (например, через AsyncLocalStorage.run на сервере)'
        );
    }

    storage.set(conditions);
}

/**
 * Возвращает текущие активные условия.
 *
 * Если условия не установлены — бросает ошибку: это защита от вызова
 * runtime-хелперов до инициализации условий (нет setup-файла в тестах,
 * декоратора в Storybook или регистрации хранилища на сервере).
 */
export function getBuildConditions(): PartialBuildConditions {
    const conditions = storage.get();

    if (!conditions || Object.keys(conditions).length === 0) {
        throw new Error(
            'build-conditions: условия сборки не установлены. ' +
                'Вызовите setBuildConditions (браузер, тесты, Storybook) ' +
                'или зарегистрируйте хранилище через setBuildConditionsStorage (сервер)'
        );
    }

    return conditions;
}
