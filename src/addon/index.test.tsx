import { getBuildConditions } from '../index';
import { resetBuildConditionsStorage } from '../testing';
import {
    BUILD_CONDITIONS_GLOBAL_PREFIX,
    createBuildConditionsDecorator,
    createBuildConditionsGlobalTypes,
} from './index';

const addonConfig = {
    platform: { values: ['desktop', 'mobile'], defaultValue: 'desktop' },
    runtime: { values: ['client', 'server'], defaultValue: 'client', title: 'Runtime', icon: 'globe' },
} as const;

beforeEach(() => {
    resetBuildConditionsStorage();
});

describe('createBuildConditionsGlobalTypes', () => {
    it('создаёт toolbar-элемент на каждую группу', () => {
        const globalTypes = createBuildConditionsGlobalTypes(addonConfig);

        expect(globalTypes).toEqual({
            [`${BUILD_CONDITIONS_GLOBAL_PREFIX}platform`]: {
                name: 'platform',
                description: 'Build condition: platform',
                defaultValue: 'desktop',
                toolbar: {
                    icon: 'beaker',
                    items: [
                        { value: 'desktop', title: 'desktop' },
                        { value: 'mobile', title: 'mobile' },
                    ],
                    dynamicTitle: true,
                },
            },
            [`${BUILD_CONDITIONS_GLOBAL_PREFIX}runtime`]: {
                name: 'Runtime',
                description: 'Build condition: runtime',
                defaultValue: 'client',
                toolbar: {
                    icon: 'globe',
                    items: [
                        { value: 'client', title: 'client' },
                        { value: 'server', title: 'server' },
                    ],
                    dynamicTitle: true,
                },
            },
        });
    });
});

describe('createBuildConditionsDecorator', () => {
    it('устанавливает выбранные в toolbar условия перед рендером story', () => {
        const decorator = createBuildConditionsDecorator(addonConfig);

        const result = decorator(() => 'rendered', {
            globals: { [`${BUILD_CONDITIONS_GLOBAL_PREFIX}platform`]: 'mobile' },
        });

        expect(result).toBe('rendered');
        expect(getBuildConditions()).toEqual({ platform: 'mobile', runtime: 'client' });
    });

    it('использует значения по умолчанию, когда globals пусты', () => {
        const decorator = createBuildConditionsDecorator(addonConfig);

        decorator(() => null, {});

        expect(getBuildConditions()).toEqual({ platform: 'desktop', runtime: 'client' });
    });
});
