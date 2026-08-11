import { setBuildConditions, switchBuildCondition } from 'build-conditions';
setBuildConditions({
    platform: 'desktop',
});
export const value = switchBuildCondition({
    desktop: () => 'desktop',
    mobile: () => 'mobile',
});
