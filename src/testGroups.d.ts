/**
 * Тестовые группы условий для юнит-тестов пакета.
 *
 * Declaration merging действует на весь пакет при локальном тайпчеке,
 * но не попадает в программы потребителей — файл не импортируется
 * ни из одного entrypoint'а.
 */
import './index';

declare module './index' {
    interface BuildConditionGroups {
        platform: 'desktop' | 'mobile';
        runtime: 'server' | 'client';
    }
}
