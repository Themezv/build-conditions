import { switchBuildCondition } from 'build-conditions';
import DesktopComponent from './Component@desktop';
import MobileComponent from './Component@mobile';
export const Component = switchBuildCondition({
    desktop: DesktopComponent,
    mobile: MobileComponent,
});
