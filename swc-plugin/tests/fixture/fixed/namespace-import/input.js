import * as buildConditions from 'build-conditions';
import DesktopHeader from './Header@desktop';
import MobileHeader from './Header@mobile';
export const Header = buildConditions.switchBuildCondition({
    desktop: DesktopHeader,
    mobile: MobileHeader,
});
