import { AsyncLocalStorage } from 'node:async_hooks';

import type { PartialBuildConditions } from './index';
import { getBuildConditions, isBuildConditions, setBuildConditions, setBuildConditionsStorage } from './index';
import { resetBuildConditionsStorage } from './testing';

// Возврат к дефолтному хранилищу, чтобы тесты не зависели от порядка выполнения
beforeEach(() => {
    resetBuildConditionsStorage();
});

describe('дефолтное хранилище (globalThis)', () => {
    it('getBuildConditions бросает ошибку, если условия не установлены', () => {
        expect(() => getBuildConditions()).toThrow('условия сборки не установлены');
    });

    it('setBuildConditions пишет в globalThis.__BUILD_CONDITIONS__', () => {
        setBuildConditions({ platform: 'desktop' });

        expect(globalThis.__BUILD_CONDITIONS__).toEqual({ platform: 'desktop' });
        expect(getBuildConditions()).toEqual({ platform: 'desktop' });
    });

    it('повторный setBuildConditions мерджит условия', () => {
        setBuildConditions({ platform: 'desktop', runtime: 'client' });
        setBuildConditions({ platform: 'mobile' });

        expect(getBuildConditions()).toEqual({ platform: 'mobile', runtime: 'client' });
    });
});

describe('setBuildConditionsStorage', () => {
    it('подменяет источник условий для всех хелперов', () => {
        setBuildConditionsStorage({ get: () => ({ platform: 'mobile' }) });

        expect(getBuildConditions()).toEqual({ platform: 'mobile' });
        expect(isBuildConditions('mobile')).toBe(true);
    });

    it('setBuildConditions бросает ошибку, если хранилище не поддерживает запись', () => {
        setBuildConditionsStorage({ get: () => ({ platform: 'desktop' }) });

        expect(() => setBuildConditions({ platform: 'mobile' })).toThrow(
            'хранилище не поддерживает setBuildConditions'
        );
    });

    it('хранилище на AsyncLocalStorage изолирует условия конкурентных вызовов', async () => {
        const als = new AsyncLocalStorage<PartialBuildConditions>();
        setBuildConditionsStorage({ get: () => als.getStore() });

        const nextTick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

        const run = (conditions: PartialBuildConditions) =>
            als.run(conditions, async () => {
                await nextTick();
                const first = getBuildConditions();
                await nextTick();
                const second = getBuildConditions();

                return { first, second };
            });

        const [desktop, mobile] = await Promise.all([
            run({ platform: 'desktop', runtime: 'server' }),
            run({ platform: 'mobile', runtime: 'server' }),
        ]);

        expect(desktop.first).toEqual({ platform: 'desktop', runtime: 'server' });
        expect(desktop.second).toEqual({ platform: 'desktop', runtime: 'server' });
        expect(mobile.first).toEqual({ platform: 'mobile', runtime: 'server' });
        expect(mobile.second).toEqual({ platform: 'mobile', runtime: 'server' });
    });

    it('вне AsyncLocalStorage.run условия считаются неустановленными', () => {
        const als = new AsyncLocalStorage<PartialBuildConditions>();
        setBuildConditionsStorage({ get: () => als.getStore() });

        expect(() => getBuildConditions()).toThrow('условия сборки не установлены');
    });
});

describe('resetBuildConditionsStorage', () => {
    it('возвращает дефолтное хранилище и очищает условия', () => {
        setBuildConditions({ platform: 'desktop' });
        setBuildConditionsStorage({ get: () => ({ platform: 'mobile' }) });

        resetBuildConditionsStorage();

        expect(() => getBuildConditions()).toThrow('условия сборки не установлены');

        // Дефолтное хранилище снова активно — прямая запись работает
        setBuildConditions({ runtime: 'client' });
        expect(getBuildConditions()).toEqual({ runtime: 'client' });
    });
});
