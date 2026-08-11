import { switchBuildCondition } from 'build-conditions';
import { desktopImpl, mobileImpl, sharedHelper } from './impl';
export const impl = switchBuildCondition({
    desktop: desktopImpl,
    mobile: mobileImpl,
});
export const helper = sharedHelper;
